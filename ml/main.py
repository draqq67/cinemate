import os
import logging
import pathlib
import time
from contextlib import asynccontextmanager
from typing import Optional

import numpy as np
import pandas as pd
import psycopg2
import joblib
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from scipy.sparse import csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────────────────────
DB = {
    "host":     os.getenv("POSTGRES_HOST",     "postgres"),
    "port":     int(os.getenv("POSTGRES_PORT", "5432")),
    "user":     os.getenv("POSTGRES_USER",     "postgres"),
    "password": os.getenv("POSTGRES_PASSWORD", ""),
    "dbname":   os.getenv("POSTGRES_DB",       "cinemate"),
}
MODELS_DIR      = pathlib.Path(os.getenv("MODELS_DIR",       "/app/models"))
GENOME_PATH     = pathlib.Path(os.getenv("GENOME_PATH",     "/app/data/genome_vectors.parquet"))
TAG_NAMES_PATH  = pathlib.Path(os.getenv("TAG_NAMES_PATH",  "/app/data/genome_tag_names.json"))
MODEL_TTL       = int(os.getenv("MODEL_TTL_HOURS", "24")) * 3600

MODELS_DIR.mkdir(parents=True, exist_ok=True)

# Mood → genome tag names (exact lowercase names from genome-tags.csv)
MOOD_PROFILES: dict[str, list[str]] = {
    "atmospheric":       ["atmospheric", "visually stunning", "visually appealing", "art house"],
    "mind-bending":      ["twist ending", "twist", "nonlinear", "surreal", "surrealism", "psychological"],
    "feel-good":         ["feel-good", "heartwarming"],
    "tense":             ["tense", "suspense", "suspenseful", "intense"],
    "dark":              ["dark", "bleak", "disturbing", "dark themes", "dark hero"],
    "emotional":         ["dramatic", "emotional depth", "emotional", "romantic"],
    "funny":             ["funny", "satire", "dark comedy", "comedy"],
    "epic":              ["epic", "action packed", "action"],
    "scary":             ["scary", "horror", "supernatural", "psychological"],
    "romantic":          ["romantic", "romance", "love story"],
    "thought-provoking": ["philosophical", "social commentary", "thought provoking"],
    "cult-classic":      ["cult classic", "cult", "cult film", "criterion"],
}

# ── In-memory state ────────────────────────────────────────────────────────────
movies_df:       Optional[pd.DataFrame] = None
ratings_df:      Optional[pd.DataFrame] = None
watch_df:        Optional[pd.DataFrame] = None

# Pre-built O(1) lookup dicts (built after movies_df loads)
tmdb_runtime:    dict                   = {}  # tmdb_id → runtime (int, may be None)
tmdb_genres_set: dict                   = {}  # tmdb_id → set of lowercase genre names

# TF-IDF content (fallback when genome unavailable)
tfidf_matrix                            = None
tmdb_id_to_idx:  dict                   = {}

# Genome content (primary — from ML-25M genome-scores.csv)
genome_matrix:   Optional[np.ndarray]   = None   # (n_genome_movies, 1128) float32
genome_tmdb_ids: list                   = []
genome_idx:      dict                   = {}
genome_col_idx:  dict                   = {}      # tagId → column index in genome_matrix
tag_name_to_col: dict                   = {}      # lowercase tag name → column index

# FunkSVD collaborative filtering (scikit-surprise)
svd_algo                                = None
svd_trainset                            = None

# ALS implicit feedback (implicit library)
als_model                               = None
als_u_map:       dict                   = {}
als_m_map:       dict                   = {}
als_m_ids:       list                   = []


