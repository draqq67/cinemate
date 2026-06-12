#!/usr/bin/env node
/**
 * Import TMDB movies into Cinemate DB.
 *
 * Phase 1 — Discover: iterates /discover/movie year-by-year to collect all
 *   real TMDB IDs (no wasted 404 calls from sequential scanning).
 * Phase 2 — Detail: concurrent workers fetch /movie/:id and insert into DB.
 *
 * Usage:
 *   node backend/scripts/importMovies.js
 *   node backend/scripts/importMovies.js --from-year 2000 --to-year 2024
 *   node backend/scripts/importMovies.js --concurrency 20 --min-votes 50
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseArgs } from 'util';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

const THIS_YEAR = new Date().getFullYear();

const { values: args } = parseArgs({
  options: {
    'from-year':  { type: 'string', default: '1888'       },
    'to-year':    { type: 'string', default: String(THIS_YEAR) },
    concurrency:  { type: 'string', default: '15'          },
    'min-votes':  { type: 'string', default: '50'          },
  },
});

const FROM_YEAR  = parseInt(args['from-year']);
const TO_YEAR    = parseInt(args['to-year']);
const CONCURRENCY = parseInt(args.concurrency);
const MIN_VOTES  = parseInt(args['min-votes']);
const MAX_RETRIES = 2;

const { Pool } = pg;
const pool = new Pool({
  host:     'localhost',
  port:     5433,
  database: process.env.POSTGRES_DB,
  user:     process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max:      CONCURRENCY + 4,
});

const TMDB_TOKEN = process.env.TMDB_API_TOKEN;
const BASE       = 'https://api.themoviedb.org/3';
const HEADERS    = { Authorization: `Bearer ${TMDB_TOKEN}` };

if (!TMDB_TOKEN) { console.error('TMDB_API_TOKEN not set in .env'); process.exit(1); }

// ── HTTP ──────────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function get(url, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.status === 404) return null;
      if (res.status === 429) {
        const wait = parseInt(res.headers.get('retry-after') || '10', 10) * 1000;
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(300 * (attempt + 1));
    }
  }
}

// ── Phase 1: Discover all movie IDs year-by-year ──────────────────────────────

async function discoverYear(year, minVotes) {
  const ids = new Set();
  let page = 1;

  while (true) {
    const url =
      `${BASE}/discover/movie` +
      `?primary_release_year=${year}` +
      `&vote_count.gte=${minVotes}` +
      `&sort_by=vote_count.desc` +
      `&page=${page}`;

    const data = await get(url);
    if (!data || !data.results || data.results.length === 0) break;

    for (const m of data.results) ids.add(m.id);

    if (page >= data.total_pages || page >= 500) break;
    page++;

    // Respect TMDB rate limit ~40 req/10s; small pause between discover pages
    await sleep(100);
  }

  return ids;
}

async function discoverAllIds(fromYear, toYear, minVotes) {
  const allIds = new Set();
  const years  = [];
  for (let y = fromYear; y <= toYear; y++) years.push(y);

  console.log(`Phase 1: Discovering movie IDs for years ${fromYear}–${toYear} (min votes: ${minVotes})`);
  let done = 0;

  // Process years in small concurrent batches to stay under rate limit
  const YEAR_BATCH = 3;
  for (let i = 0; i < years.length; i += YEAR_BATCH) {
    const batch = years.slice(i, i + YEAR_BATCH);
    const results = await Promise.all(batch.map(y => discoverYear(y, minVotes)));
    for (const s of results) for (const id of s) allIds.add(id);
    done += batch.length;
    process.stdout.write(
      `\r  [discover] ${done}/${years.length} years | ${allIds.size.toLocaleString()} IDs found   `
    );
  }

  console.log(`\n  Discovered ${allIds.size.toLocaleString()} unique movie IDs\n`);
  return allIds;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

function buildBulkInsert(table, cols, rows, conflictAction = 'DO NOTHING') {
  if (!rows.length) return null;
  const width  = cols.length;
  const params = [];
  const chunks = rows.map((row, i) => {
    const ph = row.map((_, j) => `$${i * width + j + 1}`).join(',');
    params.push(...row);
    return `(${ph})`;
  });
  return {
    text:   `INSERT INTO ${table} (${cols.join(',')}) VALUES ${chunks.join(',')} ON CONFLICT ${conflictAction}`,
    values: params,
  };
}

// ── Phase 2: Fetch detail + insert ────────────────────────────────────────────

async function importMovie(tmdbId, client) {
  const m = await get(`${BASE}/movie/${tmdbId}?language=en-US`);

  if (!m)                                       return 'not_found';
  if (!m.poster_path || !m.release_date)        return 'skipped';
  if ((m.vote_count ?? 0) < MIN_VOTES)          return 'skipped';

  await client.query('BEGIN');
  try {
    await client.query(
      `INSERT INTO movies (tmdb_id, title, poster_path, release_date, runtime, popularity, vote_average, vote_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tmdb_id) DO UPDATE SET
         vote_average = EXCLUDED.vote_average,
         vote_count   = EXCLUDED.vote_count,
         popularity   = EXCLUDED.popularity,
         runtime      = COALESCE(EXCLUDED.runtime, movies.runtime)`,
      [
        m.id, m.title, m.poster_path, m.release_date,
        m.runtime || null, m.popularity, m.vote_average, m.vote_count,
      ]
    );

    const genres = m.genres || [];
    if (genres.length) {
      const gQ = buildBulkInsert('genres', ['id','name'], genres.map(g => [g.id, g.name]));
      if (gQ) await client.query(gQ);
      const mgQ = buildBulkInsert('movie_genres', ['tmdb_id','genre_id'], genres.map(g => [m.id, g.id]));
      if (mgQ) await client.query(mgQ);
    }

    await client.query('COMMIT');
    return 'inserted';
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

// ── Concurrent worker pool ────────────────────────────────────────────────────

async function runWorkers(ids, onResult) {
  let idx = 0;

  async function worker() {
    while (idx < ids.length) {
      const tmdbId = ids[idx++];
      const client = await pool.connect();
      try {
        const result = await importMovie(tmdbId, client);
        onResult(tmdbId, result, null);
      } catch (err) {
        onResult(tmdbId, null, err);
      } finally {
        client.release();
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  try {
    await pool.query('SELECT 1');
    console.log(`Connected to Postgres on port 5433`);
  } catch (err) {
    console.error('DB connection failed:', err.message);
    process.exit(1);
  }

  // Phase 1: discover all real TMDB IDs for the year range
  const discoveredIds = await discoverAllIds(FROM_YEAR, TO_YEAR, MIN_VOTES);

  // Load existing IDs from DB to skip re-fetching
  const { rows: existing } = await pool.query('SELECT tmdb_id FROM movies');
  const existingSet = new Set(existing.map(r => r.tmdb_id));

  const ids = [...discoveredIds].filter(id => !existingSet.has(id));

  console.log(`Phase 2: Fetching details & inserting`);
  console.log(`  Already in DB : ${existingSet.size.toLocaleString()}`);
  console.log(`  New to import : ${ids.length.toLocaleString()}`);
  console.log(`  Concurrency   : ${CONCURRENCY} workers | Min votes: ${MIN_VOTES}\n`);

  if (ids.length === 0) {
    console.log('Nothing new to import.');
    await pool.end();
    return;
  }

  let inserted = 0, skipped = 0, not_found = 0, failed = 0, done = 0;
  const total     = ids.length;
  const startTime = Date.now();

  await runWorkers(ids, (_tmdbId, result, err) => {
    done++;
    if (err)                         failed++;
    else if (result === 'inserted')  inserted++;
    else if (result === 'not_found') not_found++;
    else                             skipped++;

    const elapsed = (Date.now() - startTime) / 1000;
    const rate    = (done / (elapsed || 1)).toFixed(1);
    const eta     = Math.round((total - done) / (parseFloat(rate) || 1));
    const pct     = ((done / total) * 100).toFixed(1);
    process.stdout.write(
      `\r  [${pct}%] ${done.toLocaleString()}/${total.toLocaleString()} | +${inserted} skipped=${skipped} 404=${not_found} err=${failed} | ${rate}/s ETA ${eta}s   `
    );
  });

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n\nFinished in ${elapsed} min`);
  console.log(`Inserted: ${inserted.toLocaleString()} | Skipped: ${skipped.toLocaleString()} | Not found: ${not_found.toLocaleString()} | Errors: ${failed}`);

  const { rows: [totals] } = await pool.query('SELECT COUNT(*) AS total FROM movies');
  console.log(`Total movies in DB: ${parseInt(totals.total).toLocaleString()}`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
