#!/usr/bin/env python3
"""
Simulate realistic Cinemate user data for recommendation system development.

Usage (from repo root):
    python ml/simulate_data.py                      # 200 users, seed 42
    python ml/simulate_data.py --users 500          # 500 users
    python ml/simulate_data.py --reset              # wipe previous synthetic data first
    python ml/simulate_data.py --users 300 --reset

What it inserts:
    users          — N synthetic users (password: pass1234)
    ratings        — genre-correlated scores 1–10, power-law count distribution
    watch_history  — progress_s correlated with rating score
    watchlist      — unseen movies matching each user's taste
    comments       — 15% of rated movies get a short comment
    user_follows   — sparse social graph so the activity feed works

Connects to localhost:5433.
Requires: pip install psycopg2-binary bcrypt numpy
"""

import argparse
import random
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import numpy as np
import psycopg2
import psycopg2.extras

# ── DB ─────────────────────────────────────────────────────────────────────────
DB = dict(host='localhost', port=5433, dbname='cinemate', user='postgres', password='marga')

# All synthetic users share this password so you can log in as any of them
_HASH = bcrypt.hashpw(b'pass1234', bcrypt.gensalt(rounds=10)).decode()
SIM_SUFFIX = '@sim.cinemate'

# ── Genre taste profiles (exact TMDB genre names from your DB) ─────────────────
# Weights don't need to sum to 1 — they are normalised per user.
PROFILES = {
    'action_fan':   {'Action': 5, 'Thriller': 4, 'Adventure': 3, 'Science Fiction': 2, 'Crime': 2},
    'drama_fan':    {'Drama': 6, 'Romance': 3, 'History': 2, 'Mystery': 2, 'War': 1},
    'horror_fan':   {'Horror': 7, 'Thriller': 4, 'Mystery': 2, 'Science Fiction': 1},
    'comedy_fan':   {'Comedy': 6, 'Romance': 3, 'Animation': 2, 'Family': 2, 'Music': 1},
    'scifi_fan':    {'Science Fiction': 6, 'Action': 3, 'Adventure': 3, 'Fantasy': 3, 'Thriller': 1},
    'arthouse_fan': {'Drama': 5, 'Documentary': 5, 'History': 3, 'War': 2, 'Music': 2},
    'family_fan':   {'Family': 5, 'Animation': 5, 'Comedy': 3, 'Adventure': 2, 'Fantasy': 2},
    'crime_fan':    {'Crime': 6, 'Thriller': 4, 'Mystery': 4, 'Drama': 2},
    'eclectic':     {},  # uniform across all genres
}

COMMENTS = {
    'positive': [
        "One of the best I've seen in years.",
        "Absolutely captivating from start to finish.",
        "Highly recommend — don't sleep on this one.",
        "Exceeded my expectations in every way.",
        "The performances alone make it worth watching.",
        "Could not take my eyes off the screen.",
        "Beautifully crafted and deeply moving.",
        "Instant favourite. Will rewatch.",
        "Stunning cinematography and a tight script.",
        "Rare film that genuinely surprised me.",
    ],
    'mixed': [
        "Good but not great. Has its moments.",
        "Worth watching once, maybe not twice.",
        "Some brilliant scenes dragged down by a weak third act.",
        "Enjoyable enough, just forgettable.",
        "Interesting premise, uneven execution.",
        "Decent performances, mediocre script.",
        "Started strong, lost steam halfway through.",
    ],
    'negative': [
        "Disappointing given the hype.",
        "Not for me, but I can see why others like it.",
        "Overly long and self-indulgent.",
        "Expected much more based on the reviews.",
        "Struggled to finish the second half.",
        "Technically fine but completely hollow.",
    ],
}


def sentiment(score: int) -> str:
    if score >= 7: return 'positive'
    if score >= 5: return 'mixed'
    return 'negative'


# ── Load movies ────────────────────────────────────────────────────────────────
def load_movies(cur):
    cur.execute("""
        SELECT
            m.id::text,
            m.vote_average,
            m.popularity,
            COALESCE(m.runtime, 100)  AS runtime,
            COALESCE(
                array_agg(g.name) FILTER (WHERE g.name IS NOT NULL),
                '{}'
            ) AS genres
        FROM movies m
        LEFT JOIN movie_genres mg ON mg.tmdb_id = m.tmdb_id
        LEFT JOIN genres        g  ON g.id = mg.genre_id
        GROUP BY m.id, m.vote_average, m.popularity, m.runtime
        ORDER BY m.popularity DESC NULLS LAST
    """)
    return cur.fetchall()


# ── Per-user data generation ───────────────────────────────────────────────────
def build_user(i: int, movies, all_genres: set, pop_weights: np.ndarray, rng, now: datetime):
    user_id  = str(uuid.uuid4())
    username = f'sim_user_{i+1:04d}'
    email    = f'{username}{SIM_SUFFIX}'
    created  = now - timedelta(days=int(rng.integers(60, 730)))

    # Taste profile: pick a primary archetype, 40% chance of blending a second
    profile_names = list(PROFILES.keys())
    primary  = rng.choice(profile_names)
    raw      = dict(PROFILES[primary])
    if rng.random() < 0.40:
        secondary = rng.choice(profile_names)
        for g, w in PROFILES[secondary].items():
            raw[g] = raw.get(g, 0) + w * 0.5

    if raw:
        total       = sum(raw.values())
        genre_prefs = {g: w / total for g, w in raw.items()}
    else:
        genre_prefs = {g: 1.0 / len(all_genres) for g in all_genres}

    # Per-user rating bias: some people rate high (generous), some low (harsh)
    user_bias = float(rng.normal(0, 0.6))

    # Rating count: 30% casual (5–20), 55% regular (20–100), 15% power (100–400)
    tier = rng.choice(['casual', 'regular', 'power'], p=[0.30, 0.55, 0.15])
    if tier == 'casual':
        n_rate = int(rng.integers(5, 20))
    elif tier == 'regular':
        n_rate = int(np.clip(rng.lognormal(3.5, 0.6), 20, 100))
    else:
        n_rate = int(np.clip(rng.lognormal(4.8, 0.5), 100, 400))
    n_rate = min(n_rate, len(movies))

    # Movie sampling weights: genre match + damped popularity
    genre_match = np.array([
        sum(genre_prefs.get(g, 0) for g in m['genres']) / max(len(m['genres']), 1)
        for m in movies
    ])
    weights = (genre_match + 0.05) * pop_weights
    weights /= weights.sum()

    rated_indices = rng.choice(len(movies), size=n_rate, replace=False, p=weights)
    rated_set     = set(rated_indices.tolist())

    lifespan_days = max(1, (now - created).days)

    ratings, history, watchlist, comments = [], [], [], []

    for idx in rated_indices:
        m       = movies[idx]
        gm      = float(genre_match[idx])
        quality = (float(m['vote_average'] or 5.0) - 5.0) / 5.0   # −1 to +1
        noise   = float(rng.normal(0, 0.75))
        raw_s   = 3.5 + 4.0 * gm + 1.5 * quality + user_bias + noise
        score   = int(np.clip(round(raw_s), 1, 10))

        rated_at = created + timedelta(days=int(rng.integers(1, lifespan_days)))

        ratings.append((user_id, m['id'], score, rated_at))

        # Watch progress: higher score → watched more of the film
        runtime_s = int(m['runtime']) * 60
        if score >= 7:
            frac = float(rng.uniform(0.85, 1.00))
        elif score >= 5:
            frac = float(rng.uniform(0.45, 0.85))
        else:
            frac = float(rng.uniform(0.10, 0.45))
        history.append((user_id, m['id'], int(runtime_s * frac), rated_at))

        if rng.random() < 0.15:
            body = random.choice(COMMENTS[sentiment(score)])
            comments.append((user_id, m['id'], body))

    # Watchlist: unwatched movies that match taste (10–30 entries)
    n_wl          = int(rng.integers(10, 30))
    unwatched_w   = weights.copy()
    unwatched_w[list(rated_set)] = 0
    if unwatched_w.sum() > 1e-9:
        unwatched_w /= unwatched_w.sum()
        wl_indices   = rng.choice(len(movies), size=min(n_wl, int((unwatched_w > 0).sum())),
                                  replace=False, p=unwatched_w)
        for idx in wl_indices:
            watchlist.append((user_id, movies[idx]['id']))

    user_row = (user_id, email, username, _HASH, 'user', created)
    return user_row, ratings, history, watchlist, comments


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--users', type=int, default=200)
    parser.add_argument('--seed',  type=int, default=42)
    parser.add_argument('--reset', action='store_true',
                        help='Delete previous synthetic data before inserting')
    args = parser.parse_args()

    rng = np.random.default_rng(args.seed)
    random.seed(args.seed)

    print('Connecting to postgres at localhost:5433 …')
    conn = psycopg2.connect(**DB)
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    if args.reset:
        cur.execute("DELETE FROM users WHERE email LIKE %s", (f'%{SIM_SUFFIX}',))
        deleted = cur.rowcount
        conn.commit()
        print(f'Reset: removed {deleted} previous synthetic users (cascades to ratings, history, etc.).')

    movies = load_movies(cur)
    if not movies:
        print('No movies in DB. Run importMovies.js first.')
        return
    print(f'Loaded {len(movies):,} movies.')

    all_genres  = set(g for m in movies for g in m['genres'])
    popularities = np.array([float(m['popularity'] or 0) for m in movies])
    pop_weights  = popularities ** 0.25
    pop_weights  = pop_weights / pop_weights.sum()

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    all_users, all_ratings, all_history, all_watchlist, all_comments = [], [], [], [], []

    print(f'Generating {args.users} users …')
    for i in range(args.users):
        u, r, h, w, c = build_user(i, movies, all_genres, pop_weights, rng, now)
        all_users.append(u)
        all_ratings.extend(r)
        all_history.extend(h)
        all_watchlist.extend(w)
        all_comments.extend(c)
        if (i + 1) % 50 == 0:
            print(f'  {i+1}/{args.users}')

    # Generate a sparse follow graph so the activity feed has content.
    # Each user follows 5–20 other random users.
    user_ids   = [u[0] for u in all_users]
    all_follows = []
    for uid in user_ids:
        n_follow = int(rng.integers(5, 20))
        targets  = rng.choice([x for x in user_ids if x != uid],
                              size=min(n_follow, len(user_ids) - 1), replace=False)
        for tid in targets:
            all_follows.append((uid, tid))

    # ── Batch inserts ──────────────────────────────────────────────────────────
    cur2 = conn.cursor()

    print(f'Inserting {len(all_users)} users …')
    psycopg2.extras.execute_values(cur2, """
        INSERT INTO users (id, email, username, password, role, created_at)
        VALUES %s
        ON CONFLICT (email) DO NOTHING
    """, all_users)

    # Ratings trigger fires per-row and updates avg_rating on movies — this is intentional.
    print(f'Inserting {len(all_ratings):,} ratings (trigger updates avg_rating — may take ~30s) …')
    psycopg2.extras.execute_values(cur2, """
        INSERT INTO ratings (user_id, movie_id, score, created_at)
        VALUES %s
        ON CONFLICT (user_id, movie_id) DO NOTHING
    """, all_ratings, page_size=500)

    print(f'Inserting {len(all_history):,} watch history entries …')
    psycopg2.extras.execute_values(cur2, """
        INSERT INTO watch_history (user_id, movie_id, progress_s, updated_at)
        VALUES %s
        ON CONFLICT (user_id, movie_id) DO UPDATE
            SET progress_s = EXCLUDED.progress_s,
                updated_at  = EXCLUDED.updated_at
    """, all_history, page_size=500)

    print(f'Inserting {len(all_watchlist):,} watchlist entries …')
    psycopg2.extras.execute_values(cur2, """
        INSERT INTO watchlist (user_id, movie_id)
        VALUES %s
        ON CONFLICT DO NOTHING
    """, all_watchlist, page_size=500)

    print(f'Inserting {len(all_comments):,} comments …')
    psycopg2.extras.execute_values(cur2, """
        INSERT INTO comments (user_id, movie_id, body)
        VALUES %s
    """, all_comments, page_size=500)

    print(f'Inserting {len(all_follows):,} follow relationships …')
    psycopg2.extras.execute_values(cur2, """
        INSERT INTO user_follows (follower_id, following_id)
        VALUES %s
        ON CONFLICT DO NOTHING
    """, all_follows, page_size=500)

    conn.commit()

    # ── DMs between mutual follows ─────────────────────────────────────────────
    print('Generating DM threads between mutual followers …')
    follow_set  = set(all_follows)
    mutual_pairs = [(a, b) for (a, b) in follow_set if (b, a) in follow_set and a < b]
    rng.shuffle(mutual_pairs)

    DM_TEXTS = [
        "have you seen this one?", "you'd love this", "watched it last night — incredible",
        "not really for me honestly", "this one slapped", "omg yes, one of my favs",
        "heard great things, haven't tried it yet", "the ending destroyed me",
        "perfect for a lazy sunday", "this was so underrated", "couldn't stop watching",
        "a bit slow at first but worth it", "had no idea what to expect and loved it",
        "you have to watch this with me sometime", "been meaning to watch this for ages",
        "i cried lol", "actually really good, don't let the rating fool you",
        "so different from everything else out there", "second time watching still hits hard",
        "kinda weird but in a good way",
    ]

    # Pre-fetch movie tmdb_ids for sharing
    cur3 = conn.cursor()
    cur3.execute("SELECT tmdb_id FROM movies ORDER BY popularity DESC LIMIT 500")
    top_tmdb_ids = [r[0] for r in cur3.fetchall()]

    all_threads, all_dm_messages = [], []
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    for (u1, u2) in mutual_pairs[:int(len(mutual_pairs) * 0.6)]:
        thread_id = str(uuid.uuid4())
        all_threads.append((thread_id, u1, u2, now - timedelta(days=int(rng.integers(1, 90)))))

        n_msgs = int(rng.integers(4, 15))
        base_ts = now - timedelta(days=int(rng.integers(1, 90)))
        senders = [u1, u2]
        for j in range(n_msgs):
            sender = senders[j % 2]
            ts = base_ts + timedelta(minutes=int(rng.integers(1, 120)) * (j + 1))
            if rng.random() < 0.30 and top_tmdb_ids:
                # Movie share
                movie_tmdb = int(rng.choice(top_tmdb_ids[:200]))
                all_dm_messages.append((str(uuid.uuid4()), thread_id, sender, None, movie_tmdb, ts))
            else:
                body = random.choice(DM_TEXTS)
                all_dm_messages.append((str(uuid.uuid4()), thread_id, sender, body, None, ts))

    if all_threads:
        print(f'Inserting {len(all_threads)} DM threads …')
        psycopg2.extras.execute_values(cur2, """
            INSERT INTO dm_threads (id, user1_id, user2_id, created_at)
            VALUES %s ON CONFLICT DO NOTHING
        """, all_threads)

        print(f'Inserting {len(all_dm_messages)} DM messages …')
        psycopg2.extras.execute_values(cur2, """
            INSERT INTO dm_messages (id, thread_id, sender_id, body, movie_tmdb_id, created_at)
            VALUES %s
        """, all_dm_messages, page_size=500)

    # ── Recommendation impressions ─────────────────────────────────────────────
    print('Generating recommendation impressions …')
    STRATEGIES = ['content-based', 'hybrid (CF 30%)', 'hybrid (CF 70%)', 'popular']
    all_impressions = []
    for uid in user_ids:
        n_imp = int(rng.integers(20, 40))
        shown_movies = rng.choice(top_tmdb_ids[:300], size=min(n_imp, len(top_tmdb_ids)), replace=False)
        strategy = random.choice(STRATEGIES)
        for tmdb_id in shown_movies:
            shown_at = now - timedelta(days=int(rng.integers(0, 30)), hours=int(rng.integers(0, 23)))
            all_impressions.append((str(uuid.uuid4()), uid, int(tmdb_id), strategy, shown_at))

    print(f'Inserting {len(all_impressions):,} impressions …')
    psycopg2.extras.execute_values(cur2, """
        INSERT INTO recommendation_impressions (id, user_id, tmdb_id, strategy, shown_at)
        VALUES %s
    """, all_impressions, page_size=1000)

    conn.commit()
    cur.close(); cur2.close(); cur3.close(); conn.close()

    avg_ratings = len(all_ratings) / len(all_users)
    print(f"""
Done.
  {len(all_users)} users          (login with any sim_user_XXXX / pass1234)
  {len(all_ratings):>8,} ratings        ({avg_ratings:.0f} avg per user)
  {len(all_history):>8,} watch events
  {len(all_watchlist):>8,} watchlist entries
  {len(all_comments):>8,} comments
  {len(all_follows):>8,} follow relationships
  {len(all_threads):>8,} DM threads
  {len(all_dm_messages):>8,} DM messages
  {len(all_impressions):>8,} recommendation impressions

Export for ML notebook:
  psql -h localhost -p 5433 -U postgres -d cinemate \\
    -c "\\COPY (SELECT r.user_id::text, m.tmdb_id, r.score FROM ratings r JOIN movies m ON m.id = r.movie_id) \\
        TO 'ml/notebooks/data/cinemate_ratings.csv' CSV HEADER"

  psql -h localhost -p 5433 -U postgres -d cinemate \\
    -c "\\COPY (SELECT user_id::text, m.tmdb_id, progress_s FROM watch_history wh JOIN movies m ON m.id = wh.movie_id) \\
        TO 'ml/notebooks/data/cinemate_watch.csv' CSV HEADER"
""")


if __name__ == '__main__':
    main()
