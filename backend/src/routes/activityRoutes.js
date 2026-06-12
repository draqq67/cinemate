import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router  = Router();
const TMDB    = 'https://api.themoviedb.org/3';
const tmdbGet = async (path) => {
  const r = await fetch(`${TMDB}${path}`, {
    headers: { Authorization: `Bearer ${process.env.TMDB_API_TOKEN}` },
  });
  return r.ok ? r.json() : null;
};

// Populate director+actor cache for movies not yet cached, max 80 per call
async function ensureCreditsCache(tmdbIds) {
  if (!tmdbIds.length) return;
  const { rows: cached } = await pool.query(
    `SELECT DISTINCT tmdb_id FROM movie_directors WHERE tmdb_id = ANY($1::int[])`,
    [tmdbIds]
  );
  const cachedSet = new Set(cached.map(r => r.tmdb_id));
  const missing   = tmdbIds.filter(id => !cachedSet.has(id)).slice(0, 80);
  if (!missing.length) return;

  // Batch TMDB credits — max 5 in parallel
  const chunks = [];
  for (let i = 0; i < missing.length; i += 5) chunks.push(missing.slice(i, i + 5));

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async tmdbId => {
      const data = await tmdbGet(`/movie/${tmdbId}/credits`);
      if (!data) return;
      const directors = (data.crew || []).filter(c => c.job === 'Director');
      const actors    = (data.cast || []).slice(0, 10); // top 10 billed
      await Promise.all([
        ...directors.map(d => pool.query(
          `INSERT INTO movie_directors (tmdb_id, director_name, director_tmdb_id)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [tmdbId, d.name, d.id || null]
        ).catch(() => {})),
        ...actors.map(a => pool.query(
          `INSERT INTO movie_actors (tmdb_id, actor_name, actor_tmdb_id, profile_path, cast_order)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [tmdbId, a.name, a.id || null, a.profile_path || null, a.order ?? null]
        ).catch(() => {})),
      ]);
    }));
  }
}

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

