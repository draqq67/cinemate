#!/usr/bin/env python3
"""
Import real ML-25M user ratings into the Cinemate PostgreSQL database.

Bridges ML-25M movieIds → tmdbId (via links.csv) → Cinemate movie UUID.
Creates synthetic Cinemate users for each ML-25M user.
Scales ratings: ML-25M 0.5–5.0 → Cinemate 1–10 (×2, rounded).

Usage:
  python ml/scripts/import_ml25m_ratings.py
  python ml/scripts/import_ml25m_ratings.py --users 2000 --min-ratings 10
  python ml/scripts/import_ml25m_ratings.py --reset   # removes previously imported users
"""
import argparse
import pathlib
import sys
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import numpy as np
import pandas as pd
import psycopg2
import psycopg2.extras

ML25M = pathlib.Path('ml/notebooks/data/ml-25m')
DB    = dict(host='localhost', port=5433, dbname='cinemate', user='postgres', password='marga')
EMAIL_SUFFIX = '@ml25m.cinemate'
HASH  = bcrypt.hashpw(b'ml25m_pass', bcrypt.gensalt(rounds=8)).decode()
RNG   = np.random.default_rng(42)


def reset(conn):
    with conn.cursor() as cur:
        cur.execute("DELETE FROM users WHERE email LIKE %s", (f'%{EMAIL_SUFFIX}',))
        print(f"Deleted {cur.rowcount} ML-25M users (cascade removes ratings/history).")
    conn.commit()


def run(n_users: int, min_ratings: int):
    for f in ['ratings.csv', 'links.csv']:
        if not (ML25M / f).exists():
            print(f"ERROR: {ML25M / f} not found. Download ML-25M first.")
            sys.exit(1)

    print("Reading links.csv …")
    links = pd.read_csv(ML25M / 'links.csv', dtype={'movieId': int, 'tmdbId': 'Int64'})
    links = links.dropna(subset=['tmdbId'])
    links['tmdbId'] = links['tmdbId'].astype(int)
    ml_to_tmdb = dict(zip(links['movieId'], links['tmdbId']))

    print("Connecting to Cinemate DB …")
    conn = psycopg2.connect(**DB)

    with conn.cursor() as cur:
        cur.execute("SELECT tmdb_id, id FROM movies")
        tmdb_to_uuid = {row[0]: row[1] for row in cur.fetchall()}
        cur.execute("SELECT email FROM users WHERE email LIKE %s", (f'%{EMAIL_SUFFIX}',))
        existing = {row[0] for row in cur.fetchall()}
    print(f"Catalog: {len(tmdb_to_uuid)} movies | Already imported: {len(existing)} ML-25M users")

    valid_ml_ids = {mid for mid, tid in ml_to_tmdb.items() if tid in tmdb_to_uuid}

    print(f"Reading ratings.csv (full 25M) …")
    ratings = pd.read_csv(
        ML25M / 'ratings.csv',
        dtype={'userId': int, 'movieId': int, 'rating': float, 'timestamp': int},
    )
    ratings = ratings[ratings['movieId'].isin(valid_ml_ids)]
    print(f"  {len(ratings):,} ratings covering catalog movies")

    user_counts = ratings.groupby('userId').size()
    eligible    = user_counts[user_counts >= min_ratings].sort_values(ascending=False)

    # Skip already-imported users
    already_ids = set()
    for email in existing:
        try:
            already_ids.add(int(email.replace(f'ml25m_', '').replace(EMAIL_SUFFIX, '')))
        except ValueError:
            pass

    eligible    = eligible[~eligible.index.isin(already_ids)]
    selected    = eligible.head(n_users).index.tolist()
    print(f"Importing {len(selected):,} new users (each with ≥{min_ratings} catalog ratings) …")

    ratings_sub = ratings[ratings['userId'].isin(selected)]
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Build user rows
    user_rows = []
    for uid in selected:
        email = f'ml25m_{uid}{EMAIL_SUFFIX}'
        user_rows.append((
            str(uuid.uuid4()),
            email,
            f'ml_user_{uid}',
            HASH,
            'user',
            now - timedelta(days=int(RNG.integers(30, 730))),
        ))

    user_id_map = {
        f'ml25m_{uid}{EMAIL_SUFFIX}': row[0]
        for uid, row in zip(selected, user_rows)
    }

    print(f"  Inserting {len(user_rows):,} users …")
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(
            cur,
            "INSERT INTO users (id, email, username, password, role, created_at) VALUES %s ON CONFLICT (email) DO NOTHING",
            user_rows,
        )
    conn.commit()

    # Build rating rows
    rating_rows, watch_rows = [], []
    for _, row in ratings_sub.iterrows():
        email     = f'ml25m_{int(row.userId)}{EMAIL_SUFFIX}'
        user_uuid = user_id_map.get(email)
        tmdb_id   = ml_to_tmdb.get(int(row.movieId))
        movie_uuid = tmdb_to_uuid.get(tmdb_id) if tmdb_id else None
        if not user_uuid or not movie_uuid:
            continue

        score = max(1, min(10, round(row.rating * 2)))
        ts    = datetime.utcfromtimestamp(int(row.timestamp))

        rating_rows.append((user_uuid, movie_uuid, score, ts))
        # Treat rated movies as watched (95% of 120min default)
        watch_rows.append((user_uuid, movie_uuid, 6840, ts))  # 114 min in seconds

    def chunked(lst, size):
        for i in range(0, len(lst), size):
            yield lst[i:i + size]

    CHUNK = 5_000
    print(f"  Inserting {len(rating_rows):,} ratings in chunks of {CHUNK} …")
    for i, chunk in enumerate(chunked(rating_rows, CHUNK)):
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                """INSERT INTO ratings (user_id, movie_id, score, created_at)
                   VALUES %s ON CONFLICT (user_id, movie_id) DO NOTHING""",
                [(u, m, s, t) for u, m, s, t in chunk],
            )
        conn.commit()
        if (i + 1) % 10 == 0:
            print(f"    {(i+1)*CHUNK:,} / {len(rating_rows):,} ratings committed")

    # Deduplicate by (user_id, movie_id) — a user may appear twice with the same movie
    seen_watch: dict = {}
    for u, m, p, t in watch_rows:
        key = (u, m)
        if key not in seen_watch or t > seen_watch[key][3]:
            seen_watch[key] = (u, m, p, t)
    watch_rows_dedup = list(seen_watch.values())

    print(f"  Inserting {len(watch_rows_dedup):,} watch events in chunks of {CHUNK} …")
    for chunk in chunked(watch_rows_dedup, CHUNK):
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                """INSERT INTO watch_history (user_id, movie_id, progress_s, updated_at)
                   VALUES %s ON CONFLICT (user_id, movie_id) DO UPDATE SET
                     progress_s = GREATEST(watch_history.progress_s, EXCLUDED.progress_s),
                     updated_at = EXCLUDED.updated_at""",
                [(u, m, p, t) for u, m, p, t in chunk],
            )
        conn.commit()
    conn.close()

    print(f"\nDone. {len(selected):,} users / {len(rating_rows):,} ratings / {len(watch_rows_dedup):,} watch events imported.")
    print("Run `docker compose exec backend wget -qO- http://ml:5000/refresh` to retrain models.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Import ML-25M ratings into Cinemate DB')
    parser.add_argument('--users',       type=int, default=2000, help='Max ML-25M users to import (default 2000)')
    parser.add_argument('--min-ratings', type=int, default=10,   help='Min catalog ratings per user (default 10)')
    parser.add_argument('--reset',       action='store_true',    help='Delete previously imported ML-25M users and exit')
    args = parser.parse_args()

    conn = psycopg2.connect(**DB)
    if args.reset:
        reset(conn)
        conn.close()
        sys.exit(0)
    conn.close()

    run(args.users, args.min_ratings)