# ── DB loading ─────────────────────────────────────────────────────────────────
def _load_from_db() -> None:
    global movies_df, ratings_df, watch_df
    log.info("Connecting to database …")
    conn = psycopg2.connect(**DB)
    try:
        movies_df = pd.read_sql("""
            SELECT
                m.tmdb_id, m.title, m.popularity, m.vote_average, m.runtime,
                array_agg(DISTINCT g.name) FILTER (WHERE g.name IS NOT NULL) AS genres
            FROM movies m
            LEFT JOIN movie_genres mg ON mg.tmdb_id = m.tmdb_id
            LEFT JOIN genres        g ON g.id        = mg.genre_id
            GROUP BY m.tmdb_id, m.title, m.popularity, m.vote_average, m.runtime
        """, conn)
        movies_df["tmdb_id"] = movies_df["tmdb_id"].astype(int)
        log.info("Loaded %d movies", len(movies_df))

        ratings_df = pd.read_sql("""
            SELECT r.user_id::text AS user_id, m.tmdb_id, r.score
            FROM ratings r JOIN movies m ON m.id = r.movie_id
        """, conn)
        ratings_df["tmdb_id"] = ratings_df["tmdb_id"].astype(int)
        log.info("Loaded %d ratings from %d users",
                 len(ratings_df), ratings_df["user_id"].nunique())

        watch_df = pd.read_sql("""
            SELECT wh.user_id::text AS user_id, m.tmdb_id, wh.progress_s
            FROM watch_history wh JOIN movies m ON m.id = wh.movie_id
            WHERE wh.progress_s > 30
        """, conn)
        watch_df["tmdb_id"] = watch_df["tmdb_id"].astype(int)
        log.info("Loaded %d watch events", len(watch_df))
    finally:
        conn.close()


# ── Content-based models ───────────────────────────────────────────────────────
def _build_tfidf() -> None:
    global tfidf_matrix, tmdb_id_to_idx, tmdb_runtime, tmdb_genres_set

    def soup(row):
        genres = " ".join(row["genres"] or [])
        return f"{genres} {genres} {genres}"

    movies_df["soup"] = movies_df.apply(soup, axis=1)
    tmdb_id_to_idx    = {int(t): i for i, t in enumerate(movies_df["tmdb_id"])}
    tfidf             = TfidfVectorizer(stop_words="english", max_features=10_000)
    tfidf_matrix      = tfidf.fit_transform(movies_df["soup"])

    # Pre-build O(1) lookup dicts for runtime and genres
    # pd.notna() handles both None and NaN
    tmdb_runtime    = {int(r["tmdb_id"]): (int(r["runtime"]) if pd.notna(r["runtime"]) else None)
                       for _, r in movies_df.iterrows()}
    tmdb_genres_set = {int(r["tmdb_id"]): set(g.lower() for g in (r["genres"] or []))
                       for _, r in movies_df.iterrows()}

    has_runtime = sum(1 for v in tmdb_runtime.values() if v is not None)
    log.info("TF-IDF matrix: %s  |  runtime known for %d/%d movies",
             tfidf_matrix.shape, has_runtime, len(tmdb_runtime))


def _build_genome() -> None:
    global genome_matrix, genome_tmdb_ids, genome_idx, genome_col_idx, tag_name_to_col
    if not GENOME_PATH.exists():
        log.warning(
            "Genome vectors not found at %s — content-based will use TF-IDF only. "
            "Run: python ml/scripts/build_genome_vectors.py",
            GENOME_PATH,
        )
        return

    gdf = pd.read_parquet(GENOME_PATH)
    gdf.index = gdf.index.astype(int)

    catalog_ids = set(movies_df["tmdb_id"].tolist())
    gdf = gdf[gdf.index.isin(catalog_ids)]

    genome_tmdb_ids = gdf.index.tolist()
    genome_matrix   = gdf.values.astype(np.float32)
    genome_idx      = {mid: i for i, mid in enumerate(genome_tmdb_ids)}
    # tagId (int column name) → column index in matrix
    genome_col_idx  = {int(tid): i for i, tid in enumerate(gdf.columns)}
    log.info("Genome matrix: %d movies × %d tags", *genome_matrix.shape)

    # Load tag name → column index mapping
    if TAG_NAMES_PATH.exists():
        import json
        name_to_id = json.loads(TAG_NAMES_PATH.read_text())
        tag_name_to_col = {
            name: genome_col_idx[tid]
            for name, tid in name_to_id.items()
            if tid in genome_col_idx
        }
        log.info("Loaded %d genome tag name mappings", len(tag_name_to_col))
    else:
        log.warning("genome_tag_names.json not found — mood endpoint unavailable")


