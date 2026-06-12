import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { wsConnectionsGauge } from '../middleware/metrics.js';

const router = Router();

// Track online DM sockets: Map<userId, Set<ws>>
export const dmSockets = new Map();

export function registerDMSocket(ws, userId) {
  if (!dmSockets.has(userId)) dmSockets.set(userId, new Set());
  dmSockets.get(userId).add(ws);
  wsConnectionsGauge.inc({ type: 'dm' });
  ws.on('close', () => {
    dmSockets.get(userId)?.delete(ws);
    if (dmSockets.get(userId)?.size === 0) dmSockets.delete(userId);
    wsConnectionsGauge.dec({ type: 'dm' });
  });
}

function pushDM(userId, payload) {
  const sockets = dmSockets.get(userId);
  if (!sockets) return;
  const data = JSON.stringify(payload);
  sockets.forEach(ws => { try { ws.send(data); } catch {} });
}

// Order two UUIDs so user1_id < user2_id (enforced by DB check constraint)
function ordered(a, b) {
  return a < b ? [a, b] : [b, a];
}

// ── POST /api/dm/threads/:userId — get or create thread ──────────────────────
router.post('/threads/:userId', requireAuth, async (req, res) => {
  const me    = req.user.id;
  const other = req.params.userId;
  if (me === other) return res.status(400).json({ error: 'Cannot DM yourself' });

  const [u1, u2] = ordered(me, other);
  try {
    // Validate target user exists
    const { rows: check } = await pool.query('SELECT id FROM users WHERE id = $1', [other]);
    if (!check.length) return res.status(404).json({ error: 'User not found' });

    const { rows } = await pool.query(`
      INSERT INTO dm_threads (user1_id, user2_id)
      VALUES ($1, $2)
      ON CONFLICT (user1_id, user2_id) DO UPDATE SET user1_id = dm_threads.user1_id
      RETURNING id
    `, [u1, u2]);
    res.json({ threadId: rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/dm/threads — list all threads with preview + unread count ────────
router.get('/threads', requireAuth, async (req, res) => {
  const me = req.user.id;
  try {
    const { rows } = await pool.query(`
      SELECT
        t.id,
        CASE WHEN t.user1_id = $1 THEN t.user2_id ELSE t.user1_id END AS other_id,
        u.username  AS other_username,
        last_msg.body          AS last_body,
        last_msg.movie_tmdb_id AS last_movie_tmdb_id,
        last_msg.created_at    AS last_at,
        COALESCE(r.last_read_at, '1970-01-01') AS last_read_at,
        COUNT(unread.id) AS unread_count
      FROM dm_threads t
      JOIN users u ON u.id = CASE WHEN t.user1_id = $1 THEN t.user2_id ELSE t.user1_id END
      LEFT JOIN LATERAL (
        SELECT body, movie_tmdb_id, created_at
        FROM dm_messages WHERE thread_id = t.id
        ORDER BY created_at DESC LIMIT 1
      ) last_msg ON true
      LEFT JOIN dm_thread_reads r ON r.thread_id = t.id AND r.user_id = $1
      LEFT JOIN dm_messages unread ON unread.thread_id = t.id
        AND unread.sender_id != $1
        AND unread.created_at > COALESCE(r.last_read_at, '1970-01-01')
      WHERE t.user1_id = $1 OR t.user2_id = $1
      GROUP BY t.id, u.username, last_msg.body, last_msg.movie_tmdb_id, last_msg.created_at, r.last_read_at
      ORDER BY last_msg.created_at DESC NULLS LAST
    `, [me]);
    res.json({ threads: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/dm/threads/:threadId — fetch messages ────────────────────────────
router.get('/threads/:threadId', requireAuth, async (req, res) => {
  const me = req.user.id;
  try {
    // Verify membership
    const { rows: t } = await pool.query(
      `SELECT id FROM dm_threads WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)`,
      [req.params.threadId, me]
    );
    if (!t.length) return res.status(404).json({ error: 'Thread not found' });

    const { rows } = await pool.query(`
      SELECT
        m.id, m.sender_id, u.username AS sender_username,
        m.body, m.movie_tmdb_id,
        mov.title AS movie_title, mov.poster_path AS movie_poster,
        m.created_at
      FROM dm_messages m
      JOIN users u ON u.id = m.sender_id
      LEFT JOIN movies mov ON mov.tmdb_id = m.movie_tmdb_id
      WHERE m.thread_id = $1
      ORDER BY m.created_at ASC
      LIMIT 50
    `, [req.params.threadId]);

    res.json({ messages: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/dm/threads/:threadId/messages — send a message ─────────────────
router.post('/threads/:threadId/messages', requireAuth, async (req, res) => {
  const me = req.user.id;
  const { body, movie_tmdb_id } = req.body;

  if (!body && !movie_tmdb_id) return res.status(400).json({ error: 'body or movie_tmdb_id required' });

  try {
    const { rows: t } = await pool.query(
      `SELECT user1_id, user2_id FROM dm_threads WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)`,
      [req.params.threadId, me]
    );
    if (!t.length) return res.status(404).json({ error: 'Thread not found' });

    const { rows: ins } = await pool.query(`
      INSERT INTO dm_messages (thread_id, sender_id, body, movie_tmdb_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, sender_id, body, movie_tmdb_id, created_at
    `, [req.params.threadId, me, body || null, movie_tmdb_id || null]);

    const msg = ins[0];

    // Enrich with movie data if needed
    let movieTitle = null, moviePoster = null;
    if (movie_tmdb_id) {
      const { rows: mov } = await pool.query(
        `SELECT title, poster_path FROM movies WHERE tmdb_id = $1`, [movie_tmdb_id]
      );
      if (mov.length) { movieTitle = mov[0].title; moviePoster = mov[0].poster_path; }
    }

    const payload = {
      type: 'dm',
      threadId: req.params.threadId,
      message: {
        id: msg.id,
        senderId: msg.sender_id,
        senderUsername: req.user.username,
        body: msg.body,
        movie_tmdb_id: msg.movie_tmdb_id,
        movieTitle,
        moviePoster,
        createdAt: msg.created_at,
      },
    };

    // Push to both participants
    const otherId = t[0].user1_id === me ? t[0].user2_id : t[0].user1_id;
    pushDM(me, payload);
    pushDM(otherId, payload);

    res.json({ message: payload.message });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/dm/threads/:threadId/read — mark as read ────────────────────────
router.put('/threads/:threadId/read', requireAuth, async (req, res) => {
  const me = req.user.id;
  try {
    await pool.query(`
      INSERT INTO dm_thread_reads (thread_id, user_id, last_read_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (thread_id, user_id) DO UPDATE SET last_read_at = NOW()
    `, [req.params.threadId, me]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/dm/unread — total unread count across all threads ────────────────
router.get('/unread', requireAuth, async (req, res) => {
  const me = req.user.id;
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(m.id) AS count
      FROM dm_threads t
      JOIN dm_messages m ON m.thread_id = t.id AND m.sender_id != $1
      LEFT JOIN dm_thread_reads r ON r.thread_id = t.id AND r.user_id = $1
      WHERE (t.user1_id = $1 OR t.user2_id = $1)
        AND m.created_at > COALESCE(r.last_read_at, '1970-01-01')
    `, [me]);
    res.json({ unread: parseInt(rows[0].count) });
  } catch (err) {
    res.json({ unread: 0 });
  }
});

export default router;
