import { Router } from 'express';
import multer from 'multer';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const TMDB_BASE = 'https://api.themoviedb.org/3';
const tmdbGet = async path => {
  try {
    const r = await fetch(`${TMDB_BASE}${path}`, {
      headers: { Authorization: `Bearer ${process.env.TMDB_API_TOKEN}` },
    });
    return r.ok ? r.json() : null;
  } catch { return null; }
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const MAX_TMDB_CALLS = 80; // cap API calls per import to bound response time

// ── CSV parser (handles quoted fields and escaped quotes) ─────────────────────
function parseCSV(text) {
  const rows = [];
  for (const line of text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    if (!line.trim()) continue;
    const fields = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === ',' && !inQ) { fields.push(cur); cur = ''; }
      else cur += c;
    }
    fields.push(cur);
    rows.push(fields);
  }
  return rows;
}

// ── Format detection from CSV headers ─────────────────────────────────────────
// Letterboxd ratings.csv  : Date, Name, Year, Letterboxd URI, Rating
// Letterboxd diary.csv    : Date, Name, Year, Letterboxd URI, Rating, Rewatch, Tags, Watched Date
// Letterboxd watchlist.csv: Date, Name, Year, Letterboxd URI
// IMDb ratings.csv        : Const, Your Rating, Date Rated, Title, URL, Title Type, ...
// IMDb watchlist.csv      : Position, Const, Created, Modified, Description, Title, ...
function detectFormat(headers) {
  const h = headers.map(s => s.trim().toLowerCase());
  if (h.includes('const')) return h.includes('position') ? 'imdb_watchlist' : 'imdb_ratings';
  if (h.includes('name') && h.includes('year')) {
    if (h.includes('watched date') || h.includes('rewatch')) return 'lb_diary';
    if (h.includes('rating')) return 'lb_ratings';
    return 'lb_watchlist';
  }
  return null;
}