# ── Collaborative filtering (FunkSVD) ──────────────────────────────────────────
def _load_or_train_svd() -> None:
    global svd_algo, svd_trainset
    if ratings_df is None or len(ratings_df) < 20:
        log.info("Too few ratings for SVD — skipping")
        return

    cache = MODELS_DIR / "svd.pkl"
    if cache.exists() and (time.time() - cache.stat().st_mtime) < MODEL_TTL:
        log.info("Loading cached SVD model …")
        svd_algo, svd_trainset = joblib.load(cache)
        return

    log.info("Training FunkSVD on %d ratings …", len(ratings_df))
    from surprise import Dataset, Reader, SVD

    reader       = Reader(rating_scale=(1, 10))
    data         = Dataset.load_from_df(
        ratings_df[["user_id", "tmdb_id", "score"]], reader
    )
    svd_trainset = data.build_full_trainset()
    svd_algo     = SVD(n_factors=100, n_epochs=30, lr_all=0.005, reg_all=0.02, random_state=42)
    svd_algo.fit(svd_trainset)
    joblib.dump((svd_algo, svd_trainset), cache)
    log.info("SVD trained and cached → %s", cache)


# ── Implicit feedback (ALS) ────────────────────────────────────────────────────
def _load_or_train_als() -> None:
    global als_model, als_u_map, als_m_map, als_m_ids
    if watch_df is None or len(watch_df) < 20:
        log.info("Too few watch events for ALS — skipping")
        return

    cache = MODELS_DIR / "als.pkl"
    if cache.exists() and (time.time() - cache.stat().st_mtime) < MODEL_TTL:
        log.info("Loading cached ALS model …")
        bundle = joblib.load(cache)
        als_model, als_u_map, als_m_map, als_m_ids = (
            bundle["als"], bundle["u_map"], bundle["m_map"], bundle["m_ids"]
        )
        return

    log.info("Training ALS on %d watch events …", len(watch_df))
    try:
        from implicit.als import AlternatingLeastSquares

        ALPHA = 40
        conf  = 1 + ALPHA * np.log1p(watch_df["progress_s"].clip(lower=0) / 30)

        u_ids = sorted(watch_df["user_id"].unique())
        m_ids = sorted(watch_df["tmdb_id"].unique())
        u_map = {u: i for i, u in enumerate(u_ids)}
        m_map = {m: i for i, m in enumerate(m_ids)}

        rows = watch_df["user_id"].map(u_map).values
        cols = watch_df["tmdb_id"].map(m_map).values
        C    = csr_matrix((conf.values, (rows, cols)), shape=(len(u_ids), len(m_ids)))

        model = AlternatingLeastSquares(factors=50, iterations=20, random_state=42)
        model.fit(C.T)   # implicit expects (items × users)

        als_model, als_u_map, als_m_map, als_m_ids = model, u_map, m_map, m_ids
        joblib.dump(
            {"als": model, "u_map": u_map, "m_map": m_map, "m_ids": m_ids}, cache
        )
        log.info("ALS trained and cached → %s", cache)
    except ImportError:
        log.warning("implicit not installed — ALS skipped")


def load_data() -> None:
    _load_from_db()
    _build_tfidf()
    _build_genome()
    _load_or_train_svd()
    _load_or_train_als()


# ── Scoring helpers ────────────────────────────────────────────────────────────
def _liked_seeds(user_ratings: dict) -> list:
    liked = [t for t, s in user_ratings.items() if s >= 7]
    if not liked:
        liked = sorted(user_ratings, key=user_ratings.get, reverse=True)[:5]
    return liked


