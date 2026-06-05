import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

const { Pool } = pg;
const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: 20, // match CONCURRENCY
});

const TMDB_TOKEN  = process.env.TMDB_API_TOKEN;
const BASE        = 'https://api.themoviedb.org/3';
const HEADERS     = { Authorization: `Bearer ${TMDB_TOKEN}` };

const START_ID    = 4500;
const END_ID      = 1000000; // Adjust as needed
const CONCURRENCY = 10;      // parallel workers (~10 req/s, well within TMDB free tier)
const MIN_VOTES   = 300;
const MAX_RETRIES = 1;

// ── HTTP ──────────────────────────────────────────────────────────────────────

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

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
      await sleep(200 * (attempt + 1));
    }
  }
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function savePerson(client, person) {
  await client.query(
    `INSERT INTO people (id, name, original_name, gender, profile_path, known_for_department, popularity)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO UPDATE SET
       popularity   = EXCLUDED.popularity,
       profile_path = COALESCE(EXCLUDED.profile_path, people.profile_path)`,
    [
      person.id,
      person.name,
      person.original_name        || null,
      person.gender               || 0,
      person.profile_path         || null,
      person.known_for_department || null,
      person.popularity           || 0,
    ]
  );
}

// Builds a single multi-row INSERT — far fewer round-trips than one row at a time.
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

// ── Core import ───────────────────────────────────────────────────────────────

const KEEP_JOBS = new Set([
  'Director', 'Screenplay', 'Writer', 'Story', 'Novel',
  'Director of Photography', 'Original Music Composer',
  'Executive Producer', 'Producer',
]);

