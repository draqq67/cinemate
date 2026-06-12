import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import OpenAI from 'openai';

const router  = Router();
const ML_URL  = process.env.ML_URL || 'http://ml:5000';
const openai  = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const SYSTEM_PROMPT = `You are a movie recommendation assistant. Parse the user's natural language query (any language) and extract structured search parameters.

Return ONLY a valid JSON object with exactly these fields:
{
  "moods": [],           // subset of: atmospheric, mind-bending, feel-good, tense, dark, emotional, funny, epic, scary, romantic, thought-provoking, cult-classic
  "genres": [],          // subset of: Action, Adventure, Animation, Comedy, Crime, Documentary, Drama, Fantasy, History, Horror, Mystery, Romance, Science Fiction, Thriller, War, Western
  "duration": "any",     // one of: short (<45min), medium (45-120min), long (>120min), any
  "context": "solo",     // one of: solo, friends, date, family
  "exclude_moods": [],   // moods to avoid (same list as moods)
  "similar_to": null,    // movie title if user said "like X" or "similar to X", else null
  "explanation": ""      // 1-sentence explanation of what you understood, in the SAME language the user wrote in
}

Rules:
- Translate mood concepts intelligently ("relaxing" → feel-good, "thrilling" → tense, "mind-bending" → mind-bending)
- "short" means under 45 minutes, "quick" or "episode-length" also maps to short
- "for kids/children/family" → context: family
- "for a date" / "romantic evening" → context: date
- "with friends" → context: friends
- "without violence/gore" → exclude_moods: [tense]
- "not sad/depressing" → exclude_moods: [dark, emotional]
- Always return valid JSON, never add explanation outside the JSON`;

async function parseNaturalQuery(query) {
  if (!openai) throw new Error('OpenAI API key not configured');

  const response = await openai.chat.completions.create({
    model:       'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: query },
    ],
    response_format: { type: 'json_object' },
  });

  return JSON.parse(response.choices[0].message.content);
}

// ── Shared helper: fetch full movie rows for a list of tmdb_ids ───────────────
async function fetchMoviesByIds(tmdbIds) {
  if (!tmdbIds.length) return [];
  const placeholders = tmdbIds.map((_, i) => `$${i + 1}`).join(',');
  const { rows } = await pool.query(
    `SELECT
       m.tmdb_id, m.title, m.poster_path,
       m.year, m.vote_average, m.avg_rating, m.rating_count, m.popularity,
       array_agg(DISTINCT g.name) FILTER (WHERE g.name IS NOT NULL) AS genres
     FROM movies m
     LEFT JOIN movie_genres mg ON mg.tmdb_id = m.tmdb_id
     LEFT JOIN genres        g ON g.id        = mg.genre_id
     WHERE m.tmdb_id IN (${placeholders})
     GROUP BY m.tmdb_id, m.title, m.poster_path,
              m.year, m.vote_average, m.avg_rating, m.rating_count, m.popularity`,
    tmdbIds
  );
  // Preserve ML ordering
  const map = Object.fromEntries(rows.map(r => [r.tmdb_id, r]));
  return tmdbIds.map(id => map[id]).filter(Boolean);
}

// ── GET /api/recommendations — personalised feed (auth required) ──────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const mlRes = await fetch(`${ML_URL}/recommend/${req.user.id}?limit=12`);
    if (!mlRes.ok) throw new Error(`ML ${mlRes.status}`);

    const { recommendations, strategy } = await mlRes.json();
    const movies = await fetchMoviesByIds(recommendations || []);
    res.json({ movies, strategy });

    // Log impressions asynchronously — don't block the response
    if (recommendations?.length) {
      const rows = recommendations.map(tmdbId => `('${req.user.id}', ${tmdbId}, '${strategy}')`).join(',');
      pool.query(`INSERT INTO recommendation_impressions (user_id, tmdb_id, strategy) VALUES ${rows}`)
        .catch(() => {});
    }
  } catch (err) {
    console.error('Recommendations error:', err.message);
    res.json({ movies: [], strategy: 'unavailable' });
  }
});

// ── GET /api/recommendations/mood-context — advanced wizard ───────────────────
router.get('/mood-context', async (req, res) => {
  try {
    const { moods = '', duration = 'any', context = 'solo', exclude_moods = '', genre = '', user_id, limit = 15 } = req.query;
    const params = new URLSearchParams({ moods, duration, context, exclude_moods, genre, limit });
    if (user_id) params.set('user_id', user_id);
    const mlRes = await fetch(`${ML_URL}/mood-context?${params}`);
    if (!mlRes.ok) throw new Error(`ML ${mlRes.status}`);
    const { movies: ids, strategy, filters_applied } = await mlRes.json();
    const movies = await fetchMoviesByIds(ids || []);
    res.json({ movies, strategy, filters_applied });
  } catch (err) {
    console.error('Mood-context error:', err.message);
    res.json({ movies: [], strategy: 'unavailable', filters_applied: {} });
  }
});

// ── GET /api/recommendations/similar/:tmdbId — content-based similar ──────────
router.get('/similar/:tmdbId', async (req, res) => {
  try {
    const mlRes = await fetch(`${ML_URL}/similar/${req.params.tmdbId}?limit=6`);
    if (!mlRes.ok) throw new Error(`ML ${mlRes.status}`);

    const { similar } = await mlRes.json();
    const movies = await fetchMoviesByIds(similar || []);
    res.json({ movies });
  } catch (err) {
    console.error('Similar error:', err.message);
    res.json({ movies: [] });
  }
});

