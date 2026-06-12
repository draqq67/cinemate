import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import pool from '../db/pool.js';

const router = Router();
router.use(requireAuth);

// ── GET /api/users/me/stats ───────────────────────────────────────────────────
router.get('/me/stats', async (req, res) => {
  try {
    const [watched, rated, wishlist, avg] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM watch_history WHERE user_id=$1', [req.user.id]),
      pool.query('SELECT COUNT(*) FROM ratings WHERE user_id=$1', [req.user.id]),
      pool.query('SELECT COUNT(*) FROM watchlist WHERE user_id=$1', [req.user.id]),
      pool.query('SELECT ROUND(AVG(score),1) AS avg FROM ratings WHERE user_id=$1', [req.user.id]),
    ]);
    res.json({
      watched:   parseInt(watched.rows[0].count),
      rated:     parseInt(rated.rows[0].count),
      wishlist:  parseInt(wishlist.rows[0].count),
      avgRating: avg.rows[0].avg,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/users/me/history ─────────────────────────────────────────────────
router.get('/me/history', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
        wh.movie_id,
        wh.progress_s,
        m.title,
        m.runtime,
        m.poster_path,
        m.tmdb_id
       FROM watch_history wh
       JOIN movies m ON m.id = wh.movie_id
       WHERE wh.user_id = $1 AND wh.progress_s > 0
       ORDER BY wh.updated_at DESC
       LIMIT $2`,
      [req.user.id, parseInt(req.query.limit) || 5]
    );
    res.json({ items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/users/me/favourites ──────────────────────────────────────────────
// Movies the user rated 8 or above
router.get('/me/favourites', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
        m.tmdb_id,
        m.title,
        m.year,
        m.poster_path,
        m.vote_average,
        m.avg_rating,
        r.score,
        array_agg(DISTINCT g.name) FILTER (WHERE g.name IS NOT NULL) AS genres
       FROM ratings r
       JOIN movies m ON m.id = r.movie_id
       LEFT JOIN movie_genres mg ON mg.tmdb_id = m.tmdb_id
       LEFT JOIN genres g ON g.id = mg.genre_id
       WHERE r.user_id = $1 AND r.score >= 8
       GROUP BY
         m.tmdb_id, m.title, m.year, m.poster_path,
         m.vote_average, m.avg_rating, r.score
       ORDER BY r.score DESC, m.vote_average DESC
       LIMIT $2`,
      [req.user.id, parseInt(req.query.limit) || 5]
    );
    res.json({ items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/users/me/wishlist ────────────────────────────────────────────────
router.get('/me/wishlist', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
        m.tmdb_id,
        m.title,
        m.year,
        m.poster_path,
        m.vote_average,
        array_agg(DISTINCT g.name) FILTER (WHERE g.name IS NOT NULL) AS genres
       FROM watchlist wl
       JOIN movies m ON m.id = wl.movie_id
       LEFT JOIN movie_genres mg ON mg.tmdb_id = m.tmdb_id
       LEFT JOIN genres g ON g.id = mg.genre_id
       WHERE wl.user_id = $1
       GROUP BY
         m.tmdb_id, m.title, m.year, m.poster_path, m.vote_average
       LIMIT $2`,
      [req.user.id, parseInt(req.query.limit) || 5]
    );
    res.json({ items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/users/me/comments ────────────────────────────────────────────────
router.get('/me/comments', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
        c.id,
        c.body,
        c.created_at,
        m.title AS movie_title,
        m.tmdb_id,
        r.score
       FROM comments c
       JOIN movies m ON m.id = c.movie_id
       LEFT JOIN ratings r ON r.movie_id = c.movie_id AND r.user_id = c.user_id
       WHERE c.user_id = $1
       ORDER BY c.created_at DESC
       LIMIT $2`,
      [req.user.id, parseInt(req.query.limit) || 3]
    );
    res.json({ items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/users/me/ratings ─────────────────────────────────────────────────
router.get('/me/ratings', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
        r.score,
        r.created_at,
        m.tmdb_id,
        m.title,
        m.year,
        m.poster_path
       FROM ratings r
       JOIN movies m ON m.id = r.movie_id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2`,
      [req.user.id, parseInt(req.query.limit) || 20]
    );
    res.json({ items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/users/search?q= — search users by username (public) ─────────────
router.get('/search', async (req, res) => {
  const { q = '', limit = 20 } = req.query;
  if (!q.trim()) return res.json({ users: [] });
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.username, u.avatar_url,
             (SELECT COUNT(*) FROM user_follows WHERE following_id = u.id) AS follower_count,
             (SELECT COUNT(*) FROM watch_history  WHERE user_id    = u.id) AS watched_count
      FROM users u
      WHERE u.username ILIKE $1
        AND u.email NOT LIKE '%@ml25m.cinemate'
      ORDER BY follower_count DESC, u.username
      LIMIT $2
    `, [`%${q.trim()}%`, parseInt(limit)]);
    res.json({ users: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/users/me/preferences ────────────────────────────────────────────
router.get('/me/preferences', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT preferences FROM users WHERE id=$1', [req.user.id]);
    res.json({ preferences: rows[0]?.preferences || null });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/users/me/preferences ────────────────────────────────────────────
router.put('/me/preferences', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE users SET preferences=$1 WHERE id=$2 RETURNING preferences',
      [JSON.stringify(req.body), req.user.id]
    );
    res.json({ preferences: rows[0].preferences });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;