def _content_scores(liked_ids: list, candidate_ids: list) -> dict:
    """Genome cosine similarity (primary) with TF-IDF fallback."""
    scores = {}

    # ── Genome branch ─────────────────────────────────────────────────────────
    if genome_matrix is not None:
        genome_liked = [t for t in liked_ids if t in genome_idx]
        if genome_liked:
            user_vec = genome_matrix[
                [genome_idx[t] for t in genome_liked]
            ].mean(axis=0, keepdims=True)                        # (1, 1128)

            cand_with_genome = [(t, genome_idx[t]) for t in candidate_ids if t in genome_idx]
            if cand_with_genome:
                cand_tmdb_ids, cand_rows = zip(*cand_with_genome)
                cand_mat = genome_matrix[list(cand_rows)]        # (n, 1128)
                sims = cosine_similarity(user_vec, cand_mat).flatten()
                for tmdb_id, sim in zip(cand_tmdb_ids, sims):
                    scores[tmdb_id] = float(sim)

    # ── TF-IDF fallback for movies without genome coverage ────────────────────
    missing = [t for t in candidate_ids if t not in scores and t in tmdb_id_to_idx]
    if missing:
        tfidf_liked = [t for t in liked_ids if t in tmdb_id_to_idx]
        if tfidf_liked:
            # .mean() on a sparse matrix returns np.matrix — convert to array for sklearn
            seed_mat  = np.asarray(tfidf_matrix[[tmdb_id_to_idx[t] for t in tfidf_liked]].mean(axis=0))
            cand_mat  = tfidf_matrix[[tmdb_id_to_idx[t] for t in missing]]
            sims      = cosine_similarity(seed_mat, cand_mat).flatten()
            # Small penalty vs genome scores so genome results rank higher
            penalty   = 0.7 if genome_matrix is not None else 1.0
            for tmdb_id, sim in zip(missing, sims):
                scores[tmdb_id] = float(sim) * penalty

    return scores


def _cf_scores(user_id: str, candidate_ids: list) -> dict:
    """FunkSVD predictions for all candidates at once (vectorised)."""
    if svd_algo is None or svd_trainset is None:
        return {}
    try:
        uid_inner = svd_trainset.to_inner_uid(user_id)
    except ValueError:
        return {}

    pu = svd_algo.pu[uid_inner]           # (n_factors,)
    bu = float(svd_algo.bu[uid_inner])
    gm = float(svd_trainset.global_mean)

    # Map candidates to inner IDs, skipping movies not in training set
    inner_ids, mapped = [], []
    for tmdb_id in candidate_ids:
        try:
            inner_ids.append(svd_trainset.to_inner_iid(tmdb_id))
            mapped.append(tmdb_id)
        except ValueError:
            pass

    if not inner_ids:
        return {}

    qi_batch = svd_algo.qi[inner_ids]     # (n, n_factors)
    bi_batch = svd_algo.bi[inner_ids]     # (n,)
    preds    = np.clip(gm + bu + bi_batch + qi_batch @ pu, 1, 10)

    lo, hi = preds.min(), preds.max()
    norm   = np.full_like(preds, 0.5) if hi == lo else (preds - lo) / (hi - lo)
    return {t: float(s) for t, s in zip(mapped, norm)}


def _als_scores(user_id: str, candidate_ids: list) -> dict:
    """ALS implicit-feedback scores for candidates (vectorised)."""
    if als_model is None or user_id not in als_u_map:
        return {}

    u_inner  = als_u_map[user_id]
    uf       = als_model.user_factors[u_inner]   # (n_factors,)

    inner_ids, mapped = [], []
    for tmdb_id in candidate_ids:
        if tmdb_id in als_m_map:
            inner_ids.append(als_m_map[tmdb_id])
            mapped.append(tmdb_id)

    if not inner_ids:
        return {}

    if_batch = als_model.item_factors[inner_ids]  # (n, n_factors)
    scores   = if_batch @ uf                       # (n,)

    lo, hi = scores.min(), scores.max()
    norm   = np.full_like(scores, 0.5) if hi == lo else (scores - lo) / (hi - lo)
    return {t: float(s) for t, s in zip(mapped, norm)}


