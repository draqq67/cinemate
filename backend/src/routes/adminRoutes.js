import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
const guard = [requireAuth, requireRole('admin')];

const JELLYFIN_URL    = process.env.JELLYFIN_URL    || 'http://jellyfin:8096';
const JELLYFIN_KEY    = process.env.JELLYFIN_API_KEY;
const JELLYFIN_UID    = process.env.JELLYFIN_USER_ID;

// ── GET /api/admin/stats ─────────────────────────────────────────────────────
router.get('/stats', guard, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM movies)                          AS movies,
        (SELECT COUNT(*) FROM movies WHERE jellyfin_id IS NOT NULL) AS streamable,
        (SELECT COUNT(*) FROM users)                          AS users,
        (SELECT COUNT(*) FROM comments)                       AS comments,
        (SELECT COUNT(*) FROM ratings)                        AS ratings,
        (SELECT COUNT(*) FROM user_subtitles)                 AS subtitles,
        (SELECT COUNT(*) FROM watchlist)                      AS watchlist_entries
    `);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/movies ────────────────────────────────────────────────────
router.get('/movies', guard, async (req, res) => {
  try {
    const { search = '', page = 1, limit = 30, linked } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`m.title ILIKE $${params.length}`);
    }
    if (linked === 'true')  conditions.push('m.jellyfin_id IS NOT NULL');
    if (linked === 'false') conditions.push('m.jellyfin_id IS NULL');

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(parseInt(limit));
    params.push(offset);

    const { rows } = await pool.query(`
      SELECT m.tmdb_id, m.title, m.year, m.poster_path,
             m.jellyfin_id, m.vote_average,
             COALESCE(
               ARRAY_AGG(g.name ORDER BY g.name) FILTER (WHERE g.name IS NOT NULL), '{}'
             ) AS genres
      FROM movies m
      LEFT JOIN movie_genres mg ON mg.tmdb_id = m.tmdb_id
      LEFT JOIN genres g ON g.id = mg.genre_id
      ${where}
      GROUP BY m.tmdb_id, m.title, m.year, m.poster_path, m.jellyfin_id, m.vote_average, m.popularity
      ORDER BY m.popularity DESC NULLS LAST
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const countParams = params.slice(0, -2);
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(DISTINCT m.tmdb_id) FROM movies m ${where}`,
      countParams
    );

    res.json({ movies: rows, total: parseInt(countRows[0].count), page: parseInt(page) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/admin/movies/:tmdbId/jellyfin ───────────────────────────────────
router.put('/movies/:tmdbId/jellyfin', guard, async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const { jellyfinId } = req.body;

    if (!jellyfinId) return res.status(400).json({ error: 'jellyfinId required' });

    const { rows } = await pool.query(
      `UPDATE movies SET jellyfin_id = $1 WHERE tmdb_id = $2
       RETURNING tmdb_id, title, jellyfin_id`,
      [jellyfinId.trim(), parseInt(tmdbId)]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Movie not found' });

    res.json({ ok: true, movie: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'This Jellyfin ID is already linked to another movie' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/admin/movies/:tmdbId/jellyfin ────────────────────────────────
router.delete('/movies/:tmdbId/jellyfin', guard, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE movies SET jellyfin_id = NULL WHERE tmdb_id = $1
       RETURNING tmdb_id, title`,
      [parseInt(req.params.tmdbId)]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Movie not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/jellyfin/library ─────────────────────────────────────────
