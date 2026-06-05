import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ── GET /api/lists — public lists browse ──────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 24, search = '', user } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = ['ul.is_public = true'];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`ul.title ILIKE $${params.length}`);
    }
    if (user) {
      params.push(user);
      conditions.push(`ul.user_id = $${params.length}`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(parseInt(limit), offset);

    const { rows } = await pool.query(`
      SELECT ul.id, ul.title, ul.description, ul.created_at,
             u.username, u.id AS user_id,
             COUNT(DISTINCT ulm.movie_id)   AS movie_count,
             COUNT(DISTINCT ulf.user_id)    AS follower_count,
             (
               SELECT array_agg(m.poster_path ORDER BY ulm2.sort_order, ulm2.added_at)
               FROM user_list_movies ulm2
               JOIN movies m ON m.id = ulm2.movie_id
               WHERE ulm2.list_id = ul.id AND m.poster_path IS NOT NULL
               LIMIT 4
             ) AS preview_posters
      FROM user_lists ul
      JOIN users u ON u.id = ul.user_id
      LEFT JOIN user_list_movies ulm ON ulm.list_id = ul.id
      LEFT JOIN user_list_follows ulf ON ulf.list_id = ul.id
      ${where}
      GROUP BY ul.id, ul.title, ul.description, ul.created_at, u.username, u.id
      ORDER BY follower_count DESC, ul.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const countParams = params.slice(0, -2);
    const { rows: cr } = await pool.query(
      `SELECT COUNT(*) FROM user_lists ul ${where}`, countParams
    );

    res.json({ lists: rows, total: parseInt(cr[0].count), page: parseInt(page) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/lists/mine — current user's lists ────────────────────────────────
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT ul.id, ul.title, ul.description, ul.is_public, ul.created_at,
             COUNT(DISTINCT ulm.movie_id) AS movie_count
      FROM user_lists ul
      LEFT JOIN user_list_movies ulm ON ulm.list_id = ul.id
      WHERE ul.user_id = $1
      GROUP BY ul.id, ul.title, ul.description, ul.is_public, ul.created_at
      ORDER BY ul.created_at DESC
    `, [req.user.id]);
    res.json({ lists: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/lists/:id ────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows: listRows } = await pool.query(`
      SELECT ul.id, ul.title, ul.description, ul.is_public, ul.created_at,
             u.username, u.id AS user_id,
             COUNT(DISTINCT ulf.user_id) AS follower_count
      FROM user_lists ul
      JOIN users u ON u.id = ul.user_id
      LEFT JOIN user_list_follows ulf ON ulf.list_id = ul.id
      WHERE ul.id = $1
      GROUP BY ul.id, ul.title, ul.description, ul.is_public, ul.created_at, u.username, u.id
    `, [req.params.id]);

    if (!listRows[0]) return res.status(404).json({ error: 'List not found' });
    const list = listRows[0];
    if (!list.is_public) return res.status(403).json({ error: 'This list is private' });

    const { rows: movies } = await pool.query(`
      SELECT m.tmdb_id, m.title, m.poster_path, m.year, m.vote_average,
             ulm.sort_order, ulm.added_at
      FROM user_list_movies ulm
      JOIN movies m ON m.id = ulm.movie_id
      WHERE ulm.list_id = $1
      ORDER BY ulm.sort_order ASC, ulm.added_at ASC
    `, [req.params.id]);

    res.json({ list, movies });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/lists — create list ─────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, description = '', is_public = true } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title required' });

    const { rows } = await pool.query(
      `INSERT INTO user_lists (user_id, title, description, is_public)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, title.trim().slice(0, 200), description.trim().slice(0, 2000), !!is_public]
    );
    res.status(201).json({ list: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/lists/:id — update list ─────────────────────────────────────────
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { title, description, is_public } = req.body;
    const { rows } = await pool.query(
      `UPDATE user_lists SET
         title       = COALESCE($1, title),
         description = COALESCE($2, description),
         is_public   = COALESCE($3, is_public)
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [title?.trim().slice(0, 200), description?.trim().slice(0, 2000), is_public != null ? !!is_public : null, req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'List not found or not yours' });
    res.json({ list: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/lists/:id ─────────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM user_lists WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'List not found or not yours' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/lists/:id/movies — add movie ────────────────────────────────────
router.post('/:id/movies', requireAuth, async (req, res) => {
  try {
    const { tmdbId } = req.body;
    if (!tmdbId) return res.status(400).json({ error: 'tmdbId required' });

    const { rows: owns } = await pool.query(
      'SELECT id FROM user_lists WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]
    );
    if (!owns[0]) return res.status(403).json({ error: 'Not your list' });

    const { rows: movie } = await pool.query(
      'SELECT id FROM movies WHERE tmdb_id = $1', [parseInt(tmdbId)]
    );
    if (!movie[0]) return res.status(404).json({ error: 'Movie not found' });

    await pool.query(
      `INSERT INTO user_list_movies (list_id, movie_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.params.id, movie[0].id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/lists/:id/movies/:tmdbId — remove movie ──────────────────────
router.delete('/:id/movies/:tmdbId', requireAuth, async (req, res) => {
  try {
    const { rows: owns } = await pool.query(
      'SELECT id FROM user_lists WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]
    );
    if (!owns[0]) return res.status(403).json({ error: 'Not your list' });

    const { rows: movie } = await pool.query(
      'SELECT id FROM movies WHERE tmdb_id = $1', [parseInt(req.params.tmdbId)]
    );
    if (!movie[0]) return res.status(404).json({ error: 'Movie not found' });

    await pool.query(
      'DELETE FROM user_list_movies WHERE list_id = $1 AND movie_id = $2',
      [req.params.id, movie[0].id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/lists/:id/follow — toggle follow ────────────────────────────────
router.post('/:id/follow', requireAuth, async (req, res) => {
  try {
    const existing = await pool.query(
      'SELECT 1 FROM user_list_follows WHERE user_id = $1 AND list_id = $2',
      [req.user.id, req.params.id]
    );
    if (existing.rows[0]) {
      await pool.query('DELETE FROM user_list_follows WHERE user_id = $1 AND list_id = $2', [req.user.id, req.params.id]);
      res.json({ following: false });
    } else {
      await pool.query('INSERT INTO user_list_follows (user_id, list_id) VALUES ($1, $2)', [req.user.id, req.params.id]);
      res.json({ following: true });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/lists/:id/follow — follow status ─────────────────────────────────
router.get('/:id/follow', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT 1 FROM user_list_follows WHERE user_id = $1 AND list_id = $2',
      [req.user.id, req.params.id]
    );
    res.json({ following: !!rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