# ── 4-tier recommendation engine ──────────────────────────────────────────────
def _recommend(user_id: str, limit: int) -> tuple[list, str]:
    if movies_df is None:
        return [], "unavailable"

    user_rows    = (
        ratings_df[ratings_df["user_id"] == user_id]
        if ratings_df is not None else pd.DataFrame()
    )
    user_ratings = dict(zip(user_rows["tmdb_id"].astype(int), user_rows["score"]))
    n_rated      = len(user_ratings)
    seen         = set(user_ratings.keys())
    candidates   = [int(t) for t in movies_df["tmdb_id"] if int(t) not in seen]

    # ── Tier 0: no explicit ratings ───────────────────────────────────────────
    if n_rated == 0:
        # If the user has watch history, ALS can still help
        if als_model is not None and user_id in als_u_map:
            sc     = _als_scores(user_id, candidates)
            ranked = sorted(sc.items(), key=lambda x: -x[1])
            return [t for t, _ in ranked[:limit]], "implicit (watch history)"
        # Pure popularity fallback
        popular = (
            movies_df[movies_df["tmdb_id"].isin(candidates)]
            .nlargest(limit, "popularity")["tmdb_id"]
            .astype(int).tolist()
        )
        return popular[:limit], "popular"

    liked = _liked_seeds(user_ratings)

    # ── Tier 1: 1–9 ratings → content-based only ─────────────────────────────
    if n_rated < 10:
        cb     = _content_scores(liked, candidates)
        ranked = sorted(cb.items(), key=lambda x: -x[1])
        return [t for t, _ in ranked[:limit]], f"content-based (n={n_rated})"

    cb = _content_scores(liked, candidates)
    cf = _cf_scores(user_id, candidates)

    # ── Tier 2: 10–20 ratings → light blend (CF 30%) ─────────────────────────
    if n_rated <= 20:
        cf_w   = 0.30
        cb_w   = 0.70
        scores = {
            t: cb_w * cb.get(t, 0.0) + cf_w * cf.get(t, 0.0)
            for t in set(candidates) if cb.get(t, 0) > 0 or cf.get(t, 0) > 0
        }
        ranked = sorted(scores.items(), key=lambda x: -x[1])
        return [t for t, _ in ranked[:limit]], f"hybrid (CF 30%, n={n_rated})"

    # ── Tier 3: 20+ ratings → dynamic hybrid (CF grows to 70%) ───────────────
    cf_w   = min(0.70, 0.30 + n_rated * 0.02)
    cb_w   = 1.0 - cf_w
    scores = {
        t: cb_w * cb.get(t, 0.0) + cf_w * cf.get(t, 0.0)
        for t in set(candidates) if cb.get(t, 0) > 0 or cf.get(t, 0) > 0
    }
    ranked = sorted(scores.items(), key=lambda x: -x[1])
    return [t for t, _ in ranked[:limit]], f"hybrid (CF {cf_w:.0%}, n={n_rated})"


# ── FastAPI ────────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_data()
    yield


app = FastAPI(lifespan=lifespan)

# Exposes /metrics for Prometheus: request counts, latency histograms, in-progress requests
Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


@app.get("/health")
def health():
    return {
        "status":        "ok",
        "movies":        len(movies_df)      if movies_df      is not None else 0,
        "ratings":       len(ratings_df)     if ratings_df     is not None else 0,
        "watch_events":  len(watch_df)       if watch_df       is not None else 0,
        "cf_ready":      svd_algo            is not None,
        "als_ready":     als_model           is not None,
        "genome_ready":  genome_matrix       is not None,
        "genome_movies": len(genome_tmdb_ids),
    }


@app.get("/recommend/{user_id}")
def recommend(user_id: str, limit: int = 12):
    recs, strategy = _recommend(user_id, limit)
    return {"recommendations": recs, "strategy": strategy}