router.get('/jellyfin/library', guard, async (req, res) => {
  try {
    const { search = '' } = req.query;
    const userParam = JELLYFIN_UID ? `&UserId=${JELLYFIN_UID}` : '';
    const url = `${JELLYFIN_URL}/Items?api_key=${JELLYFIN_KEY}${userParam}&Recursive=true&IncludeItemTypes=Movie&Fields=ProviderIds,Path,RunTimeTicks&SortBy=SortName&SortOrder=Ascending&Limit=500`;

    const jRes = await fetch(url);
    if (!jRes.ok) return res.status(502).json({ error: 'Jellyfin unavailable' });

    const data = await jRes.json();
    let items = data.Items || [];

    if (search) {
      const q = search.toLowerCase();
      items = items.filter(i => i.Name?.toLowerCase().includes(q));
    }

    res.json({
      items: items.map(i => ({
        id:      i.Id,
        name:    i.Name,
        year:    i.ProductionYear,
        tmdb:    i.ProviderIds?.Tmdb || null,
        imdb:    i.ProviderIds?.Imdb || null,
        path:    i.Path || null,
        runtime: i.RunTimeTicks ? Math.round(i.RunTimeTicks / 600000000) : null,
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/comments ──────────────────────────────────────────────────
router.get('/comments', guard, async (req, res) => {
  try {
    const { page = 1, limit = 30, search = '', movie = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`c.body ILIKE $${params.length}`);
    }
    if (movie) {
      params.push(`%${movie}%`);
      conditions.push(`m.title ILIKE $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit));
    params.push(offset);

    const { rows } = await pool.query(`
      SELECT c.id, c.body, c.created_at, c.parent_id,
             u.username, u.id AS user_id,
             m.title AS movie_title, m.tmdb_id
      FROM comments c
      JOIN users u ON u.id = c.user_id
      JOIN movies m ON m.id = c.movie_id
      ${where}
      ORDER BY c.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const countParams = params.slice(0, -2);
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM comments c
       JOIN users u ON u.id = c.user_id
       JOIN movies m ON m.id = c.movie_id ${where}`,
      countParams
    );

    res.json({ comments: rows, total: parseInt(countRows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/admin/comments/:id ──────────────────────────────────────────
router.delete('/comments/:id', guard, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM comments WHERE id = $1 RETURNING id', [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Comment not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/users ─────────────────────────────────────────────────────
router.get('/users', guard, async (req, res) => {
  try {
    const { page = 1, limit = 30, search = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const where = search
      ? (params.push(`%${search}%`), `WHERE u.username ILIKE $1 OR u.email ILIKE $1`)
      : '';

    params.push(parseInt(limit));
    params.push(offset);

    const { rows } = await pool.query(`
      SELECT u.id, u.username, u.email, u.role, u.created_at,
             COUNT(DISTINCT r.id)  AS rating_count,
             COUNT(DISTINCT c.id)  AS comment_count,
             COUNT(DISTINCT wh.movie_id) AS watched_count
      FROM users u
      LEFT JOIN ratings r     ON r.user_id = u.id
      LEFT JOIN comments c    ON c.user_id = u.id
      LEFT JOIN watch_history wh ON wh.user_id = u.id
      ${where}
      GROUP BY u.id, u.username, u.email, u.role, u.created_at
      ORDER BY u.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const countParams = search ? [params[0]] : [];
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM users u ${where}`, countParams
    );

    res.json({ users: rows, total: parseInt(countRows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/admin/users/:id/role ────────────────────────────────────────────
router.put('/users/:id/role', guard, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const { rows } = await pool.query(
      `UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, role`,
      [role, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true, user: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/admin/users/:id ──────────────────────────────────────────────
router.delete('/users/:id', guard, async (req, res) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
    const { rows } = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id, username', [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true, deleted: rows[0].username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/subtitles ─────────────────────────────────────────────────
router.get('/subtitles', guard, async (req, res) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { rows } = await pool.query(`
      SELECT s.id, s.language, s.label, s.created_at,
             u.username, m.title AS movie_title, m.tmdb_id,
             LENGTH(s.content_vtt) AS size_chars
      FROM user_subtitles s
      JOIN users u  ON u.id = s.user_id
      JOIN movies m ON m.id = s.movie_id
      ORDER BY s.created_at DESC
      LIMIT $1 OFFSET $2
    `, [parseInt(limit), offset]);

    const { rows: countRows } = await pool.query('SELECT COUNT(*) FROM user_subtitles');
    res.json({ subtitles: rows, total: parseInt(countRows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/admin/subtitles/:id ─────────────────────────────────────────
router.delete('/subtitles/:id', guard, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM user_subtitles WHERE id = $1 RETURNING id', [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Subtitle not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/admin/movies/:tmdbId/upload-video ──────────────────────────────
// Multipart upload: field name "video". Streams directly to /media/movies/<Title (Year)>/
router.post('/movies/:tmdbId/upload-video', guard, (req, res) => {
  const tmdbId = parseInt(req.params.tmdbId);

  // Build multer storage dynamically after we know the movie
  const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
      try {
        const { rows } = await pool.query(
          'SELECT title, year FROM movies WHERE tmdb_id = $1', [tmdbId]
        );
        if (!rows[0]) return cb(new Error('Movie not found'));
        const safeName = `${rows[0].title} (${rows[0].year})`.replace(/[/\\?%*:|"<>]/g, '_');
        const dir = `/media/movies/${safeName}`;
        fs.mkdirSync(dir, { recursive: true });
        req._movieMeta = { title: rows[0].title, year: rows[0].year, safeName };
        cb(null, dir);
      } catch (e) { cb(e); }
    },
    filename: (req, file, cb) => {
      const ext  = path.extname(file.originalname).toLowerCase() || '.mp4';
      const name = req._movieMeta ? `${req._movieMeta.safeName}${ext}` : `video${ext}`;
      cb(null, name);
    },
  });

  const ALLOWED_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.webm', '.ts']);
  const upload = multer({
    storage,
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, ALLOWED_EXTS.has(ext));
    },
    limits: { fileSize: 60 * 1024 * 1024 * 1024 }, // 60 GB hard limit
  }).single('video');

  upload(req, res, async (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    if (!req.file) return res.status(400).json({ error: 'No video file received' });

    // Trigger Jellyfin library scan
    try {
      await fetch(`${JELLYFIN_URL}/Library/Refresh?api_key=${JELLYFIN_KEY}`, { method: 'POST' });
    } catch { /* non-fatal */ }

    // Poll Jellyfin for the new item (up to 30s)
    let jellyfinId = null;
    if (req._movieMeta) {
      const { title, year } = req._movieMeta;
      const searchName = encodeURIComponent(title);
      const userParam  = JELLYFIN_UID ? `&UserId=${JELLYFIN_UID}` : '';
      for (let attempt = 0; attempt < 6; attempt++) {
        await new Promise(r => setTimeout(r, 5000));
        try {
          const jRes = await fetch(
            `${JELLYFIN_URL}/Items?api_key=${JELLYFIN_KEY}${userParam}&Recursive=true&IncludeItemTypes=Movie&SearchTerm=${searchName}&Fields=ProviderIds`
          );
          if (!jRes.ok) break;
          const data = await jRes.json();
          const match = (data.Items || []).find(i =>
            i.Name?.toLowerCase() === title.toLowerCase() &&
            (!year || i.ProductionYear === year)
          );
          if (match) { jellyfinId = match.Id; break; }
        } catch { break; }
      }
    }

    // Auto-link if found
    if (jellyfinId) {
      try {
        await pool.query(
          'UPDATE movies SET jellyfin_id = $1 WHERE tmdb_id = $2',
          [jellyfinId, tmdbId]
        );
      } catch { /* duplicate — already linked */ }
    }

    res.json({
      ok: true,
      file: req.file.filename,
      size: req.file.size,
      jellyfinId,
      autoLinked: !!jellyfinId,
    });
  });
});

// ── POST /api/admin/movies/:tmdbId/subtitle ──────────────────────────────────
// Admin subtitle upload — visible to all users (stored in user_subtitles as admin)
router.post('/movies/:tmdbId/subtitle', guard, async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const { content, language = 'en', label = 'Official' } = req.body;

    if (!content?.trim())             return res.status(400).json({ error: 'Subtitle content required' });
    if (content.length > 5_000_000)   return res.status(400).json({ error: 'File too large (max 5 MB)' });

    let vttContent = content.trim();
    if (!vttContent.startsWith('WEBVTT')) {
      vttContent = 'WEBVTT\n\n' + vttContent.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    }

    const { rows: movie } = await pool.query(
      'SELECT id FROM movies WHERE tmdb_id = $1', [parseInt(tmdbId)]
    );
    if (!movie[0]) return res.status(404).json({ error: 'Movie not found' });

    const { rows } = await pool.query(
      `INSERT INTO user_subtitles (user_id, movie_id, language, label, content_vtt)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, language, label, created_at`,
      [req.user.id, movie[0].id, language.slice(0, 10), label.slice(0, 100), vttContent]
    );

    res.status(201).json({ ok: true, subtitle: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/admin/jellyfin/health ────────────────────────────────────────────
router.get('/jellyfin/health', guard, async (_req, res) => {
  try {
    const key = JELLYFIN_KEY;
    const uid = JELLYFIN_UID ? `&UserId=${JELLYFIN_UID}` : '';

    const [sysRes, sessRes, tasksRes, libRes] = await Promise.allSettled([
      fetch(`${JELLYFIN_URL}/System/Info?api_key=${key}`),
      fetch(`${JELLYFIN_URL}/Sessions?api_key=${key}`),
      fetch(`${JELLYFIN_URL}/ScheduledTasks?api_key=${key}`),
      fetch(`${JELLYFIN_URL}/Items?api_key=${key}${uid}&Recursive=true&IncludeItemTypes=Movie&Limit=0`),
    ]);

    const sys     = sysRes.status === 'fulfilled' && sysRes.value.ok ? await sysRes.value.json() : null;
    const sessArr = sessRes.status === 'fulfilled' && sessRes.value.ok ? await sessRes.value.json() : [];
    const tasks   = tasksRes.status === 'fulfilled' && tasksRes.value.ok ? await tasksRes.value.json() : [];
    const lib     = libRes.status === 'fulfilled' && libRes.value.ok ? await libRes.value.json() : null;

    const activeSessions = sessArr.filter(s => s.NowPlayingItem);
    const scanTask = tasks.find(t => t.Key === 'RefreshLibrary');

    res.json({
      online: !!sys,
      version: sys?.Version,
      server_name: sys?.ServerName,
      operating_system: sys?.OperatingSystem,
      active_streams: activeSessions.length,
      sessions: activeSessions.map(s => ({
        username:    s.UserName,
        movie:       s.NowPlayingItem?.Name,
        client:      s.Client,
        play_method: s.TranscodingInfo ? 'Transcode' : 'Direct',
        bitrate:     s.TranscodingInfo?.Bitrate,
        progress_pct: s.PlayState?.PositionTicks && s.NowPlayingItem?.RunTimeTicks
          ? Math.round(s.PlayState.PositionTicks / s.NowPlayingItem.RunTimeTicks * 100) : 0,
      })),
      library_movie_count: lib?.TotalRecordCount ?? null,
      scan_running: scanTask?.State === 'Running',
      scan_last_run: scanTask?.LastExecutionResult?.EndTimeUtc,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
