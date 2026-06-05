import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ── POST /api/activity/follow/:userId — toggle follow ────────────────────────
router.post('/follow/:userId', requireAuth, async (req, res) => {
  try {
    const targetId = req.params.userId;
    if (targetId === req.user.id) return res.status(400).json({ error: 'Cannot follow yourself' });

    const { rows: target } = await pool.query('SELECT id FROM users WHERE id = $1', [targetId]);
    if (!target[0]) return res.status(404).json({ error: 'User not found' });

    const existing = await pool.query(
      'SELECT 1 FROM user_follows WHERE follower_id = $1 AND following_id = $2',
      [req.user.id, targetId]
    );
    if (existing.rows[0]) {
      await pool.query('DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2', [req.user.id, targetId]);
      res.json({ following: false });
    } else {
      await pool.query('INSERT INTO user_follows (follower_id, following_id) VALUES ($1, $2)', [req.user.id, targetId]);
      res.json({ following: true });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/activity/follow/:userId — follow status ─────────────────────────
router.get('/follow/:userId', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT 1 FROM user_follows WHERE follower_id = $1 AND following_id = $2',
      [req.user.id, req.params.userId]
    );
    res.json({ following: !!rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/activity/users/:userId/followers ─────────────────────────────────
router.get('/users/:userId/followers', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.username, u.avatar_url, uf.created_at AS followed_at
      FROM user_follows uf
      JOIN users u ON u.id = uf.follower_id
      WHERE uf.following_id = $1
      ORDER BY uf.created_at DESC
    `, [req.params.userId]);
    res.json({ followers: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/activity/users/:userId/following ─────────────────────────────────
router.get('/users/:userId/following', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.username, u.avatar_url, uf.created_at AS followed_at
      FROM user_follows uf
      JOIN users u ON u.id = uf.following_id
      WHERE uf.follower_id = $1
      ORDER BY uf.created_at DESC
    `, [req.params.userId]);
    res.json({ following: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/activity/feed — activity from followed users ─────────────────────
router.get('/feed', requireAuth, async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    // Get IDs of followed users
    const { rows: followed } = await pool.query(
      'SELECT following_id FROM user_follows WHERE follower_id = $1',
      [req.user.id]
    );
    if (!followed.length) return res.json({ events: [] });

    const ids = followed.map(r => r.following_id);
    const idList = ids.map((_, i) => `$${i + 1}`).join(',');

    const { rows } = await pool.query(`
      (
        SELECT 'rating' AS type, r.created_at AS ts,
               u.id AS user_id, u.username,
               m.tmdb_id, m.title, m.poster_path,
               r.score::text AS detail
        FROM ratings r
        JOIN users u ON u.id = r.user_id
        JOIN movies m ON m.id = r.movie_id
        WHERE r.user_id IN (${idList})
      )
      UNION ALL
      (
        SELECT 'comment' AS type, c.created_at AS ts,
               u.id AS user_id, u.username,
               m.tmdb_id, m.title, m.poster_path,
               LEFT(c.body, 120) AS detail
        FROM comments c
        JOIN users u ON u.id = c.user_id
        JOIN movies m ON m.id = c.movie_id
        WHERE c.user_id IN (${idList})
      )
      UNION ALL
      (
        SELECT 'watched' AS type, wh.updated_at AS ts,
               u.id AS user_id, u.username,
               m.tmdb_id, m.title, m.poster_path,
               NULL AS detail
        FROM watch_history wh
        JOIN users u ON u.id = wh.user_id
        JOIN movies m ON m.id = wh.movie_id
        WHERE wh.user_id IN (${idList})
      )
      ORDER BY ts DESC
      LIMIT $${ids.length + 1}
    `, [...ids, parseInt(limit)]);

    res.json({ events: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── streak helper ─────────────────────────────────────────────────────────────
async function calcStreak(uid) {
  const { rows } = await pool.query(
    `SELECT DISTINCT DATE(updated_at) AS day FROM watch_history WHERE user_id = $1 ORDER BY day DESC`,
    [uid]
  );
  let streak = 0;
  if (rows.length) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let expected = today;
    for (const { day } of rows) {
      const d = new Date(day); d.setHours(0, 0, 0, 0);
      if (Math.round((expected - d) / 86400000) > 1) break;
      streak++;
      expected = d;
      expected.setDate(expected.getDate() - 1);
    }
  }
  return streak;
}

// ── GET /api/activity/analytics — fast headline stats ─────────────────────────
router.get('/analytics', requireAuth, async (req, res) => {
  try {
    const uid = req.user.id;
    const [totals, dayRows, hourRows, topMovies, recentRatings] = await Promise.all([
      pool.query(`
        SELECT
          (SELECT COUNT(DISTINCT movie_id)
           FROM watch_history WHERE user_id = $1)                              AS movies_watched,
          (SELECT COALESCE(SUM(m.runtime), 0)
           FROM watch_history wh JOIN movies m ON m.id = wh.movie_id
           WHERE wh.user_id = $1)                                              AS total_minutes,
          (SELECT COALESCE(ROUND(AVG(score)::numeric, 1), 0)
           FROM ratings WHERE user_id = $1)                                    AS avg_rating,
          (SELECT COUNT(*) FROM ratings WHERE user_id = $1)                    AS rated_count,
          (SELECT COUNT(*) FROM watchlist WHERE user_id = $1)                  AS wishlist_count
      `, [uid]),
      pool.query(`SELECT EXTRACT(DOW FROM updated_at)::int AS dow, COUNT(*) AS count FROM watch_history WHERE user_id=$1 GROUP BY dow ORDER BY dow`, [uid]),
      pool.query(`SELECT EXTRACT(HOUR FROM updated_at)::int AS hour, COUNT(*) AS count FROM watch_history WHERE user_id=$1 GROUP BY hour ORDER BY hour`, [uid]),
      pool.query(`SELECT m.tmdb_id, m.title, m.poster_path, wh.updated_at FROM watch_history wh JOIN movies m ON m.id=wh.movie_id WHERE wh.user_id=$1 ORDER BY wh.updated_at DESC LIMIT 10`, [uid]),
      pool.query(`SELECT m.tmdb_id, m.title, m.poster_path, m.year, r.score, r.created_at FROM ratings r JOIN movies m ON m.id=r.movie_id WHERE r.user_id=$1 ORDER BY r.created_at DESC LIMIT 10`, [uid]),
    ]);

    const t    = totals.rows[0];
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const streak = await calcStreak(uid);

    res.json({
      movies_watched: parseInt(t.movies_watched),
      total_minutes:  parseInt(t.total_minutes),
      avg_rating:     parseFloat(t.avg_rating),
      rated_count:    parseInt(t.rated_count),
      wishlist_count: parseInt(t.wishlist_count),
      streak,
      by_day:         days.map((label, i) => { const f = dayRows.rows.find(r => r.dow === i); return { label, count: f ? parseInt(f.count) : 0 }; }),
      by_hour:        hourRows.rows.map(r => ({ hour: parseInt(r.hour), count: parseInt(r.count) })),
      recent_watched: topMovies.rows,
      recent_ratings: recentRatings.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/activity/analytics/charts — heavier chart data ───────────────────
router.get('/analytics/charts', requireAuth, async (req, res) => {
  try {
    const uid = req.user.id;
    const [genreRows, ratingDist, decadeRows, monthRows, genreRatings, topRated, dateRows] = await Promise.all([
      pool.query(`
        SELECT g.name, COUNT(*) AS count
        FROM watch_history wh JOIN movies m ON m.id=wh.movie_id
        JOIN movie_genres mg ON mg.tmdb_id=m.tmdb_id JOIN genres g ON g.id=mg.genre_id
        WHERE wh.user_id=$1 GROUP BY g.name ORDER BY count DESC LIMIT 10
      `, [uid]),
      pool.query(`SELECT score, COUNT(*) AS count FROM ratings WHERE user_id=$1 GROUP BY score ORDER BY score`, [uid]),
      pool.query(`
        SELECT (m.year/10*10) AS decade, COUNT(*) AS count
        FROM watch_history wh JOIN movies m ON m.id=wh.movie_id
        WHERE wh.user_id=$1 AND m.year IS NOT NULL AND m.year>1900
        GROUP BY decade ORDER BY decade
      `, [uid]),
      pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('month', updated_at),'YYYY-MM') AS month, COUNT(*) AS count
        FROM watch_history WHERE user_id=$1 AND updated_at>=NOW()-INTERVAL '24 months'
        GROUP BY month ORDER BY month
      `, [uid]),
      pool.query(`
        SELECT g.name, COUNT(*) AS count, ROUND(AVG(r.score)::numeric,1) AS avg_score
        FROM ratings r JOIN movies m ON m.id=r.movie_id
        JOIN movie_genres mg ON mg.tmdb_id=m.tmdb_id JOIN genres g ON g.id=mg.genre_id
        WHERE r.user_id=$1 GROUP BY g.name HAVING COUNT(*)>=2 ORDER BY avg_score DESC LIMIT 12
      `, [uid]),
      pool.query(`
        SELECT m.tmdb_id, m.title, m.poster_path, m.year, r.score
        FROM ratings r JOIN movies m ON m.id=r.movie_id
        WHERE r.user_id=$1 ORDER BY r.score DESC, r.created_at DESC LIMIT 12
      `, [uid]),
      pool.query(`
        SELECT DATE(updated_at) AS day, COUNT(*) AS count
        FROM watch_history WHERE user_id=$1 AND updated_at>=NOW()-INTERVAL '365 days'
        GROUP BY day
      `, [uid]),
    ]);

    res.json({
      genres:        genreRows.rows.map(r => ({ name: r.name, count: parseInt(r.count) })),
      rating_dist:   Array.from({ length: 10 }, (_, i) => { const f = ratingDist.rows.find(r => parseInt(r.score)===i+1); return { score: i+1, count: f ? parseInt(f.count) : 0 }; }),
      by_decade:     decadeRows.rows.map(r => ({ decade: parseInt(r.decade), count: parseInt(r.count) })),
      by_month:      monthRows.rows.map(r => ({ month: r.month, count: parseInt(r.count) })),
      genre_ratings: genreRatings.rows.map(r => ({ name: r.name, count: parseInt(r.count), avg_score: parseFloat(r.avg_score) })),
      top_rated:     topRated.rows,
      by_date:       dateRows.rows.map(r => ({ day: r.day.toISOString().slice(0,10), count: parseInt(r.count) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