@app.get("/similar/{tmdb_id}")
def similar(tmdb_id: int, limit: int = 6):
    if movies_df is None:
        return {"similar": []}

    results: list[int] = []

    # Genome-based (preferred — richer semantics)
    if genome_matrix is not None and tmdb_id in genome_idx:
        idx  = genome_idx[tmdb_id]
        sims = cosine_similarity(genome_matrix[idx:idx + 1], genome_matrix).flatten()
        sims[idx] = -1
        top  = sims.argsort()[-(limit + 5):][::-1]
        results = [genome_tmdb_ids[i] for i in top if genome_tmdb_ids[i] != tmdb_id][:limit]

    # TF-IDF fallback (or top-up if genome didn't fill limit)
    if len(results) < limit and tmdb_id in tmdb_id_to_idx:
        idx  = tmdb_id_to_idx[tmdb_id]
        sims = cosine_similarity(tfidf_matrix[idx], tfidf_matrix).flatten()
        sims[idx] = -1
        top  = sims.argsort()[-(limit + 10):][::-1]
        seen = set(results)
        for i in top:
            mid = int(movies_df.iloc[i]["tmdb_id"])
            if mid not in seen and mid != tmdb_id:
                results.append(mid)
                seen.add(mid)
            if len(results) >= limit:
                break

    return {"similar": results[:limit]}


@app.post("/refresh")
def refresh():
    """Reload data from DB and immediately retrain SVD + ALS models."""
    for fname in ("svd.pkl", "als.pkl"):
        p = MODELS_DIR / fname
        if p.exists():
            p.unlink()
    load_data()
    t0 = time.time()
    _load_or_train_svd()
    _load_or_train_als()
    elapsed = round(time.time() - t0, 1)
    return {
        "status":   "refreshed",
        "movies":   len(movies_df)  if movies_df  is not None else 0,
        "ratings":  len(ratings_df) if ratings_df is not None else 0,
        "elapsed_s": elapsed,
    }


@app.get("/evaluate")
def evaluate(test_frac: float = 0.2):
    """RMSE + MAE on a random held-out split of Cinemate DB ratings."""
    if ratings_df is None or svd_algo is None or len(ratings_df) < 50:
        return {"error": "insufficient data for evaluation"}

    from sklearn.model_selection import train_test_split as sk_split
    _, test = sk_split(ratings_df, test_size=test_frac, random_state=42)

    y_true, y_pred = [], []
    for _, row in test.iterrows():
        uid, iid = str(row["user_id"]), int(row["tmdb_id"])
        try:
            uid_i = svd_trainset.to_inner_uid(uid)
            iid_i = svd_trainset.to_inner_iid(iid)
            gm    = float(svd_trainset.global_mean)
            pred  = gm + svd_algo.bu[uid_i] + svd_algo.bi[iid_i] + float(svd_algo.pu[uid_i] @ svd_algo.qi[iid_i])
            y_true.append(float(row["score"]))
            y_pred.append(float(np.clip(pred, 1, 10)))
        except ValueError:
            pass

    if not y_true:
        return {"error": "no overlapping users/items in test set"}

    arr_t = np.array(y_true)
    arr_p = np.array(y_pred)
    return {
        "rmse":   round(float(np.sqrt(np.mean((arr_t - arr_p) ** 2))), 4),
        "mae":    round(float(np.mean(np.abs(arr_t - arr_p))), 4),
        "n_test": len(y_true),
    }