async function importMovie(tmdbId, client) {
  const m = await get(
    `${BASE}/movie/${tmdbId}?language=en-US&append_to_response=credits,keywords,reviews`
  );

  if (!m)                                               return 'not_found';
  if (!m.overview || !m.poster_path || !m.release_date) return 'skipped';
  if ((m.vote_count ?? 0) < MIN_VOTES)                  return 'skipped';

  await client.query('BEGIN');

  try {
    // ── Core movie ────────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO movies (
        tmdb_id, imdb_id, title, original_title, overview, tagline,
        poster_path, backdrop_path, release_date, runtime,
        budget, revenue, popularity, vote_average, vote_count,
        original_language, status, homepage, adult
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      ON CONFLICT (tmdb_id) DO UPDATE SET
        vote_average = EXCLUDED.vote_average,
        vote_count   = EXCLUDED.vote_count,
        popularity   = EXCLUDED.popularity,
        runtime      = COALESCE(EXCLUDED.runtime, movies.runtime)`,
      [
        m.id, m.imdb_id || null, m.title, m.original_title || null,
        m.overview, m.tagline || null, m.poster_path, m.backdrop_path || null,
        m.release_date, m.runtime || null, m.budget || 0, m.revenue || 0,
        m.popularity, m.vote_average, m.vote_count, m.original_language,
        m.status || null, m.homepage || null, m.adult || false,
      ]
    );

    // ── Genres (bulk) ─────────────────────────────────────────────────────────
    const genres = m.genres || [];
    if (genres.length) {
      await client.query(buildBulkInsert('genres', ['id','name'], genres.map(g => [g.id, g.name])));
      await client.query(buildBulkInsert('movie_genres', ['tmdb_id','genre_id'], genres.map(g => [m.id, g.id])));
    }

    // ── Production companies (bulk) ───────────────────────────────────────────
    const companies = m.production_companies || [];
    if (companies.length) {
      await client.query(buildBulkInsert(
        'production_companies', ['id','name','logo_path','origin_country'],
        companies.map(c => [c.id, c.name, c.logo_path || null, c.origin_country || null])
      ));
      await client.query(buildBulkInsert(
        'movie_production_companies', ['tmdb_id','company_id'],
        companies.map(c => [m.id, c.id])
      ));
    }

    // ── Countries (bulk) ──────────────────────────────────────────────────────
    const countries = m.production_countries || [];
    if (countries.length) {
      await client.query(buildBulkInsert(
        'movie_countries', ['tmdb_id','iso_code','name'],
        countries.map(c => [m.id, c.iso_3166_1, c.name])
      ));
    }

    // ── Languages (bulk) ──────────────────────────────────────────────────────
    const langs = m.spoken_languages || [];
    if (langs.length) {
      await client.query(buildBulkInsert(
        'movie_languages', ['tmdb_id','iso_code','name','english_name'],
        langs.map(l => [m.id, l.iso_639_1, l.name, l.english_name])
      ));
    }

    // ── Cast (bulk, top 20) ───────────────────────────────────────────────────
    const cast = (m.credits?.cast || []).slice(0, 20);
    for (const c of cast) await savePerson(client, c);
    if (cast.length) {
      await client.query(buildBulkInsert(
        'movie_cast', ['tmdb_id','person_id','character','credit_id','cast_order'],
        cast.map(c => [m.id, c.id, c.character || null, c.credit_id, c.order])
      ));
    }

    // ── Crew (bulk) ───────────────────────────────────────────────────────────
    const crew = (m.credits?.crew || []).filter(c => KEEP_JOBS.has(c.job));
    for (const c of crew) await savePerson(client, c);
    if (crew.length) {
      await client.query(buildBulkInsert(
        'movie_crew', ['tmdb_id','person_id','department','job','credit_id'],
        crew.map(c => [m.id, c.id, c.department || null, c.job, c.credit_id])
      ));
    }

    // ── Keywords (bulk) ───────────────────────────────────────────────────────
    const keywords = m.keywords?.keywords || [];
    if (keywords.length) {
      await client.query(buildBulkInsert('keywords', ['id','name'], keywords.map(k => [k.id, k.name])));
      await client.query(buildBulkInsert(
        'movie_keywords', ['tmdb_id','keyword_id'],
        keywords.map(k => [m.id, k.id])
      ));
    }

    // ── Reviews (bulk) ────────────────────────────────────────────────────────
    const reviews = m.reviews?.results || [];
    if (reviews.length) {
      await client.query(buildBulkInsert(
        'movie_reviews',
        ['id','tmdb_id','author','username','avatar_path','rating','content','tmdb_url','created_at','updated_at'],
        reviews.map(r => [
          r.id, m.id, r.author || null,
          r.author_details?.username   || null,
          r.author_details?.avatar_path || null,
          r.author_details?.rating      || null,
          r.content || null, r.url || null,
          r.created_at ? new Date(r.created_at) : null,
          r.updated_at ? new Date(r.updated_at) : null,
        ])
      ));
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

  // Spin up CONCURRENCY workers and let them race through the queue
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  try {
    await pool.query('SELECT 1');
    console.log('Connected to Postgres on port 5433');
  } catch (err) {
    console.error('DB connection failed:', err.message);
    process.exit(1);
  }

  // Load already-imported IDs for resume support
  const { rows: existing } = await pool.query('SELECT tmdb_id FROM movies');
  const existingSet = new Set(existing.map(r => r.tmdb_id));

  // Build work queue, skipping already-imported IDs without an API call
  const ids = [];
  for (let id = START_ID; id <= END_ID; id++) {
    if (!existingSet.has(id)) ids.push(id);
  }

  console.log(`Already in DB : ${existingSet.size}`);
  console.log(`IDs to scan   : ${ids.length}  (${START_ID}–${END_ID})`);
  console.log(`Concurrency   : ${CONCURRENCY} workers\n`);

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
    const eta     = Math.round((total - done) / (rate || 1));
    process.stdout.write(
      `\r  [${done}/${total}] inserted=${inserted} skipped=${skipped} not_found=${not_found} failed=${failed} | ${rate}/s | ETA ${eta}s   `
    );
  });

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n\nFinished in ${elapsed} min`);
  console.log(`Inserted: ${inserted} | Skipped: ${skipped} | Not found: ${not_found} | Failed: ${failed}`);

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });