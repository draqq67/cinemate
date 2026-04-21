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
});

const TMDB_TOKEN = process.env.TMDB_API_TOKEN;
const BASE = 'https://api.themoviedb.org/3';
const headers = { Authorization: `Bearer ${TMDB_TOKEN}` };
const TARGET = 1000;

async function get(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function collectIds() {
  const lists = ['movie/popular', 'movie/top_rated', 'movie/now_playing', 'movie/upcoming'];
  const seen = new Set();
  const ids = [];

  for (const list of lists) {
    if (ids.length >= TARGET) break;
    const first = await get(`${BASE}/${list}?language=en-US&page=1`);
    const totalPages = Math.min(first.total_pages, 500);
    process.stdout.write(`\n  ${list} — ${totalPages} pages\n`);

    for (let page = 1; page <= totalPages; page++) {
      if (ids.length >= TARGET) break;
      try {
        const data = page === 1 ? first : await get(`${BASE}/${list}?language=en-US&page=${page}`);
        for (const m of data.results) {
          if (!seen.has(m.id)) { seen.add(m.id); ids.push(m.id); }
        }
        process.stdout.write(`\r    p${page}/${totalPages} — ${ids.length} IDs collected`);
        await sleep(150);
      } catch (err) {
        console.error(`\n    Failed page ${page}: ${err.message}`);
        await sleep(1000);
      }
    }
    console.log();
  }

  if (ids.length < TARGET) {
    console.log('\n  Supplementing with discover...');
    for (let page = 1; ids.length < TARGET; page++) {
      try {
        const data = await get(
          `${BASE}/discover/movie?language=en-US&sort_by=popularity.desc&vote_count.gte=50&page=${page}`
        );
        if (!data.results?.length) break;
        for (const m of data.results) {
          if (!seen.has(m.id)) { seen.add(m.id); ids.push(m.id); }
        }
        process.stdout.write(`\r    discover p${page} — ${ids.length} IDs`);
        await sleep(150);
      } catch (err) {
        console.error(`\n    Failed: ${err.message}`);
        await sleep(1000);
      }
    }
    console.log();
  }

  return ids.slice(0, TARGET);
}

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
      person.original_name || null,
      person.gender || 0,
      person.profile_path || null,
      person.known_for_department || null,
      person.popularity || 0,
    ]
  );
}