// ── Per-row normalisation ─────────────────────────────────────────────────────
// Letterboxd uses 0.5–5.0 stars → multiply by 2 for our 1–10 scale
const lbScore = r => (r ? Math.min(10, Math.max(1, Math.round(parseFloat(r) * 2))) : null);
const normTitle = t => (t || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

function rowToEntry(format, obj) {
  if (format === 'lb_ratings') return {
    title: obj['Name'], year: parseInt(obj['Year']),
    score: lbScore(obj['Rating']), imdbId: null, addToWatchlist: !obj['Rating'],
  };
  if (format === 'lb_watchlist') return {
    title: obj['Name'], year: parseInt(obj['Year']),
    score: null, imdbId: null, addToWatchlist: true,
  };
  if (format === 'lb_diary') return {
    title: obj['Name'], year: parseInt(obj['Year']),
    score: lbScore(obj['Rating']), imdbId: null, addToWatchlist: false,
  };
  if (format === 'imdb_ratings') return {
    title: obj['Title'], year: parseInt(obj['Year']),
    score: parseInt(obj['Your Rating']), imdbId: obj['Const'], addToWatchlist: false,
  };
  if (format === 'imdb_watchlist') return {
    title: obj['Title'], year: parseInt(obj['Year']),
    score: null, imdbId: obj['Const'], addToWatchlist: true,
  };
  return null;
}

// ── POST /api/import ──────────────────────────────────────────────────────────
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const text = req.file.buffer.toString('utf-8');
  const rows = parseCSV(text);
  if (rows.length < 2) return res.status(400).json({ error: 'File is empty.' });

  const headers = rows[0];
  const format  = detectFormat(headers);
  if (!format) return res.status(400).json({
    error: 'Unrecognised format. Upload a Letterboxd ratings.csv / diary.csv / watchlist.csv or an IMDb ratings.csv / watchlist.csv.',
  });

  const toObj = fields => Object.fromEntries(headers.map((h, i) => [h.trim(), (fields[i] ?? '').trim()]));

  const entries = rows.slice(1)
    .map(r => rowToEntry(format, toObj(r)))
    .filter(e => e?.title && !isNaN(e.year));

  if (!entries.length) return res.status(400).json({ error: 'No valid rows found.' });

  // Load full movie catalog once for fast in-memory matching
  const { rows: catalog } = await pool.query(
    'SELECT id, tmdb_id, COALESCE(runtime, 100) AS runtime, LOWER(title) AS ltitle, year FROM movies'
  );
  const byTitleYear = new Map(catalog.map(m => [`${normTitle(m.ltitle)}_${m.year}`, m]));
  const byTmdbId    = new Map(catalog.map(m => [m.tmdb_id, m]));

  const userId      = req.user.id;
  const results     = [];
  const toRate      = [];
  const toWatch     = [];
  const toWatchlist = [];
  let   tmdbCalls   = 0;

  for (const entry of entries) {
    let dbRow = byTitleYear.get(`${normTitle(entry.title)}_${entry.year}`);

    // TMDB fallback for unmatched rows
    if (!dbRow && tmdbCalls < MAX_TMDB_CALLS) {
      let tmdbId = null;
      await sleep(260); // stay safely under 40 req / 10 s TMDB limit

      if (entry.imdbId?.startsWith('tt')) {
        tmdbCalls++;
        const found = await tmdbGet(`/find/${entry.imdbId}?external_source=imdb_id`);
        tmdbId = found?.movie_results?.[0]?.id ?? null;
      }

      if (!tmdbId) {
        tmdbCalls++;
        const q    = encodeURIComponent(entry.title);
        const yr   = entry.year ? `&year=${entry.year}` : '';
        const data = await tmdbGet(`/search/movie?query=${q}${yr}&include_adult=false`);
        tmdbId     = data?.results?.[0]?.id ?? null;
      }

      if (tmdbId) dbRow = byTmdbId.get(tmdbId);
    }

    if (!dbRow) {
      results.push({ title: entry.title, year: entry.year, status: 'not_found', score: entry.score });
      continue;
    }

    if (entry.addToWatchlist) {
      toWatchlist.push(dbRow.id);
      results.push({ title: entry.title, year: entry.year, status: 'watchlist', score: null });
    } else {
      toRate.push({ movieId: dbRow.id, score: entry.score });
      toWatch.push({ movieId: dbRow.id, runtimeS: dbRow.runtime * 60 });
      results.push({ title: entry.title, year: entry.year, status: 'rated', score: entry.score });
    }
  }

  // Insert ratings (trigger auto-updates avg_rating on movies)
  let importedRatings = 0, skippedRatings = 0;
  for (const { movieId, score } of toRate) {
    const r = await pool.query(
      'INSERT INTO ratings (user_id, movie_id, score) VALUES ($1,$2,$3) ON CONFLICT (user_id, movie_id) DO NOTHING',
      [userId, movieId, score]
    );
    r.rowCount > 0 ? importedRatings++ : skippedRatings++;
  }

  // Insert watch history — treated as fully watched (95% progress)
  for (const { movieId, runtimeS } of toWatch) {
    await pool.query(
      `INSERT INTO watch_history (user_id, movie_id, progress_s)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, movie_id) DO UPDATE
         SET progress_s = GREATEST(watch_history.progress_s, EXCLUDED.progress_s),
             updated_at = NOW()`,
      [userId, movieId, Math.round(runtimeS * 0.95)]
    );
  }

  // Insert watchlist
  let importedWatchlist = 0;
  for (const movieId of toWatchlist) {
    const r = await pool.query(
      'INSERT INTO watchlist (user_id, movie_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [userId, movieId]
    );
    if (r.rowCount > 0) importedWatchlist++;
  }

  res.json({
    format,
    summary: {
      total:             entries.length,
      ratings_imported:  importedRatings,
      ratings_skipped:   skippedRatings,
      watchlist_added:   importedWatchlist,
      not_found:         results.filter(r => r.status === 'not_found').length,
      tmdb_lookups:      tmdbCalls,
    },
    results,
  });
});

export default router;
