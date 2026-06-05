import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const ML_URL = process.env.ML_URL || 'http://ml:5000';

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
  } catch (err) {
    console.error('Recommendations error:', err.message);
    res.json({ movies: [], strategy: 'unavailable' });
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
