import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ── GET /api/movies ───────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const {
      search = '',
      genre = '',
      year = '',
      sort = 'popularity',
      page = 1,
      limit = 20,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`m.title ILIKE $${params.length}`);
    }

    if (genre) {
      params.push(genre);
      conditions.push(
        `EXISTS (
          SELECT 1 FROM movie_genres mg
          JOIN genres g ON g.id = mg.genre_id
          WHERE mg.tmdb_id = m.tmdb_id AND g.name = $${params.length}
        )`
      );
    }

    if (year) {
      params.push(parseInt(year));
      conditions.push(`m.year = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sortMap = {
      popularity: 'm.popularity DESC',
      rating:     'm.vote_average DESC',
      newest:     'm.release_date DESC',
      oldest:     'm.release_date ASC',
      title:      'm.title ASC',
      vote_count: 'm.vote_count DESC',
    };
    const orderBy = sortMap[sort] || sortMap.popularity;

    params.push(parseInt(limit), offset);

    const { rows: movies } = await pool.query(
      `SELECT
        m.tmdb_id, m.title, m.overview, m.poster_path, m.backdrop_path,
        m.release_date, m.year, m.runtime, m.vote_average, m.vote_count,
        m.popularity, m.avg_rating, m.rating_count, m.jellyfin_id,
        array_agg(DISTINCT g.name) FILTER (WHERE g.name IS NOT NULL) AS genres
       FROM movies m
       LEFT JOIN movie_genres mg ON mg.tmdb_id = m.tmdb_id
       LEFT JOIN genres g ON g.id = mg.genre_id
       ${where}
       GROUP BY
         m.tmdb_id, m.title, m.overview, m.poster_path, m.backdrop_path,
         m.release_date, m.year, m.runtime, m.vote_average, m.vote_count,
         m.popularity, m.avg_rating, m.rating_count, m.jellyfin_id
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(DISTINCT m.tmdb_id) AS total
       FROM movies m
       LEFT JOIN movie_genres mg ON mg.tmdb_id = m.tmdb_id
       LEFT JOIN genres g ON g.id = mg.genre_id
       ${where}`,
      countParams
    );

    res.json({
      movies,
      total: parseInt(countRows[0].total),
      page: parseInt(page),
      pages: Math.ceil(parseInt(countRows[0].total) / parseInt(limit)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/movies/genres ────────────────────────────────────────────────────
router.get('/genres', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT g.id, g.name, COUNT(mg.tmdb_id) AS count
       FROM genres g
       JOIN movie_genres mg ON mg.genre_id = g.id
       GROUP BY g.id, g.name
       ORDER BY count DESC`
    );
    res.json({ genres: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/movies/:tmdbId ───────────────────────────────────────────────────
router.get('/:tmdbId', async (req, res) => {
  try {
    const { tmdbId } = req.params;

    const { rows: movies } = await pool.query(
      `SELECT
        m.tmdb_id, m.imdb_id, m.title, m.original_title, m.overview, m.tagline,
        m.poster_path, m.backdrop_path, m.release_date, m.year, m.runtime,
        m.budget, m.revenue, m.popularity, m.vote_average, m.vote_count,
        m.original_language, m.status, m.homepage, m.adult,
        m.avg_rating, m.rating_count, m.jellyfin_id, m.created_at,
        array_agg(DISTINCT g.name)
          FILTER (WHERE g.name IS NOT NULL) AS genres,
        array_agg(DISTINCT k.name)
          FILTER (WHERE k.name IS NOT NULL) AS keywords,
        array_agg(DISTINCT jsonb_build_object('iso_code', mc2.iso_code, 'name', mc2.name))
          FILTER (WHERE mc2.iso_code IS NOT NULL) AS countries,
        array_agg(DISTINCT jsonb_build_object('iso_code', ml.iso_code, 'english_name', ml.english_name))
          FILTER (WHERE ml.iso_code IS NOT NULL) AS languages,
        array_agg(DISTINCT jsonb_build_object('id', pc.id, 'name', pc.name, 'logo_path', pc.logo_path))
          FILTER (WHERE pc.id IS NOT NULL) AS production_companies
       FROM movies m
       LEFT JOIN movie_genres mg                ON mg.tmdb_id = m.tmdb_id
       LEFT JOIN genres g                       ON g.id = mg.genre_id
       LEFT JOIN movie_keywords mk              ON mk.tmdb_id = m.tmdb_id
       LEFT JOIN keywords k                     ON k.id = mk.keyword_id
       LEFT JOIN movie_countries mc2            ON mc2.tmdb_id = m.tmdb_id
       LEFT JOIN movie_languages ml             ON ml.tmdb_id = m.tmdb_id
       LEFT JOIN movie_production_companies mpc ON mpc.tmdb_id = m.tmdb_id
       LEFT JOIN production_companies pc        ON pc.id = mpc.company_id
       WHERE m.tmdb_id = $1
       GROUP BY
         m.tmdb_id, m.imdb_id, m.title, m.original_title, m.overview, m.tagline,
         m.poster_path, m.backdrop_path, m.release_date, m.year, m.runtime,
         m.budget, m.revenue, m.popularity, m.vote_average, m.vote_count,
         m.original_language, m.status, m.homepage, m.adult,
         m.avg_rating, m.rating_count, m.jellyfin_id, m.created_at`,
      [tmdbId]
    );

    if (!movies[0]) return res.status(404).json({ error: 'Movie not found' });

    const { rows: cast } = await pool.query(
      `SELECT p.id, p.name, p.profile_path, mc.character, mc.cast_order
       FROM movie_cast mc
       JOIN people p ON p.id = mc.person_id
       WHERE mc.tmdb_id = $1
       ORDER BY mc.cast_order
       LIMIT 20`,
      [tmdbId]
    );

    const { rows: crew } = await pool.query(
      `SELECT p.id, p.name, p.profile_path, mc.job, mc.department
       FROM movie_crew mc
       JOIN people p ON p.id = mc.person_id
       WHERE mc.tmdb_id = $1
       ORDER BY mc.job`,
      [tmdbId]
    );

    const { rows: tmdbReviews } = await pool.query(
      `SELECT id, author, username, avatar_path, rating, content, tmdb_url, created_at
       FROM movie_reviews
       WHERE tmdb_id = $1
       ORDER BY created_at DESC`,
      [tmdbId]
    );

    const { rows: comments } = await pool.query(
      `SELECT
        c.id, c.body, c.created_at, c.parent_id,
        u.username, u.avatar_url,
        r.score AS user_rating
       FROM comments c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN ratings r
         ON r.movie_id = (SELECT id FROM movies WHERE tmdb_id = $1)
         AND r.user_id = c.user_id
       WHERE c.movie_id = (SELECT id FROM movies WHERE tmdb_id = $1)
       ORDER BY c.created_at DESC`,
      [tmdbId]
    );

    res.json({ movie: movies[0], cast, crew, tmdbReviews, comments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/movies/:tmdbId/rate ─────────────────────────────────────────────
router.post('/:tmdbId/rate', requireAuth, async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const { score } = req.body;

    if (!score || score < 1 || score > 10)
      return res.status(400).json({ error: 'Score must be between 1 and 10' });

    const { rows: movie } = await pool.query(
      'SELECT id FROM movies WHERE tmdb_id = $1', [tmdbId]
    );
    if (!movie[0]) return res.status(404).json({ error: 'Movie not found' });

    await pool.query(
      `INSERT INTO ratings (id, user_id, movie_id, score)
       VALUES (uuid_generate_v4(), $1, $2, $3)
       ON CONFLICT (user_id, movie_id) DO UPDATE SET score = $3`,
      [req.user.id, movie[0].id, score]
    );

    const { rows: updated } = await pool.query(
      'SELECT avg_rating, rating_count FROM movies WHERE tmdb_id = $1', [tmdbId]
    );

    res.json({ ok: true, ...updated[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/movies/:tmdbId/my-rating ─────────────────────────────────────────
router.get('/:tmdbId/my-rating', requireAuth, async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const { rows } = await pool.query(
      `SELECT r.score FROM ratings r
       JOIN movies m ON m.id = r.movie_id
       WHERE m.tmdb_id = $1 AND r.user_id = $2`,
      [tmdbId, req.user.id]
    );
    res.json({ score: rows[0]?.score || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/movies/:tmdbId/comments ─────────────────────────────────────────
router.post('/:tmdbId/comments', requireAuth, async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const { body, parent_id } = req.body;

    if (!body?.trim()) return res.status(400).json({ error: 'Comment cannot be empty' });
    if (body.length > 2000) return res.status(400).json({ error: 'Comment too long' });

    const { rows: movie } = await pool.query(
      'SELECT id FROM movies WHERE tmdb_id = $1', [tmdbId]
    );
    if (!movie[0]) return res.status(404).json({ error: 'Movie not found' });

    const { rows } = await pool.query(
      `INSERT INTO comments (id, user_id, movie_id, body, parent_id)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4)
       RETURNING id, body, created_at, parent_id`,
      [req.user.id, movie[0].id, body.trim(), parent_id || null]
    );

    res.status(201).json({
      comment: {
        ...rows[0],
        username: req.user.username,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/movies/:tmdbId/watchlist ────────────────────────────────────────
router.post('/:tmdbId/watchlist', requireAuth, async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const { rows: movie } = await pool.query(
      'SELECT id FROM movies WHERE tmdb_id = $1', [tmdbId]
    );
    if (!movie[0]) return res.status(404).json({ error: 'Movie not found' });

    const existing = await pool.query(
      'SELECT 1 FROM watchlist WHERE user_id=$1 AND movie_id=$2',
      [req.user.id, movie[0].id]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        'DELETE FROM watchlist WHERE user_id=$1 AND movie_id=$2',
        [req.user.id, movie[0].id]
      );
      return res.json({ added: false });
    }

    await pool.query(
      'INSERT INTO watchlist (user_id, movie_id) VALUES ($1,$2)',
      [req.user.id, movie[0].id]
    );
    res.json({ added: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/movies/:tmdbId/watchlist ─────────────────────────────────────────
router.get('/:tmdbId/watchlist', requireAuth, async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const { rows } = await pool.query(
      `SELECT 1 FROM watchlist wl
       JOIN movies m ON m.id = wl.movie_id
       WHERE m.tmdb_id = $1 AND wl.user_id = $2`,
      [tmdbId, req.user.id]
    );
    res.json({ inWatchlist: rows.length > 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;