@app.get("/user-genome/{user_id}")
def user_genome(user_id: str, n_tags: int = 25, min_score: int = 7):
    """Return top genome tags characterising a user's liked movies (queries DB live)."""
    if genome_matrix is None or not tag_name_to_col:
        return {"tags": [], "n_liked": 0}

    try:
        conn = psycopg2.connect(**DB)
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT m.tmdb_id FROM ratings r
                    JOIN movies m ON m.id = r.movie_id
                    WHERE r.user_id = %s AND r.score >= %s
                """, (user_id, min_score))
                liked = [row[0] for row in cur.fetchall()]
        finally:
            conn.close()
    except Exception as e:
        log.warning("user-genome DB query failed: %s", e)
        return {"tags": [], "n_liked": 0}

    if not liked:
        return {"tags": [], "n_liked": 0}

    indices = [genome_idx[tid] for tid in liked if tid in genome_idx]
    if not indices:
        return {"tags": [], "n_liked": len(liked)}

    user_vec  = genome_matrix[indices].mean(axis=0)      # (1128,)
    # Also compute platform average for all movies with genome data
    platform_vec = genome_matrix.mean(axis=0)

    # Relative score: how much higher than platform average for each tag
    rel = user_vec - platform_vec

    # Build tag name reverse lookup
    col_to_name = {v: k for k, v in tag_name_to_col.items()}

    top_abs = user_vec.argsort()[::-1][:n_tags]
    top_rel = rel.argsort()[::-1][:n_tags]

    tags_abs = [
        {"tag": col_to_name[i], "score": round(float(user_vec[i]), 3), "relative": round(float(rel[i]), 3)}
        for i in top_abs if i in col_to_name
    ]
    tags_distinctive = [
        {"tag": col_to_name[i], "score": round(float(user_vec[i]), 3), "relative": round(float(rel[i]), 3)}
        for i in top_rel if i in col_to_name and rel[i] > 0
    ][:15]

    return {
        "tags": tags_abs,
        "distinctive_tags": tags_distinctive,  # tags where you exceed platform avg most
        "n_liked": len(liked),
        "n_with_genome": len(indices),
    }


@app.get("/moods")
def list_moods():
    """Return available mood profiles with their tag lists."""
    return {
        "moods": [
            {"id": mid, "tags": tags}
            for mid, tags in MOOD_PROFILES.items()
        ]
    }


@app.get("/mood")
def mood(moods: str, genre: str = "", limit: int = 12):
    """
    Return movies that best match one or more mood profiles.
    moods: comma-separated mood ids from MOOD_PROFILES
    genre: optional genre name filter (e.g. "Horror")
    """
    if genome_matrix is None or not tag_name_to_col:
        return {"movies": [], "error": "genome data not loaded"}

    selected = [m.strip() for m in moods.split(",") if m.strip() in MOOD_PROFILES]
    if not selected:
        return {"movies": []}

    # Build query vector: average of all tag columns for all selected moods
    query_vec = np.zeros(genome_matrix.shape[1], dtype=np.float32)
    tag_count = 0
    for mood_id in selected:
        for tag_name in MOOD_PROFILES[mood_id]:
            col = tag_name_to_col.get(tag_name.lower())
            if col is not None:
                query_vec[col] += 1.0
                tag_count += 1
    if tag_count == 0:
        return {"movies": []}
    query_vec /= tag_count   # normalise

    sims = cosine_similarity(query_vec.reshape(1, -1), genome_matrix).flatten()

    # Optional genre filter
    if genre and movies_df is not None:
        genre_lower = genre.lower()
        genre_set   = set(
            int(r["tmdb_id"])
            for _, r in movies_df.iterrows()
            if any(g.lower() == genre_lower for g in (r["genres"] or []))
        )
        for i, tid in enumerate(genome_tmdb_ids):
            if tid not in genre_set:
                sims[i] = -1.0

    top = sims.argsort()[-(limit + 10):][::-1]
    results = []
    for i in top:
        if sims[i] <= 0:
            break
        results.append(genome_tmdb_ids[i])
        if len(results) >= limit:
            break

    return {"movies": results, "moods": selected}


@app.get("/mood-context")
def mood_context(
    moods: str = "",
    duration: str = "any",    # short <45 | medium 45-120 | long >120 | any
    context: str = "solo",    # solo | friends | date | family
    exclude_moods: str = "",
    genre: str = "",          # comma-separated genre names (match ANY)
    user_id: str = "",
    limit: int = 15,
):
    if genome_matrix is None or not tag_name_to_col:
        return {"movies": [], "strategy": "unavailable", "filters_applied": {}}

    selected = [m.strip() for m in moods.split(",") if m.strip() in MOOD_PROFILES]
    excluded = [m.strip() for m in exclude_moods.split(",") if m.strip() in MOOD_PROFILES]

    # Context boosts additional moods on top of user selection
    CONTEXT_BOOSTS = {
        "friends": ["feel-good", "funny", "epic"],
        "date":    ["romantic", "atmospheric"],
        "family":  ["feel-good", "funny"],
        "solo":    [],
    }
    CONTEXT_PENALISE = {
        "family": ["dark", "scary"],
        "date":   [],
        "friends":[],
        "solo":   [],
    }
    boosted  = CONTEXT_BOOSTS.get(context, [])
    penalise = CONTEXT_PENALISE.get(context, []) + excluded

    # Build query vector
    query_vec = np.zeros(genome_matrix.shape[1], dtype=np.float32)
    for mood_id in set(selected + boosted):
        for tag_name in MOOD_PROFILES.get(mood_id, []):
            col = tag_name_to_col.get(tag_name.lower())
            if col is not None:
                query_vec[col] += 1.0

    if query_vec.sum() == 0 and not user_id:
        # No moods — return popular
        pop = movies_df.nlargest(limit, "popularity")["tmdb_id"].astype(int).tolist()
        return {"movies": pop, "strategy": "popular", "filters_applied": {}}

    query_vec /= max(query_vec.sum(), 1)
    sims = cosine_similarity(query_vec.reshape(1, -1), genome_matrix).flatten()

    # Penalise excluded moods
    if penalise:
        pen_vec = np.zeros(genome_matrix.shape[1], dtype=np.float32)
        for mood_id in penalise:
            for tag_name in MOOD_PROFILES.get(mood_id, []):
                col = tag_name_to_col.get(tag_name.lower())
                if col is not None:
                    pen_vec[col] += 1.0
        if pen_vec.sum() > 0:
            pen_vec /= pen_vec.sum()
            pen_sims = cosine_similarity(pen_vec.reshape(1, -1), genome_matrix).flatten()
            sims = np.clip(sims - pen_sims * 0.5, 0, 1)

    # Optional CF blend for logged-in users
    if user_id and svd_algo is not None:
        cf = _cf_scores(user_id, genome_tmdb_ids)
        for i, tid in enumerate(genome_tmdb_ids):
            cf_s = cf.get(tid, 0)
            sims[i] = 0.6 * sims[i] + 0.4 * cf_s

    # Duration filter — O(1) lookup via pre-built dict
    duration_map = {"short": (0, 45), "medium": (45, 120), "long": (120, 9999), "any": None}
    dur_range = duration_map.get(duration)

    # Genre filter — support multiple genres (ANY match), O(1) lookup
    genre_names = set(g.strip().lower() for g in genre.split(",") if g.strip()) if genre else set()

    results = []
    order = sims.argsort()[::-1]
    for i in order:
        if sims[i] <= 0:
            break
        tid = genome_tmdb_ids[i]

        # Duration: only exclude if runtime is known AND out of range
        if dur_range is not None:
            rt = tmdb_runtime.get(tid)
            if rt is not None and not (dur_range[0] <= rt <= dur_range[1]):
                continue

        # Genre: movie must have AT LEAST ONE of the selected genres
        if genre_names:
            movie_genres = tmdb_genres_set.get(tid, set())
            if not (genre_names & movie_genres):
                continue

        results.append(tid)
        if len(results) >= limit:
            break

    # If too few results with strict filter, relax duration (include unknowns only)
    if dur_range is not None and len(results) < limit // 2:
        log.info("Duration filter too strict (%d results), relaxing to include unknown-runtime movies", len(results))
        for i in order:
            if sims[i] <= 0:
                break
            tid = genome_tmdb_ids[i]
            if tid in results:
                continue
            rt = tmdb_runtime.get(tid)
            if rt is not None and not (dur_range[0] <= rt <= dur_range[1]):
                continue
            # rt is None — include these (unknown runtime)
            if genre_names:
                movie_genres = tmdb_genres_set.get(tid, set())
                if not (genre_names & movie_genres):
                    continue
            results.append(tid)
            if len(results) >= limit:
                break

    strategy = f"mood-context ({context}, {duration})"
    if selected: strategy += f" [{','.join(selected)}]"

    return {
        "movies": results,
        "strategy": strategy,
        "filters_applied": {"duration": duration, "context": context, "excluded": excluded},
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