// ── GET /api/activity/users/:userId/profile — public profile ──────────────────
router.get('/users/:userId/profile', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, created_at,
         (SELECT COUNT(*) FROM watch_history wh WHERE wh.user_id = u.id) AS watched,
         (SELECT COUNT(*) FROM ratings r WHERE r.user_id = u.id) AS rated,
         (SELECT ROUND(AVG(score)::numeric,1) FROM ratings r WHERE r.user_id = u.id) AS avg_rating,
         (SELECT COUNT(*) FROM user_follows WHERE following_id = u.id) AS follower_count,
         (SELECT COUNT(*) FROM user_follows WHERE follower_id = u.id) AS following_count
       FROM users u WHERE u.id = $1`,
      [req.params.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });

    const { rows: recents } = await pool.query(
      `SELECT m.tmdb_id, m.title, m.poster_path, r.score, r.created_at
       FROM ratings r JOIN movies m ON m.id = r.movie_id
       WHERE r.user_id = $1 ORDER BY r.created_at DESC LIMIT 8`,
      [req.params.userId]
    );

    res.json({ user: rows[0], recent_ratings: recents });
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
    res.set('Cache-Control', 'no-store');
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

// ── GET /api/activity/analytics/abandonment ───────────────────────────────────
router.get('/analytics/abandonment', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.tmdb_id, m.title, m.poster_path, m.year,
        ROUND(wh.progress_s::numeric / NULLIF(m.runtime * 60, 0) * 100, 1) AS completion_pct,
        wh.updated_at AS watched_at
      FROM watch_history wh
      JOIN movies m ON m.id = wh.movie_id
      WHERE wh.user_id = $1
        AND m.runtime IS NOT NULL AND m.runtime > 0
        AND wh.progress_s::numeric / NULLIF(m.runtime * 60, 0) < 0.20
      ORDER BY wh.updated_at DESC
      LIMIT 20
    `, [req.user.id]);
    res.json({ movies: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/activity/analytics/completion-rate ───────────────────────────────
router.get('/analytics/completion-rate', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT g.name AS genre_name,
        ROUND(AVG(wh.progress_s::numeric / NULLIF(m.runtime * 60, 0) * 100), 1) AS avg_completion_pct,
        COUNT(*) AS movie_count
      FROM watch_history wh
      JOIN movies m ON m.id = wh.movie_id
      JOIN movie_genres mg ON mg.tmdb_id = m.tmdb_id
      JOIN genres g ON g.id = mg.genre_id
      WHERE wh.user_id = $1 AND m.runtime IS NOT NULL AND m.runtime > 0
      GROUP BY g.name
      HAVING COUNT(*) >= 2
      ORDER BY avg_completion_pct DESC
    `, [req.user.id]);
    res.json({ genres: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/activity/analytics/recommendation-acceptance ─────────────────────
router.get('/analytics/recommendation-acceptance', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        ri.strategy,
        COUNT(ri.id)                AS total_shown,
        COUNT(DISTINCT wh.movie_id) AS total_watched,
        ROUND(COUNT(DISTINCT wh.movie_id)::numeric / NULLIF(COUNT(ri.id), 0) * 100, 1) AS acceptance_rate
      FROM recommendation_impressions ri
      LEFT JOIN movies m ON m.tmdb_id = ri.tmdb_id
      LEFT JOIN watch_history wh ON wh.movie_id = m.id
        AND wh.user_id = ri.user_id
        AND wh.updated_at BETWEEN ri.shown_at AND ri.shown_at + INTERVAL '7 days'
      WHERE ri.user_id = $1
      GROUP BY ri.strategy
    `, [req.user.id]);
    const total_shown   = rows.reduce((s, r) => s + parseInt(r.total_shown), 0);
    const total_watched = rows.reduce((s, r) => s + parseInt(r.total_watched), 0);
    res.json({
      total_shown, total_watched,
      acceptance_rate: total_shown ? Math.round(total_watched / total_shown * 100) : 0,
      by_strategy: rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/activity/analytics/taste-profile ─────────────────────────────────
router.get('/analytics/taste-profile', requireAuth, async (req, res) => {
  const uid = req.user.id;
  try {
    const [decadeRows, runtimeRows, ratingBehavior, contrarian, recencyBias] = await Promise.all([

      // Decade affinity
      pool.query(`
        SELECT (m.year/10*10) AS decade, COUNT(*) AS watches,
               ROUND(AVG(r.score)::numeric, 1) AS avg_score
        FROM watch_history wh JOIN movies m ON m.id = wh.movie_id
        LEFT JOIN ratings r ON r.movie_id = wh.movie_id AND r.user_id = wh.user_id
        WHERE wh.user_id=$1 AND m.year IS NOT NULL AND m.year > 1900
        GROUP BY decade ORDER BY decade
      `, [uid]),

      // Runtime preference buckets
      pool.query(`
        SELECT
          CASE WHEN m.runtime <= 60  THEN 'short (<60m)'
               WHEN m.runtime <= 90  THEN 'standard (60-90m)'
               WHEN m.runtime <= 120 THEN 'medium (90-120m)'
               WHEN m.runtime <= 150 THEN 'long (2-2.5h)'
               ELSE 'epic (>2.5h)' END AS bucket,
          COUNT(*) AS watches,
          ROUND(AVG(r.score)::numeric, 1) AS avg_score
        FROM watch_history wh JOIN movies m ON m.id = wh.movie_id
        LEFT JOIN ratings r ON r.movie_id = wh.movie_id AND r.user_id = wh.user_id
        WHERE wh.user_id=$1 AND m.runtime IS NOT NULL AND m.runtime > 0
        GROUP BY bucket
        ORDER BY MIN(m.runtime)
      `, [uid]),

      // Rating behaviour: generosity + consistency
      pool.query(`
        SELECT
          ROUND(AVG(r.score)::numeric, 2)               AS your_avg,
          ROUND(AVG(m.avg_rating)::numeric, 2)          AS platform_avg,
          ROUND((AVG(r.score) - AVG(m.avg_rating))::numeric, 2) AS generosity_delta,
          COUNT(r.id)                                    AS total_rated,
          (SELECT COUNT(*) FROM watch_history WHERE user_id=$1) AS total_watched
        FROM ratings r JOIN movies m ON m.id = r.movie_id
        WHERE r.user_id=$1 AND m.avg_rating > 0 AND m.rating_count >= 3
      `, [uid]),

      // Contrarian score — diverges ≥3 pts from platform avg
      pool.query(`
        SELECT
          COUNT(*)                                                         AS total,
          SUM(CASE WHEN ABS(r.score - m.avg_rating) >= 3 THEN 1 ELSE 0 END) AS contrarian_count,
          ROUND(100.0 * SUM(CASE WHEN ABS(r.score - m.avg_rating) >= 3 THEN 1 ELSE 0 END)
                / NULLIF(COUNT(*), 0), 1)                                  AS contrarian_pct,
          -- Harsher: you rate below platform more
          SUM(CASE WHEN r.score < m.avg_rating - 2 THEN 1 ELSE 0 END)     AS harsher_count,
          SUM(CASE WHEN r.score > m.avg_rating + 2 THEN 1 ELSE 0 END)     AS kinder_count
        FROM ratings r JOIN movies m ON m.id = r.movie_id
        WHERE r.user_id=$1 AND m.avg_rating > 0 AND m.rating_count >= 5
      `, [uid]),

      // Recency bias — avg score for recent vs older watches (last 30d vs before)
      pool.query(`
        SELECT
          ROUND(AVG(CASE WHEN r.created_at >= NOW()-INTERVAL '30 days' THEN r.score END)::numeric,1) AS recent_avg,
          ROUND(AVG(CASE WHEN r.created_at <  NOW()-INTERVAL '30 days' THEN r.score END)::numeric,1) AS older_avg
        FROM ratings r WHERE r.user_id=$1
      `, [uid]),
    ]);

    const rb = ratingBehavior.rows[0];
    const con = contrarian.rows[0];
    const rec = recencyBias.rows[0];

    res.json({
      decade_affinity:  decadeRows.rows.map(r => ({ decade: parseInt(r.decade), watches: parseInt(r.watches), avg_score: parseFloat(r.avg_score) })),
      runtime_buckets:  runtimeRows.rows.map(r => ({ bucket: r.bucket, watches: parseInt(r.watches), avg_score: parseFloat(r.avg_score) })),
      rating_behaviour: {
        your_avg:           parseFloat(rb?.your_avg || 0),
        platform_avg:       parseFloat(rb?.platform_avg || 0),
        generosity_delta:   parseFloat(rb?.generosity_delta || 0),
        total_rated:        parseInt(rb?.total_rated || 0),
        total_watched:      parseInt(rb?.total_watched || 0),
        consistency_pct:    rb ? Math.round(parseInt(rb.total_rated) / Math.max(parseInt(rb.total_watched), 1) * 100) : 0,
      },
      contrarian: {
        total:           parseInt(con?.total || 0),
        contrarian_count: parseInt(con?.contrarian_count || 0),
        contrarian_pct:  parseFloat(con?.contrarian_pct || 0),
        harsher_count:   parseInt(con?.harsher_count || 0),
        kinder_count:    parseInt(con?.kinder_count || 0),
      },
      recency_bias: {
        recent_avg: parseFloat(rec?.recent_avg || 0),
        older_avg:  parseFloat(rec?.older_avg || 0),
        delta:      rec?.recent_avg && rec?.older_avg ? parseFloat((rec.recent_avg - rec.older_avg).toFixed(1)) : null,
      },
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── GET /api/activity/analytics/directors ──────────────────────────────────────
router.get('/analytics/directors', requireAuth, async (req, res) => {
  const uid = req.user.id;
  try {
    // Auto-populate credits cache for unwatched movies
    const { rows: watchedMovies } = await pool.query(
      `SELECT m.tmdb_id FROM watch_history wh JOIN movies m ON m.id = wh.movie_id WHERE wh.user_id=$1`,
      [uid]
    );
    await ensureCreditsCache(watchedMovies.map(r => r.tmdb_id));

    const [topByCount, topByRating, auteurRows, suggestions] = await Promise.all([
      // Top 10 directors by watches
      pool.query(`
        SELECT md.director_name, md.director_tmdb_id,
               COUNT(*)                                        AS watches,
               ROUND(AVG(r.score)::numeric, 1)                AS avg_score
        FROM watch_history wh
        JOIN movies m ON m.id = wh.movie_id
        JOIN movie_directors md ON md.tmdb_id = m.tmdb_id
        LEFT JOIN ratings r ON r.movie_id = wh.movie_id AND r.user_id = wh.user_id
        WHERE wh.user_id=$1
        GROUP BY md.director_name, md.director_tmdb_id
        ORDER BY watches DESC LIMIT 10
      `, [uid]),

      // Top 5 by avg rating you gave (min 2 films seen)
      pool.query(`
        SELECT md.director_name, md.director_tmdb_id,
               COUNT(*)                          AS watches,
               ROUND(AVG(r.score)::numeric, 1)   AS avg_score
        FROM watch_history wh
        JOIN movies m ON m.id = wh.movie_id
        JOIN movie_directors md ON md.tmdb_id = m.tmdb_id
        JOIN ratings r ON r.movie_id = wh.movie_id AND r.user_id = wh.user_id
        WHERE wh.user_id=$1
        GROUP BY md.director_name, md.director_tmdb_id
        HAVING COUNT(*) >= 2
        ORDER BY avg_score DESC LIMIT 5
      `, [uid]),

      // Auteur score: % of watches from directors you've seen 3+ films from
      pool.query(`
        WITH dir_counts AS (
          SELECT md.director_name, COUNT(*) AS cnt
          FROM watch_history wh
          JOIN movies m ON m.id = wh.movie_id
          JOIN movie_directors md ON md.tmdb_id = m.tmdb_id
          WHERE wh.user_id=$1
          GROUP BY md.director_name
          HAVING COUNT(*) >= 3
        )
        SELECT
          (SELECT COUNT(*) FROM watch_history WHERE user_id=$1)              AS total_watches,
          (SELECT COUNT(*) FROM watch_history wh
           JOIN movies m ON m.id = wh.movie_id
           JOIN movie_directors md ON md.tmdb_id = m.tmdb_id
           WHERE wh.user_id=$1 AND md.director_name IN (SELECT director_name FROM dir_counts)) AS auteur_watches
      `, [uid]),

      // "Watch more" — high avg rating but seen only 1 film
      pool.query(`
        SELECT md.director_name, md.director_tmdb_id,
               COUNT(*)                          AS watches,
               ROUND(AVG(r.score)::numeric, 1)   AS avg_score
        FROM watch_history wh
        JOIN movies m ON m.id = wh.movie_id
        JOIN movie_directors md ON md.tmdb_id = m.tmdb_id
        JOIN ratings r ON r.movie_id = wh.movie_id AND r.user_id = wh.user_id
        WHERE wh.user_id=$1
        GROUP BY md.director_name, md.director_tmdb_id
        HAVING COUNT(*) = 1 AND AVG(r.score) >= 8
        ORDER BY avg_score DESC LIMIT 5
      `, [uid]),
    ]);

    const aw = auteurRows.rows[0];
    const total = parseInt(aw?.total_watches || 0);
    const auteur = parseInt(aw?.auteur_watches || 0);

    res.json({
      top_by_count:   topByCount.rows.map(r => ({ ...r, watches: parseInt(r.watches), avg_score: parseFloat(r.avg_score) })),
      top_by_rating:  topByRating.rows.map(r => ({ ...r, watches: parseInt(r.watches), avg_score: parseFloat(r.avg_score) })),
      auteur_score: {
        total_watches:   total,
        auteur_watches:  auteur,
        pct: total > 0 ? Math.round(auteur / total * 100) : 0,
      },
      explore_more:  suggestions.rows.map(r => ({ ...r, watches: parseInt(r.watches), avg_score: parseFloat(r.avg_score) })),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── GET /api/activity/analytics/actors ────────────────────────────────────────
router.get('/analytics/actors', requireAuth, async (req, res) => {
  const uid = req.user.id;
  try {
    // Credits cache already populated by /directors call; just query
    const [topByCount, topByRating, reliable, blindSpots] = await Promise.all([
      // Top 10 actors by appearances in watch history
      pool.query(`
        SELECT ma.actor_name, ma.actor_tmdb_id, ma.profile_path,
               COUNT(*)                              AS appearances,
               ROUND(AVG(r.score)::numeric, 1)       AS avg_score
        FROM watch_history wh
        JOIN movies m ON m.id = wh.movie_id
        JOIN movie_actors ma ON ma.tmdb_id = m.tmdb_id
        LEFT JOIN ratings r ON r.movie_id = wh.movie_id AND r.user_id = wh.user_id
        WHERE wh.user_id=$1
        GROUP BY ma.actor_name, ma.actor_tmdb_id, ma.profile_path
        ORDER BY appearances DESC LIMIT 10
      `, [uid]),

      // Top actors by avg rating you gave their films (min 2)
      pool.query(`
        SELECT ma.actor_name, ma.actor_tmdb_id, ma.profile_path,
               COUNT(*)                              AS appearances,
               ROUND(AVG(r.score)::numeric, 1)       AS avg_score
        FROM watch_history wh
        JOIN movies m ON m.id = wh.movie_id
        JOIN movie_actors ma ON ma.tmdb_id = m.tmdb_id
        JOIN ratings r ON r.movie_id = wh.movie_id AND r.user_id = wh.user_id
        WHERE wh.user_id=$1
        GROUP BY ma.actor_name, ma.actor_tmdb_id, ma.profile_path
        HAVING COUNT(*) >= 2
        ORDER BY avg_score DESC LIMIT 5
      `, [uid]),

      // "Reliable actor" — avg score above YOUR overall avg
      pool.query(`
        WITH your_avg AS (
          SELECT AVG(score) AS avg FROM ratings WHERE user_id=$1
        )
        SELECT ma.actor_name, ma.actor_tmdb_id,
               COUNT(*)                              AS appearances,
               ROUND(AVG(r.score)::numeric, 1)       AS avg_score,
               ROUND((AVG(r.score) - (SELECT avg FROM your_avg))::numeric, 1) AS above_your_avg
        FROM watch_history wh
        JOIN movies m ON m.id = wh.movie_id
        JOIN movie_actors ma ON ma.tmdb_id = m.tmdb_id
        JOIN ratings r ON r.movie_id = wh.movie_id AND r.user_id = wh.user_id
        WHERE wh.user_id=$1
        GROUP BY ma.actor_name, ma.actor_tmdb_id
        HAVING COUNT(*) >= 2 AND AVG(r.score) > (SELECT avg FROM your_avg) + 0.5
        ORDER BY above_your_avg DESC LIMIT 5
      `, [uid]),

      // Platform blind spots — highly rated actors you've never seen
      pool.query(`
        SELECT ma.actor_name, ma.actor_tmdb_id,
               COUNT(DISTINCT ma.tmdb_id)            AS platform_films,
               ROUND(AVG(m.avg_rating)::numeric, 1)  AS platform_avg
        FROM movie_actors ma
        JOIN movies m ON m.tmdb_id = ma.tmdb_id
        WHERE m.avg_rating >= 7
          AND NOT EXISTS (
            SELECT 1 FROM watch_history wh2
            JOIN movies m2 ON m2.id = wh2.movie_id
            JOIN movie_actors ma2 ON ma2.tmdb_id = m2.tmdb_id
            WHERE wh2.user_id=$1 AND ma2.actor_tmdb_id = ma.actor_tmdb_id
          )
        GROUP BY ma.actor_name, ma.actor_tmdb_id
        HAVING COUNT(DISTINCT ma.tmdb_id) >= 3
        ORDER BY platform_avg DESC LIMIT 5
      `, [uid]),
    ]);

    res.json({
      top_by_count:  topByCount.rows.map(r => ({ ...r, appearances: parseInt(r.appearances), avg_score: parseFloat(r.avg_score) || null })),
      top_by_rating: topByRating.rows.map(r => ({ ...r, appearances: parseInt(r.appearances), avg_score: parseFloat(r.avg_score) })),
      reliable:      reliable.rows.map(r => ({ ...r, appearances: parseInt(r.appearances), avg_score: parseFloat(r.avg_score), above_your_avg: parseFloat(r.above_your_avg) })),
      blind_spots:   blindSpots.rows.map(r => ({ ...r, platform_films: parseInt(r.platform_films), platform_avg: parseFloat(r.platform_avg) })),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── GET /api/activity/analytics/social-stats ──────────────────────────────────
router.get('/analytics/social-stats', requireAuth, async (req, res) => {
  const uid = req.user.id;
  try {
    const { rows: followed } = await pool.query(
      'SELECT following_id FROM user_follows WHERE follower_id=$1', [uid]
    );
    if (!followed.length) return res.json({ overlap: [], disagreements: [] });

    const followedIds = followed.map(r => r.following_id);

    // Taste overlap % with each followed user
    const { rows: overlap } = await pool.query(`
      SELECT u.id, u.username,
             COUNT(DISTINCT shared.movie_id)                                 AS shared_movies,
             (SELECT COUNT(*) FROM watch_history WHERE user_id=$1)           AS my_watches,
             (SELECT COUNT(*) FROM watch_history WHERE user_id=u.id)         AS their_watches,
             ROUND(100.0 * COUNT(DISTINCT shared.movie_id) /
               NULLIF(LEAST(
                 (SELECT COUNT(*) FROM watch_history WHERE user_id=$1),
                 (SELECT COUNT(*) FROM watch_history WHERE user_id=u.id)
               ), 0), 1) AS overlap_pct
      FROM users u
      JOIN watch_history shared ON shared.user_id = u.id
        AND EXISTS (SELECT 1 FROM watch_history WHERE user_id=$1 AND movie_id=shared.movie_id)
      WHERE u.id = ANY($2::uuid[])
      GROUP BY u.id, u.username
      ORDER BY overlap_pct DESC LIMIT 5
    `, [uid, followedIds]),

    // Biggest rating disagreements with any followed user
    { rows: disagreements } = await pool.query(`
      SELECT m.tmdb_id, m.title, m.poster_path, m.year,
             r1.score AS my_score,
             u.username AS their_username,
             r2.score AS their_score,
             ABS(r1.score - r2.score) AS diff
      FROM ratings r1
      JOIN ratings r2 ON r2.movie_id = r1.movie_id AND r2.user_id = ANY($2::uuid[])
      JOIN users u ON u.id = r2.user_id
      JOIN movies m ON m.id = r1.movie_id
      WHERE r1.user_id=$1 AND ABS(r1.score - r2.score) >= 4
      ORDER BY diff DESC LIMIT 8
    `, [uid, followedIds]);

    res.json({ overlap, disagreements });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── GET /api/activity/analytics/milestones ─────────────────────────────────────
router.get('/analytics/milestones', requireAuth, async (req, res) => {
  const uid = req.user.id;
  try {
    const [yearComp, genreComp, streakRows] = await Promise.all([
      // Year comparison
      pool.query(`
        SELECT
          SUM(CASE WHEN EXTRACT(YEAR FROM updated_at)=EXTRACT(YEAR FROM NOW())   THEN 1 ELSE 0 END) AS this_year,
          SUM(CASE WHEN EXTRACT(YEAR FROM updated_at)=EXTRACT(YEAR FROM NOW())-1 THEN 1 ELSE 0 END) AS last_year,
          COUNT(*) AS total_watches
        FROM watch_history WHERE user_id=$1
      `, [uid]),

      // Genre completion (genres where user watched ≥80% of catalog)
      pool.query(`
        SELECT g.name,
               COUNT(DISTINCT mg.tmdb_id)    AS catalog_count,
               COUNT(DISTINCT wh.movie_id)   AS watched_count,
               ROUND(100.0 * COUNT(DISTINCT wh.movie_id) / NULLIF(COUNT(DISTINCT mg.tmdb_id), 0), 1) AS pct
        FROM genres g
        JOIN movie_genres mg ON mg.genre_id = g.id
        LEFT JOIN movies m ON m.tmdb_id = mg.tmdb_id
        LEFT JOIN watch_history wh ON wh.movie_id = m.id AND wh.user_id=$1
        GROUP BY g.name
        HAVING COUNT(DISTINCT mg.tmdb_id) >= 5
        ORDER BY pct DESC LIMIT 10
      `, [uid]),

      // Longest streak
      pool.query(`
        WITH daily AS (
          SELECT DISTINCT DATE(updated_at) AS day FROM watch_history WHERE user_id=$1
        ),
        numbered AS (
          SELECT day, ROW_NUMBER() OVER (ORDER BY day) AS rn FROM daily
        ),
        groups AS (
          SELECT day, (day - (rn || ' days')::interval)::date AS grp FROM numbered
        )
        SELECT COUNT(*) AS streak_len
        FROM groups GROUP BY grp ORDER BY streak_len DESC LIMIT 1
      `, [uid]),
    ]);

    const yc = yearComp.rows[0];
    const total = parseInt(yc?.total_watches || 0);

    const milestones = [100, 250, 500, 1000, 2000].map(n => ({
      n,
      reached: total >= n,
      pct_to_next: total < n ? Math.round(total / n * 100) : 100,
    }));

    res.json({
      total_watches: total,
      this_year:  parseInt(yc?.this_year || 0),
      last_year:  parseInt(yc?.last_year || 0),
      milestones,
      longest_streak: parseInt(streakRows.rows[0]?.streak_len || 0),
      genre_completion: genreComp.rows.map(r => ({
        name: r.name,
        catalog_count: parseInt(r.catalog_count),
        watched_count: parseInt(r.watched_count),
        pct: parseFloat(r.pct),
      })),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── GET /api/activity/analytics/regret ───────────────────────────────────────
router.get('/analytics/regret', requireAuth, async (req, res) => {
  const uid = req.user.id;
  try {
    const [mismatch, graveyard, watchedNotRated] = await Promise.all([
      // Consensus mismatches — you diverge ≥3 from platform
      pool.query(`
        SELECT m.tmdb_id, m.title, m.poster_path, m.year,
               r.score AS your_score,
               ROUND(m.avg_rating::numeric, 1) AS platform_avg,
               ROUND((r.score - m.avg_rating)::numeric, 1) AS delta
        FROM ratings r JOIN movies m ON m.id = r.movie_id
        WHERE r.user_id=$1 AND m.rating_count >= 5 AND ABS(r.score - m.avg_rating) >= 3
        ORDER BY ABS(r.score - m.avg_rating) DESC LIMIT 12
      `, [uid]),

      // Watchlist graveyard — added 6+ months ago, never watched
      pool.query(`
        SELECT m.tmdb_id, m.title, m.poster_path, m.year,
               wl.added_at,
               EXTRACT(DAYS FROM NOW() - wl.added_at)::int AS days_waiting
        FROM watchlist wl JOIN movies m ON m.id = wl.movie_id
        WHERE wl.user_id=$1
          AND wl.added_at < NOW() - INTERVAL '6 months'
          AND NOT EXISTS (SELECT 1 FROM watch_history WHERE user_id=$1 AND movie_id=wl.movie_id)
        ORDER BY wl.added_at ASC LIMIT 8
      `, [uid]),

      // High-rated by platform but you never touched
      pool.query(`
        SELECT m.tmdb_id, m.title, m.poster_path, m.year, m.vote_average,
               ROUND(m.avg_rating::numeric,1) AS platform_avg
        FROM movies m
        WHERE m.vote_average >= 8 AND m.vote_count >= 1000
          AND NOT EXISTS (SELECT 1 FROM watch_history WHERE user_id=$1 AND movie_id=m.id)
          AND NOT EXISTS (SELECT 1 FROM ratings WHERE user_id=$1 AND movie_id=m.id)
        ORDER BY m.vote_average DESC, m.vote_count DESC LIMIT 6
      `, [uid]),
    ]);

    res.json({
      consensus_mismatches: mismatch.rows,
      watchlist_graveyard:  graveyard.rows,
      acclaimed_blind_spots: watchedNotRated.rows,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

export default router;
