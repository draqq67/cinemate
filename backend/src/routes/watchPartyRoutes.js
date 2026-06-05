import { Router } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function genCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach(p => {
    const [k, ...v] = p.split('=');
    out[k.trim()] = decodeURIComponent(v.join('=').trim());
  });
  return out;
}

// In-memory room state: Map<roomCode, { members: Map<ws, {userId, username}>, hostId }>
const rooms = new Map();

// ── POST /api/party — create room ─────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { tmdbId } = req.body;
    if (!tmdbId) return res.status(400).json({ error: 'tmdbId required' });

    const { rows: movie } = await pool.query(
      'SELECT id, title, poster_path, jellyfin_id FROM movies WHERE tmdb_id = $1',
      [parseInt(tmdbId)]
    );
    if (!movie[0]) return res.status(404).json({ error: 'Movie not found' });

    let code = genCode();
    let attempts = 0;
    while (attempts < 10) {
      const { rows } = await pool.query('SELECT 1 FROM watch_party_rooms WHERE room_code = $1', [code]);
      if (!rows[0]) break;
      code = genCode(); attempts++;
    }

    const { rows } = await pool.query(
      `INSERT INTO watch_party_rooms (host_id, movie_id, room_code)
       VALUES ($1, $2, $3) RETURNING id, room_code`,
      [req.user.id, movie[0].id, code]
    );

    res.status(201).json({ room_code: rows[0].room_code, room_id: rows[0].id, movie: movie[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/party/:code — get room state ─────────────────────────────────────
router.get('/:code', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.id, r.room_code, r.is_active, r.playback_position, r.is_playing,
             r.host_id, u.username AS host_username,
             m.tmdb_id, m.title, m.poster_path, m.jellyfin_id, m.runtime
      FROM watch_party_rooms r
      JOIN users u ON u.id = r.host_id
      JOIN movies m ON m.id = r.movie_id
      WHERE r.room_code = $1
    `, [req.params.code.toUpperCase()]);

    if (!rows[0]) return res.status(404).json({ error: 'Room not found' });
    if (!rows[0].is_active) return res.status(410).json({ error: 'Room has ended' });

    const { rows: msgs } = await pool.query(`
      SELECT id, username, body, created_at
      FROM watch_party_messages WHERE room_id = $1
      ORDER BY created_at ASC LIMIT 100
    `, [rows[0].id]);

    const members = [...(rooms.get(rows[0].room_code)?.members?.values() || [])];

    res.json({ room: rows[0], messages: msgs, online_members: members.map(m => m.username) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/party/:code — end room ────────────────────────────────────────
router.delete('/:code', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE watch_party_rooms SET is_active = false WHERE room_code = $1 AND host_id = $2 RETURNING id',
      [req.params.code.toUpperCase(), req.user.id]
    );
    if (!rows[0]) return res.status(403).json({ error: 'Not your room or not found' });

    // Notify all WS members that room ended
    const room = rooms.get(req.params.code.toUpperCase());
    if (room) {
      const msg = JSON.stringify({ type: 'room_ended' });
      room.members.forEach((_, ws) => { try { ws.send(msg); ws.close(); } catch {} });
      rooms.delete(req.params.code.toUpperCase());
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── WebSocket setup ───────────────────────────────────────────────────────────
export function setupWatchPartyWS(wss) {
  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const roomCode = url.pathname.split('/').pop().toUpperCase();
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies.accessToken;

    let user;
    try {
      user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      ws.close(1008, 'Unauthorized');
      return;
    }

    // Verify room exists
    let roomRow;
    try {
      const { rows } = await pool.query(
        'SELECT id, host_id FROM watch_party_rooms WHERE room_code = $1 AND is_active = true',
        [roomCode]
      );
      if (!rows[0]) { ws.close(1008, 'Room not found'); return; }
      roomRow = rows[0];
    } catch {
      ws.close(1011, 'DB error');
      return;
    }

    // Get username
    const { rows: uRows } = await pool.query('SELECT username FROM users WHERE id = $1', [user.id]);
    const username = uRows[0]?.username || 'Guest';

    // Add to room
    if (!rooms.has(roomCode)) rooms.set(roomCode, { members: new Map(), hostId: roomRow.host_id });
    const room = rooms.get(roomCode);
    room.members.set(ws, { userId: user.id, username });

    // Broadcast join
    broadcast(room, { type: 'join', username }, ws);

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      switch (msg.type) {
        case 'chat': {
          if (!msg.body?.trim()) return;
          const body = msg.body.trim().slice(0, 500);
          try {
            await pool.query(
              'INSERT INTO watch_party_messages (room_id, user_id, username, body) VALUES ($1, $2, $3, $4)',
              [roomRow.id, user.id, username, body]
            );
          } catch {}
          broadcast(room, { type: 'chat', username, body, ts: new Date().toISOString() });
          break;
        }
        case 'sync': {
          if (user.id !== room.hostId) return;
          const pos = parseFloat(msg.position) || 0;
          const playing = !!msg.is_playing;
          try {
            await pool.query(
              'UPDATE watch_party_rooms SET playback_position = $1, is_playing = $2, updated_at = NOW() WHERE room_code = $3',
              [pos, playing, roomCode]
            );
          } catch {}
          broadcast(room, { type: 'sync', position: pos, is_playing: playing }, ws);
          break;
        }
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
      }
    });

    ws.on('close', () => {
      room.members.delete(ws);
      broadcast(room, { type: 'leave', username });
      if (room.members.size === 0) rooms.delete(roomCode);
    });

    // Send current state to new member
    ws.send(JSON.stringify({ type: 'welcome', username, is_host: user.id === room.hostId }));
  });
}

function broadcast(room, msg, exclude = null) {
  const data = JSON.stringify(msg);
  room.members.forEach((_, ws) => {
    if (ws === exclude) return;
    try { ws.send(data); } catch {}
  });
}

export default router;
