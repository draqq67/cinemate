import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  next();
};

// ── GET /api/admin/insights/top-movies ────────────────────────────────────────
router.get('/top-movies', requireAuth, adminOnly, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        m.tmdb_id, m.title, m.poster_path, m.year,
        COUNT(wh.movie_id)                                          AS watch_count,
        ROUND(AVG(wh.progress_s::numeric / NULLIF(m.runtime * 60, 0) * 100), 1) AS avg_completion_pct
      FROM watch_history wh
      JOIN movies m ON m.id = wh.movie_id
      WHERE m.runtime IS NOT NULL AND m.runtime > 0
      GROUP BY m.tmdb_id, m.title, m.poster_path, m.year
      ORDER BY watch_count DESC
      LIMIT 20
    `);
    res.json({ movies: rows });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/insights/abandonment ───────────────────────────────────────
router.get('/abandonment', requireAuth, adminOnly, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        m.tmdb_id, m.title, m.poster_path, m.year,
        COUNT(*)                                                             AS started_count,
        ROUND(AVG(wh.progress_s::numeric / NULLIF(m.runtime * 60, 0) * 100), 1) AS avg_completion_pct
      FROM watch_history wh
      JOIN movies m ON m.id = wh.movie_id
      WHERE m.runtime IS NOT NULL AND m.runtime > 0
        AND wh.progress_s::numeric / NULLIF(m.runtime * 60, 0) < 0.20
      GROUP BY m.tmdb_id, m.title, m.poster_path, m.year
      HAVING COUNT(*) >= 3
      ORDER BY started_count DESC
      LIMIT 20
    `);
    res.json({ movies: rows });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/insights/active-users ──────────────────────────────────────
router.get('/active-users', requireAuth, adminOnly, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(DISTINCT CASE WHEN wh.updated_at >= NOW() - INTERVAL '1 day'  THEN wh.user_id END) AS dau,
        COUNT(DISTINCT CASE WHEN wh.updated_at >= NOW() - INTERVAL '7 days' THEN wh.user_id END) AS wau,
        COUNT(DISTINCT CASE WHEN wh.updated_at >= NOW() - INTERVAL '30 days'THEN wh.user_id END) AS mau
      FROM watch_history wh
    `);
    res.json(rows[0]);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/insights/recommendation-ctr ────────────────────────────────
router.get('/recommendation-ctr', requireAuth, adminOnly, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        ri.strategy,
        COUNT(ri.id)                                     AS shown,
        COUNT(DISTINCT wh.movie_id)                      AS watched,
        ROUND(COUNT(DISTINCT wh.movie_id)::numeric / NULLIF(COUNT(ri.id), 0) * 100, 1) AS acceptance_rate
      FROM recommendation_impressions ri
      LEFT JOIN movies m ON m.tmdb_id = ri.tmdb_id
      LEFT JOIN watch_history wh ON wh.movie_id = m.id
        AND wh.user_id = ri.user_id
        AND wh.updated_at BETWEEN ri.shown_at AND ri.shown_at + INTERVAL '7 days'
      GROUP BY ri.strategy
      ORDER BY shown DESC
    `);
    res.json({ by_strategy: rows });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/insights/genre-breakdown ───────────────────────────────────
router.get('/genre-breakdown', requireAuth, adminOnly, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        g.name,
        COUNT(DISTINCT wh.user_id)              AS unique_viewers,
        ROUND(SUM(wh.progress_s) / 3600.0, 1)  AS total_hours
      FROM watch_history wh
      JOIN movies m ON m.id = wh.movie_id
      JOIN movie_genres mg ON mg.tmdb_id = m.tmdb_id
      JOIN genres g ON g.id = mg.genre_id
      GROUP BY g.name
      ORDER BY total_hours DESC
    `);
    res.json({ genres: rows });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

export default router;