// ── GET /api/recommendations/moods — list available mood profiles ─────────────
router.get('/moods', async (_req, res) => {
  try {
    const mlRes = await fetch(`${ML_URL}/moods`);
    res.json(await mlRes.json());
  } catch {
    res.json({ moods: [] });
  }
});

// ── GET /api/recommendations/mood — mood-based movie discovery ────────────────
router.get('/mood', async (req, res) => {
  try {
    const { moods = '', genre = '', limit = 12 } = req.query;
    const mlRes = await fetch(
      `${ML_URL}/mood?moods=${encodeURIComponent(moods)}&genre=${encodeURIComponent(genre)}&limit=${limit}`
    );
    if (!mlRes.ok) throw new Error(`ML ${mlRes.status}`);
    const { movies: ids, moods: matched } = await mlRes.json();
    const movies = await fetchMoviesByIds(ids || []);
    res.json({ movies, moods: matched });
  } catch (err) {
    console.error('Mood error:', err.message);
    res.json({ movies: [], moods: [] });
  }
});

// ── POST /api/recommendations/natural-search — GPT-powered natural language ───
router.post('/natural-search', async (req, res) => {
  const { query } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: 'query is required' });
  if (!openai)        return res.status(503).json({ error: 'OPENAI_API_KEY not configured' });

  try {
    // 1. Parse natural language with GPT
    const parsed = await parseNaturalQuery(query.trim());

    const {
      moods         = [],
      genres        = [],
      duration      = 'any',
      context       = 'solo',
      exclude_moods = [],
      similar_to    = null,
      explanation   = '',
    } = parsed;

    let movies = [];
    let strategy = explanation;

    // 2a. "Similar to X" — find the movie and use genome similarity
    if (similar_to) {
      // Search local DB first
      const { rows: dbMatch } = await pool.query(
        `SELECT tmdb_id FROM movies WHERE title ILIKE $1 ORDER BY popularity DESC LIMIT 1`,
        [`%${similar_to}%`]
      );

      let tmdbId = dbMatch[0]?.tmdb_id;

      // Fallback: TMDB search
      if (!tmdbId && process.env.TMDB_API_TOKEN) {
        const tmdbRes = await fetch(
          `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(similar_to)}&include_adult=false`,
          { headers: { Authorization: `Bearer ${process.env.TMDB_API_TOKEN}` } }
        );
        const tmdbData = await tmdbRes.json();
        tmdbId = tmdbData.results?.[0]?.id;
      }

      if (tmdbId) {
        const mlRes = await fetch(`${ML_URL}/similar/${tmdbId}?limit=15`);
        if (mlRes.ok) {
          const { similar: ids } = await mlRes.json();
          movies = await fetchMoviesByIds(ids || []);
          strategy = explanation || `Similar to "${similar_to}"`;
        }
      }
    }

    // 2b. Mood + genre + duration filter via mood-context endpoint
    if (!movies.length) {
      const params = new URLSearchParams({
        moods:         moods.join(','),
        duration,
        context,
        exclude_moods: exclude_moods.join(','),
        genre:         genres.join(','),
        limit:         18,
      });
      if (req.user?.id) params.set('user_id', req.user.id);

      const mlRes = await fetch(`${ML_URL}/mood-context?${params}`);
      if (mlRes.ok) {
        const { movies: ids } = await mlRes.json();
        movies = await fetchMoviesByIds(ids || []);
      }
      if (!strategy) strategy = explanation || `${moods.join(', ')} (${duration})`;
    }

    res.json({ movies, parsed, strategy });
  } catch (err) {
    console.error('Natural search error:', err.message);
    res.status(500).json({ error: err.message.includes('API key') ? 'AI service not configured' : 'Search failed' });
  }
});

// ── GET /api/recommendations/user-genome — genome tag profile for current user ─
router.get('/user-genome', requireAuth, async (req, res) => {
  try {
    const mlRes = await fetch(`${ML_URL}/user-genome/${req.user.id}?n_tags=25`);
    if (!mlRes.ok) throw new Error(`ML ${mlRes.status}`);
    res.json(await mlRes.json());
  } catch (err) {
    res.json({ tags: [], distinctive_tags: [], n_liked: 0, n_with_genome: 0 });
  }
});

// ── GET /api/recommendations/health — ML service status (admin) ───────────────
router.get('/health', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  try {
    const mlRes = await fetch(`${ML_URL}/health`);
    res.json(await mlRes.json());
  } catch {
    res.json({ status: 'offline' });
  }
});

// ── POST /api/recommendations/refresh — retrain models (admin) ────────────────
router.post('/refresh', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  try {
    const mlRes = await fetch(`${ML_URL}/refresh`, { method: 'POST' });
    if (!mlRes.ok) throw new Error(`ML ${mlRes.status}`);
    res.json(await mlRes.json());
  } catch (err) {
    res.status(503).json({ error: 'ML service unavailable', detail: err.message });
  }
});

// ── GET /api/recommendations/evaluate — RMSE/MAE on held-out split (admin) ────
router.get('/evaluate', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  try {
    const mlRes = await fetch(`${ML_URL}/evaluate`);
    if (!mlRes.ok) throw new Error(`ML ${mlRes.status}`);
    res.json(await mlRes.json());
  } catch (err) {
    res.status(503).json({ error: 'ML service unavailable', detail: err.message });
  }
});

export default router;