async function importMovie(tmdbId, client) {
  const m = await get(
    `${BASE}/movie/${tmdbId}?language=en-US&append_to_response=credits,keywords,reviews`
  );

  if (!m.overview || !m.poster_path || !m.release_date) return false;

  await client.query('BEGIN');

  try {
    // ── Core movie ──────────────────────────────────────────────────────────
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
        m.id,
        m.imdb_id || null,
        m.title,
        m.original_title || null,
        m.overview,
        m.tagline || null,
        m.poster_path,
        m.backdrop_path || null,
        m.release_date,
        m.runtime || null,
        m.budget || 0,
        m.revenue || 0,
        m.popularity,
        m.vote_average,
        m.vote_count,
        m.original_language,
        m.status || null,
        m.homepage || null,
        m.adult || false,
      ]
    );

    // ── Genres ───────────────────────────────────────────────────────────────
    for (const g of m.genres || []) {
      await client.query(
        `INSERT INTO genres (id, name) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING`,
        [g.id, g.name]
      );
      await client.query(
        `INSERT INTO movie_genres (tmdb_id, genre_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [m.id, g.id]
      );
    }

    // ── Production companies ─────────────────────────────────────────────────
    for (const c of m.production_companies || []) {
      await client.query(
        `INSERT INTO production_companies (id, name, logo_path, origin_country)
         VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
        [c.id, c.name, c.logo_path || null, c.origin_country || null]
      );
      await client.query(
        `INSERT INTO movie_production_companies (tmdb_id, company_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [m.id, c.id]
      );
    }

    // ── Countries ────────────────────────────────────────────────────────────
    for (const c of m.production_countries || []) {
      await client.query(
        `INSERT INTO movie_countries (tmdb_id, iso_code, name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [m.id, c.iso_3166_1, c.name]
      );
    }

    // ── Languages ────────────────────────────────────────────────────────────
    for (const l of m.spoken_languages || []) {
      await client.query(
        `INSERT INTO movie_languages (tmdb_id, iso_code, name, english_name) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [m.id, l.iso_639_1, l.name, l.english_name]
      );
    }

    // ── Cast ─────────────────────────────────────────────────────────────────
    const cast = (m.credits?.cast || []).slice(0, 20); // top 20 billed
    for (const c of cast) {
      await savePerson(client, c);
      await client.query(
        `INSERT INTO movie_cast (tmdb_id, person_id, character, credit_id, cast_order)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (credit_id) DO NOTHING`,
        [m.id, c.id, c.character || null, c.credit_id, c.order]
      );
    }

    // ── Crew (director, writers, DOP, composer only) ─────────────────────────
    const KEEP_JOBS = new Set([
      'Director', 'Screenplay', 'Writer', 'Story', 'Novel',
      'Director of Photography', 'Original Music Composer',
      'Executive Producer', 'Producer',
    ]);
    const crew = (m.credits?.crew || []).filter(c => KEEP_JOBS.has(c.job));
    for (const c of crew) {
      await savePerson(client, c);
      await client.query(
        `INSERT INTO movie_crew (tmdb_id, person_id, department, job, credit_id)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (credit_id) DO NOTHING`,
        [m.id, c.id, c.department || null, c.job, c.credit_id]
      );
    }

    // ── Keywords ─────────────────────────────────────────────────────────────
    for (const k of m.keywords?.keywords || []) {
      await client.query(
        `INSERT INTO keywords (id, name) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING`,
        [k.id, k.name]
      );
      await client.query(
        `INSERT INTO movie_keywords (tmdb_id, keyword_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [m.id, k.id]
      );
    }

    // ── Reviews ──────────────────────────────────────────────────────────────
    for (const r of m.reviews?.results || []) {
      await client.query(
        `INSERT INTO movie_reviews (id, tmdb_id, author, username, avatar_path, rating, content, tmdb_url, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO NOTHING`,
        [
          r.id,
          m.id,
          r.author || null,
          r.author_details?.username || null,
          r.author_details?.avatar_path || null,
          r.author_details?.rating || null,
          r.content || null,
          r.url || null,
          r.created_at ? new Date(r.created_at) : null,
          r.updated_at ? new Date(r.updated_at) : null,
        ]
      );
    }

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function main() {
  try {
    await pool.query('SELECT 1');
    console.log('Connected to Postgres on port 5433');
  } catch (err) {
    console.error('DB connection failed:', err.message);
    process.exit(1);
  }

  console.log('\nCollecting movie IDs...');
  const ids = await collectIds();
  console.log(`\nCollected ${ids.length} IDs`);

  // Resume support — skip already imported
  const { rows: existing } = await pool.query('SELECT tmdb_id FROM movies');
  const existingSet = new Set(existing.map(r => r.tmdb_id));
  const toImport = ids.filter(id => !existingSet.has(id));
  console.log(`Already in DB: ${existingSet.size} | To import: ${toImport.length}\n`);

  let inserted = 0, skipped = 0, failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < toImport.length; i++) {
    const tmdbId = toImport[i];
    const client = await pool.connect();
    try {
      const ok = await importMovie(tmdbId, client);
      ok ? inserted++ : skipped++;
    } catch (err) {
      failed++;
      // uncomment to debug: console.error(`\n  Failed ${tmdbId}: ${err.message}`);
    } finally {
      client.release();
    }

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = (inserted / (elapsed || 1)).toFixed(1);
    const eta = Math.round((toImport.length - i - 1) / (rate || 1));
    process.stdout.write(
      `\r  [${i + 1}/${toImport.length}] inserted=${inserted} skipped=${skipped} failed=${failed} | ${rate}/s | ETA ${eta}s   `
    );

    await sleep(200); // ~5 req/s — safe for append_to_response (counts as 3-4 requests)
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n\nFinished in ${elapsed} min`);
  console.log(`Inserted: ${inserted} | Skipped: ${skipped} | Failed: ${failed}`);

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });