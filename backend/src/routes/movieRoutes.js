import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const TMDB_BASE = 'https://api.themoviedb.org/3';
const tmdbGet = async (path) => {
  const res = await fetch(`${TMDB_BASE}${path}`, {
    headers: { Authorization: `Bearer ${process.env.TMDB_API_TOKEN}` },
  });
  if (!res.ok) return null;
  return res.json();
};

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
      streamable = '',
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

    if (streamable === 'true') {
      conditions.push(`m.jellyfin_id IS NOT NULL`);
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
        m.tmdb_id, m.title, m.poster_path,
        m.release_date, m.year, m.runtime, m.vote_average, m.vote_count,
        m.popularity, m.avg_rating, m.rating_count, m.jellyfin_id,
        array_agg(DISTINCT g.name) FILTER (WHERE g.name IS NOT NULL) AS genres
       FROM movies m
       LEFT JOIN movie_genres mg ON mg.tmdb_id = m.tmdb_id
       LEFT JOIN genres g ON g.id = mg.genre_id
       ${where}
       GROUP BY
         m.tmdb_id, m.title, m.poster_path,
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

// ── TMDB discovery helpers (shared transform) ─────────────────────────────────
function tmdbMovieShape(r) {
  return {
    tmdb_id:      r.id,
    title:        r.title,
    poster_path:  r.poster_path,
    year:         r.release_date ? parseInt(r.release_date.slice(0, 4)) : null,
    vote_average: r.vote_average,
    vote_count:   r.vote_count,
    popularity:   r.popularity,
    avg_rating:   null,
    rating_count: 0,
  };
}

// ── GET /api/movies/tmdb/:list — popular | top_rated | now_playing ────────────
async function tmdbList(list, req, res) {
  try {
    const { page = 1 } = req.query;
    const data = await tmdbGet(`/movie/${list}?page=${page}&language=en-US`);
    if (!data) return res.status(502).json({ error: 'TMDB unavailable' });
    res.json({ movies: (data.results || []).map(tmdbMovieShape) });
  } catch (err) {
    console.error('TMDB list error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}
router.get('/tmdb/popular',     (req, res) => tmdbList('popular',     req, res));
router.get('/tmdb/top_rated',   (req, res) => tmdbList('top_rated',   req, res));
router.get('/tmdb/now_playing', (req, res) => tmdbList('now_playing', req, res));

// ── GET /api/movies/search/tmdb — must be before /:tmdbId ────────────────────
router.get('/search/tmdb', async (req, res) => {
  try {
    const { q = '', page = 1 } = req.query;
    if (!q.trim()) return res.json({ movies: [], total_results: 0, page: 1, total_pages: 0, source: 'tmdb' });

    const tmdbRes = await tmdbGet(`/search/movie?query=${encodeURIComponent(q)}&page=${page}&include_adult=false`);
    if (!tmdbRes) return res.status(502).json({ error: 'TMDB unavailable' });

    const results = tmdbRes.results ?? [];
    const tmdbIds = results.map(r => r.id);

    // Batch-check which are already in DB
    let inDbSet = new Set();
    if (tmdbIds.length > 0) {
      const { rows } = await pool.query(
        `SELECT tmdb_id FROM movies WHERE tmdb_id = ANY($1::int[])`,
        [tmdbIds]
      );
      inDbSet = new Set(rows.map(r => r.tmdb_id));
    }

    const movies = results.map(r => ({
      tmdb_id:      r.id,
      title:        r.title,
      poster_path:  r.poster_path,
      year:         r.release_date ? parseInt(r.release_date.slice(0, 4)) : null,
      vote_average: r.vote_average,
      vote_count:   r.vote_count,
      popularity:   r.popularity,
      jellyfin_id:  null,
      avg_rating:   null,
      rating_count: 0,
      inDb:         inDbSet.has(r.id),
    }));

    res.json({
      movies,
      total_results: tmdbRes.total_results,
      page:          tmdbRes.page,
      total_pages:   tmdbRes.total_pages,
      source:        'tmdb',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/movies/:tmdbId ───────────────────────────────────────────────────
router.get('/:tmdbId', async (req, res) => {
  try {
    const { tmdbId } = req.params;

    const [dbResult, tmdbDetail, tmdbCredits, tmdbVideos, tmdbReviewsData] =
      await Promise.all([
        pool.query(
          `SELECT m.tmdb_id, m.title, m.year, m.release_date, m.runtime,
                  m.poster_path, m.popularity, m.vote_average, m.vote_count,
                  m.avg_rating, m.rating_count, m.jellyfin_id, m.created_at,
                  array_agg(DISTINCT g.name) FILTER (WHERE g.name IS NOT NULL) AS genres
           FROM movies m
           LEFT JOIN movie_genres mg ON mg.tmdb_id = m.tmdb_id
           LEFT JOIN genres g ON g.id = mg.genre_id
           WHERE m.tmdb_id = $1
           GROUP BY m.tmdb_id, m.title, m.year, m.release_date, m.runtime,
                    m.poster_path, m.popularity, m.vote_average, m.vote_count,
                    m.avg_rating, m.rating_count, m.jellyfin_id, m.created_at`,
          [tmdbId]
        ),
        tmdbGet(`/movie/${tmdbId}?append_to_response=keywords`),
        tmdbGet(`/movie/${tmdbId}/credits`),
        tmdbGet(`/movie/${tmdbId}/videos`),
        tmdbGet(`/movie/${tmdbId}/reviews`),
      ]);

    // If TMDB also has no data, the movie truly doesn't exist
    if (!tmdbDetail) return res.status(404).json({ error: 'Movie not found' });

    const db = dbResult.rows[0] ?? null;
    const inDb = !!db;

    // Fetch comments only when the movie is in our DB
    let comments = [];
    if (inDb) {
      const { rows } = await pool.query(
        `SELECT c.id, c.user_id, c.body, c.created_at, c.parent_id,
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
      comments = rows;
    }

    const releaseDate = db?.release_date ?? tmdbDetail.release_date ?? null;
    const yearVal     = db?.year
      ?? (releaseDate ? parseInt(String(releaseDate).slice(0, 4)) : null);

    const movie = {
      // DB fields (nulled out if not in DB)
      tmdb_id:      tmdbDetail.id,
      title:        db?.title        ?? tmdbDetail.title,
      year:         yearVal,
      release_date: releaseDate,
      runtime:      db?.runtime      ?? tmdbDetail.runtime      ?? null,
      poster_path:  db?.poster_path  ?? tmdbDetail.poster_path  ?? null,
      popularity:   db?.popularity   ?? tmdbDetail.popularity   ?? null,
      vote_average: db?.vote_average ?? tmdbDetail.vote_average ?? null,
      vote_count:   db?.vote_count   ?? tmdbDetail.vote_count   ?? null,
      avg_rating:   db?.avg_rating   ?? null,
      rating_count: db?.rating_count ?? 0,
      jellyfin_id:  db?.jellyfin_id  ?? null,
      inDb,

      // TMDB-enriched fields
      overview:             tmdbDetail.overview             ?? '',
      tagline:              tmdbDetail.tagline              ?? '',
      backdrop_path:        tmdbDetail.backdrop_path        ?? null,
      imdb_id:              tmdbDetail.imdb_id              ?? null,
      original_title:       tmdbDetail.original_title       ?? (db?.title ?? tmdbDetail.title),
      homepage:             tmdbDetail.homepage             ?? null,
      budget:               tmdbDetail.budget               ?? 0,
      revenue:              tmdbDetail.revenue              ?? 0,
      adult:                tmdbDetail.adult                ?? false,
      status:               tmdbDetail.status               ?? null,
      original_language:    tmdbDetail.original_language    ?? null,
      genres:               db?.genres?.length
                              ? db.genres
                              : (tmdbDetail.genres?.map(g => g.name) ?? []),
      production_companies: (tmdbDetail.production_companies ?? [])
                              .map(c => ({ id: c.id, name: c.name, logo_path: c.logo_path })),
      countries:            (tmdbDetail.production_countries ?? [])
                              .map(c => ({ iso_code: c.iso_3166_1, name: c.name })),
      languages:            (tmdbDetail.spoken_languages ?? [])
                              .map(l => ({ iso_code: l.iso_639_1, english_name: l.english_name })),
      keywords:             (tmdbDetail.keywords?.keywords ?? []).map(k => k.name),
    };

    const cast = (tmdbCredits?.cast ?? []).slice(0, 20).map(c => ({
      id:           c.id,
      name:         c.name,
      profile_path: c.profile_path,
      character:    c.character,
      cast_order:   c.order,
    }));

    const crew = (tmdbCredits?.crew ?? [])
      .filter(c => ['Director', 'Screenplay', 'Writer', 'Story', 'Novel', 'Producer'].includes(c.job))
      .map(c => ({ id: c.id, name: c.name, profile_path: c.profile_path, job: c.job, department: c.department }));

    const trailers = (tmdbVideos?.results ?? [])
      .filter(v => v.site === 'YouTube' && v.type === 'Trailer')
      .slice(0, 3)
      .map(v => ({ key: v.key, name: v.name }));

    const tmdbReviews = (tmdbReviewsData?.results ?? []).slice(0, 10).map(r => ({
      id:          r.id,
      author:      r.author,
      username:    r.author_details?.username ?? r.author,
      avatar_path: r.author_details?.avatar_path ?? null,
      rating:      r.author_details?.rating ?? null,
      content:     r.content,
      created_at:  r.created_at,
    }));

    res.json({ movie, cast, crew, tmdbReviews, comments, trailers, inDb });

    // Cache directors for analytics (fire-and-forget — non-blocking)
    if (inDb && tmdbCredits?.crew) {
      const directors = tmdbCredits.crew.filter(c => c.job === 'Director');
      if (directors.length) {
        const vals = directors.map(d => `(${tmdbId}, ${pool.escapeLiteral ? '' : ''}$1, $2, $3)`);
        // Use parameterised batch insert
        Promise.all(directors.map(d =>
          pool.query(
            `INSERT INTO movie_directors (tmdb_id, director_name, director_tmdb_id)
             VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [parseInt(tmdbId), d.name, d.id || null]
          )
        )).catch(() => {});
      }
    }
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

// ── GET /api/movies/:tmdbId/stream-url ────────────────────────────────────────
// ── GET /api/movies/:tmdbId/stream-url ────────────────────────────────────────
router.get('/:tmdbId/stream-url', requireAuth, async (req, res) => {
  try {
    const { tmdbId } = req.params;

    const { rows } = await pool.query(
      'SELECT jellyfin_id FROM movies WHERE tmdb_id = $1',
      [tmdbId]
    );

    if (!rows[0])             return res.status(404).json({ error: 'Movie not found' });
    if (!rows[0].jellyfin_id) return res.status(404).json({ error: 'No stream available' });

    const jellyfinId       = rows[0].jellyfin_id;
    const jellyfinInternal = process.env.JELLYFIN_URL || 'http://jellyfin:8096';
    const apiKey           = process.env.JELLYFIN_API_KEY;
    const jellyfinUserId   = process.env.JELLYFIN_USER_ID;

    // ── Step 1: Get media info from Jellyfin ─────────────────────────────────
    // userId is required by Jellyfin's UserLibraryController.GetItem
    const userParam = jellyfinUserId ? `&userId=${jellyfinUserId}` : '';
    const infoRes = await fetch(
      `${jellyfinInternal}/Items/${jellyfinId}?api_key=${apiKey}&Fields=MediaStreams${userParam}`
    );

    if (!infoRes.ok) {
      // Jellyfin unavailable — fallback to direct MP4
      const streamUrl = `/stream/Videos/${jellyfinId}/stream?api_key=${apiKey}&static=true&container=mp4`;
      return res.json({ streamUrl, jellyfinId, type: 'mp4', transcoding: false });
    }

    const info = await infoRes.json();
    const mediaStreams = info.MediaStreams || [];

    const videoStream = mediaStreams.find(s => s.Type === 'Video');
    const audioStream = mediaStreams.find(s => s.Type === 'Audio');
    const subtitleStreams = mediaStreams
      .filter(s => s.Type === 'Subtitle')
      .map(s => ({
        index:    s.Index,
        language: s.Language || 'und',
        label:    s.DisplayTitle || s.Title || (s.Language ? s.Language.toUpperCase() : `Track ${s.Index}`),
        url:      `/stream/Videos/${jellyfinId}/Subtitles/${s.Index}/0/Stream.vtt?api_key=${apiKey}`,
      }));

    const videoCodec = videoStream?.Codec?.toLowerCase() || '';
    const audioCodec = audioStream?.Codec?.toLowerCase() || '';

    // ── Step 2: Check if browser can play natively ───────────────────────────
    // Browsers support: H.264 video + AAC/MP3 audio in MP4 container
    const browserCompatibleVideo = ['h264', 'avc1', 'avc'].includes(videoCodec);
    const browserCompatibleAudio = ['aac', 'mp3', 'mp4a'].includes(audioCodec);
    const needsTranscoding = !browserCompatibleVideo || !browserCompatibleAudio;

    console.log(`Movie ${tmdbId}: video=${videoCodec} audio=${audioCodec} transcode=${needsTranscoding}`);

    if (!needsTranscoding) {
      // ── Direct play — no transcoding needed ──────────────────────────────
      const streamUrl = `/stream/Videos/${jellyfinId}/stream?api_key=${apiKey}&static=true&container=mp4`;
      return res.json({
        streamUrl,
        jellyfinId,
        type: 'mp4',
        transcoding: false,
        videoCodec,
        audioCodec,
        subtitles: subtitleStreams,
      });
    }

    // ── Step 3: Transcoding needed — ensure Jellyfin user ID is available ────
    if (!jellyfinUserId) {
      console.warn('JELLYFIN_USER_ID not set — falling back to direct MP4');
      const streamUrl = `/stream/Videos/${jellyfinId}/stream?api_key=${apiKey}&static=true&container=mp4`;
      return res.json({ streamUrl, jellyfinId, type: 'mp4', transcoding: false });
    }

    // ── Step 4: Request HLS playback session from Jellyfin ───────────────────
    const playbackRes = await fetch(
      `${jellyfinInternal}/Items/${jellyfinId}/PlaybackInfo?userId=${jellyfinUserId}&api_key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          DeviceProfile: {
            TranscodingProfiles: [
              {
                Container:      'ts',
                Type:           'Video',
                Protocol:       'hls',
                AudioCodec:     'aac',
                VideoCodec:     'h264',
                MaxAudioChannels: '2',
              }
            ],
            DirectPlayProfiles: [],
            CodecProfiles:      [],
          }
        }),
      }
    );

    if (!playbackRes.ok) {
      console.error('PlaybackInfo failed:', playbackRes.status, '— falling back to direct');
      const streamUrl = `/stream/Videos/${jellyfinId}/stream?api_key=${apiKey}&static=true&container=mp4`;
      return res.json({ streamUrl, jellyfinId, type: 'mp4', transcoding: false });
    }

    const playbackInfo  = await playbackRes.json();
    const playSessionId = playbackInfo.PlaySessionId;
    const mediaSourceId = playbackInfo.MediaSources?.[0]?.Id || jellyfinId;

    // ── Step 5: Build HLS master playlist URL ────────────────────────────────
    const params = new URLSearchParams({
      api_key:                     apiKey,
      MediaSourceId:               mediaSourceId,
      PlaySessionId:               playSessionId,
      VideoCodec:                  'h264',
      AudioCodec:                  'aac',
      AudioStreamIndex:            '1',
      VideoBitrate:                '8000000',
      AudioBitrate:                '128000',
      MaxWidth:                    '1920',
      MaxHeight:                   '1080',
      TranscodingMaxAudioChannels: '2',
      SegmentContainer:            'ts',
      MinSegments:                 '1',
      BreakOnNonKeyFrames:         'true',
    });

    const streamUrl = `/stream/Videos/${jellyfinId}/master.m3u8?${params.toString()}`;

    res.json({
      streamUrl,
      jellyfinId,
      playSessionId,
      type:        'hls',
      transcoding: true,
      videoCodec,
      audioCodec,
      subtitles:   subtitleStreams,
    });

  } catch (err) {
    console.error('stream-url error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
// ── GET /api/movies/:tmdbId/user-subtitles ────────────────────────────────────
router.get('/:tmdbId/user-subtitles', async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const { rows } = await pool.query(
      `SELECT us.id, us.language, us.label, u.username, us.created_at
       FROM user_subtitles us
       JOIN users u ON u.id = us.user_id
       JOIN movies m ON m.id = us.movie_id
       WHERE m.tmdb_id = $1
       ORDER BY us.created_at DESC`,
      [tmdbId]
    );
    res.json({ subtitles: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/movies/:tmdbId/subtitle/:subtitleId ──────────────────────────────
router.get('/:tmdbId/subtitle/:subtitleId', async (req, res) => {
  try {
    const { subtitleId } = req.params;
    const { rows } = await pool.query(
      'SELECT content_vtt FROM user_subtitles WHERE id = $1',
      [subtitleId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Subtitle not found' });
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.send(rows[0].content_vtt);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/movies/:tmdbId/subtitle ─────────────────────────────────────────
router.post('/:tmdbId/subtitle', requireAuth, async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const { content, language = 'en', label = 'Custom' } = req.body;

    if (!content?.trim())          return res.status(400).json({ error: 'Subtitle content required' });
    if (content.length > 2_000_000) return res.status(400).json({ error: 'File too large (max 2 MB)' });

    // Convert SRT → VTT if needed (replace comma ms separator, add WEBVTT header)
    let vttContent = content.trim();
    if (!vttContent.startsWith('WEBVTT')) {
      vttContent = 'WEBVTT\n\n' + vttContent.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    }

    const { rows: movie } = await pool.query(
      'SELECT id FROM movies WHERE tmdb_id = $1', [tmdbId]
    );
    if (!movie[0]) return res.status(404).json({ error: 'Movie not found' });

    const { rows: [sub] } = await pool.query(
      `INSERT INTO user_subtitles (user_id, movie_id, language, label, content_vtt)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, language, label, created_at`,
      [req.user.id, movie[0].id, language.slice(0, 10), label.slice(0, 100), vttContent]
    );

    res.status(201).json({
      subtitle: { ...sub, username: req.user.username },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:tmdbId/progress', requireAuth, async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const { progress_s } = req.body;

    if (progress_s === undefined || progress_s < 0)
      return res.status(400).json({ error: 'Invalid progress value' });

    const { rows: movie } = await pool.query(
      'SELECT id FROM movies WHERE tmdb_id = $1', [tmdbId]
    );
    if (!movie[0]) return res.status(404).json({ error: 'Movie not found' });

    await pool.query(
      `INSERT INTO watch_history (user_id, movie_id, progress_s, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, movie_id)
       DO UPDATE SET progress_s = $3, updated_at = NOW()`,
      [req.user.id, movie[0].id, Math.floor(progress_s)]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});


// ── GET /api/movies/subtitles/search — OpenSubtitles search ──────────────────
router.get('/subtitles/search', async (req, res) => {
  try {
    const key = process.env.OPENSUBTITLES_KEY;
    if (!key) return res.json({ subtitles: [] });

    const { tmdb_id, languages = 'en', query } = req.query;
    const params = new URLSearchParams({ languages });
    if (tmdb_id) params.set('tmdb_id', tmdb_id);
    if (query)   params.set('query', query);
    params.set('type', 'movie');

    const osRes = await fetch(
      `https://api.opensubtitles.com/api/v1/subtitles?${params}`,
      { headers: { 'Api-Key': key, 'Content-Type': 'application/json' } }
    );
    if (!osRes.ok) return res.status(502).json({ error: 'OpenSubtitles unavailable' });
    const data = await osRes.json();

    const subtitles = (data.data || []).slice(0, 20).map(s => ({
      id:          s.id,
      language:    s.attributes.language,
      release:     s.attributes.release,
      downloads:   s.attributes.download_count,
      fps:         s.attributes.fps,
      file_id:     s.attributes.files?.[0]?.file_id,
      file_name:   s.attributes.files?.[0]?.file_name,
    }));

    res.json({ subtitles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/movies/subtitles/download — proxy OpenSubtitles download ────────
router.post('/subtitles/download', requireAuth, async (req, res) => {
  try {
    const key = process.env.OPENSUBTITLES_KEY;
    if (!key) return res.status(503).json({ error: 'OpenSubtitles not configured' });

    const { file_id } = req.body;
    if (!file_id) return res.status(400).json({ error: 'file_id required' });

    const dlRes = await fetch('https://api.opensubtitles.com/api/v1/download', {
      method: 'POST',
      headers: { 'Api-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id }),
    });
    if (!dlRes.ok) return res.status(502).json({ error: 'Download failed' });
    const { link } = await dlRes.json();
    res.json({ link });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;