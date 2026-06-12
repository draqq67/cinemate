#!/usr/bin/env node
/**
 * Batch-populate movie_directors + movie_actors for all movies in the catalog.
 * Fetches TMDB credits, stays within 40 req/10s rate limit.
 *
 * Usage (from repo root):
 *   node backend/scripts/populateCredits.js
 *   node backend/scripts/populateCredits.js --limit 500     # only first 500 movies
 *   node backend/scripts/populateCredits.js --missing-only  # skip already-cached movies
 */
import 'dotenv/config';
import pg from 'pg';
import { parseArgs } from 'util';

const { values: args } = parseArgs({
  options: {
    limit:        { type: 'string',  default: '0' },
    'missing-only': { type: 'boolean', default: true },
  },
});

const pool = new pg.Pool({
  host:     process.env.POSTGRES_HOST     || 'localhost',
  port:     parseInt(process.env.POSTGRES_PORT || '5433'),
  user:     process.env.POSTGRES_USER     || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'marga',
  database: process.env.POSTGRES_DB       || 'cinemate',
});

const TMDB_TOKEN = process.env.TMDB_API_TOKEN;
if (!TMDB_TOKEN) { console.error('TMDB_API_TOKEN not set in .env'); process.exit(1); }

async function fetchCredits(tmdbId) {
  const r = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/credits`, {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}` },
  });
  return r.ok ? r.json() : null;
}

async function cacheMovie(tmdbId, data) {
  const directors = (data.crew || []).filter(c => c.job === 'Director');
  const actors    = (data.cast || []).slice(0, 10);

  await Promise.all([
    ...directors.map(d => pool.query(
      `INSERT INTO movie_directors (tmdb_id, director_name, director_tmdb_id)
       VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [tmdbId, d.name, d.id || null]
    )),
    ...actors.map(a => pool.query(
      `INSERT INTO movie_actors (tmdb_id, actor_name, actor_tmdb_id, profile_path, cast_order)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [tmdbId, a.name, a.id || null, a.profile_path || null, a.order ?? null]
    )),
  ]);
}

async function main() {
  const limit = parseInt(args.limit) || 0;
  const missingOnly = args['missing-only'];

  let query = 'SELECT tmdb_id FROM movies';
  if (missingOnly) {
    query += ' WHERE tmdb_id NOT IN (SELECT DISTINCT tmdb_id FROM movie_directors)';
  }
  query += ' ORDER BY popularity DESC';
  if (limit) query += ` LIMIT ${limit}`;

  const { rows } = await pool.query(query);
  const total = rows.length;
  console.log(`Processing ${total} movies (missing-only=${missingOnly}, limit=${limit || 'all'})…`);

  let done = 0, errors = 0;
  // Process in batches of 5 (well within 40 req/10s limit)
  for (let i = 0; i < rows.length; i += 5) {
    const batch = rows.slice(i, i + 5);
    await Promise.all(batch.map(async ({ tmdb_id }) => {
      try {
        const data = await fetchCredits(tmdb_id);
        if (data) await cacheMovie(tmdb_id, data);
        done++;
      } catch { errors++; }
    }));
    if ((i + 5) % 100 === 0) {
      process.stdout.write(`  ${done}/${total} done, ${errors} errors\r`);
    }
    // Small delay between batches to be safe
    await new Promise(r => setTimeout(r, 260));
  }

  console.log(`\nDone. ${done} movies processed, ${errors} errors.`);
  const { rows: counts } = await pool.query(
    'SELECT (SELECT COUNT(*) FROM movie_directors) AS directors, (SELECT COUNT(*) FROM movie_actors) AS actors'
  );
  console.log(`Cache: ${counts[0].directors} directors, ${counts[0].actors} actors`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
