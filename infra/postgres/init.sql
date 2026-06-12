-- Cinemate PostgreSQL 16 schema — reflects live DB state (June 2026)
-- Run once on a fresh postgres instance; idempotent via IF NOT EXISTS / ON CONFLICT.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Core catalog ──────────────────────────────────────────────────────────────

CREATE TABLE movies (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tmdb_id      INTEGER     NOT NULL UNIQUE,
  title        TEXT        NOT NULL,
  poster_path  TEXT,
  release_date DATE,
  year         INT         GENERATED ALWAYS AS (EXTRACT(YEAR FROM release_date)::INT) STORED,
  runtime      INT,
  popularity   NUMERIC(10,3),
  vote_average NUMERIC(4,2),
  vote_count   INT,
  avg_rating   NUMERIC(3,1) DEFAULT 0,
  rating_count INT          DEFAULT 0,
  jellyfin_id  TEXT         UNIQUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE genres (
  id   INTEGER PRIMARY KEY,
  name TEXT    NOT NULL UNIQUE
);

-- movie_genres uses tmdb_id INTEGER (not movies.id UUID) for ML-25M compat
CREATE TABLE movie_genres (
  tmdb_id  INTEGER NOT NULL REFERENCES movies(tmdb_id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES genres(id)       ON DELETE CASCADE,
  PRIMARY KEY (tmdb_id, genre_id)
);

-- Credits cache — populated lazily on analytics load and via batch admin script
CREATE TABLE movie_directors (
  tmdb_id          INTEGER      NOT NULL,
  director_name    VARCHAR(255) NOT NULL,
  director_tmdb_id INTEGER,
  PRIMARY KEY (tmdb_id, director_name)
);

CREATE TABLE movie_actors (
  tmdb_id       INTEGER      NOT NULL,
  actor_name    VARCHAR(255) NOT NULL,
  actor_tmdb_id INTEGER      NOT NULL,
  profile_path  TEXT,
  cast_order    SMALLINT,
  PRIMARY KEY (tmdb_id, actor_tmdb_id)
);

-- ── Users ─────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id          UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT  NOT NULL UNIQUE,
  username    TEXT  NOT NULL UNIQUE,
  password    TEXT  NOT NULL,
  role        TEXT  NOT NULL DEFAULT 'user',
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  preferences JSONB
);

-- ── User activity ─────────────────────────────────────────────────────────────

CREATE TABLE ratings (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  movie_id   UUID NOT NULL REFERENCES movies(id)  ON DELETE CASCADE,
  score      INT  NOT NULL CHECK (score BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, movie_id)
);

CREATE TABLE comments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  movie_id   UUID NOT NULL REFERENCES movies(id)  ON DELETE CASCADE,
  parent_id  UUID REFERENCES comments(id)         ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE watchlist (
  user_id   UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  movie_id  UUID        NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  added_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, movie_id)
);

CREATE TABLE watch_history (
  user_id    UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  movie_id   UUID        NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  progress_s INT         DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, movie_id)
);

CREATE TABLE user_subtitles (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID         NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  movie_id    UUID         NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  language    VARCHAR(10)  NOT NULL DEFAULT 'en',
  label       VARCHAR(100) NOT NULL DEFAULT 'Custom',
  content_vtt TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Social graph ──────────────────────────────────────────────────────────────

CREATE TABLE user_follows (
  follower_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);

-- ── Lists ─────────────────────────────────────────────────────────────────────

CREATE TABLE user_lists (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  description TEXT,
  is_public   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE user_list_movies (
  list_id    UUID        NOT NULL REFERENCES user_lists(id) ON DELETE CASCADE,
  movie_id   UUID        NOT NULL REFERENCES movies(id)     ON DELETE CASCADE,
  sort_order INT         NOT NULL DEFAULT 0,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (list_id, movie_id)
);

CREATE TABLE user_list_follows (
  user_id    UUID        NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  list_id    UUID        NOT NULL REFERENCES user_lists(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, list_id)
);

-- ── Watch parties ─────────────────────────────────────────────────────────────

CREATE TABLE watch_party_rooms (
  id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_id           UUID         NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  movie_id          UUID         NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  room_code         VARCHAR(8)   NOT NULL UNIQUE,
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  playback_position NUMERIC(12,3) NOT NULL DEFAULT 0,
  is_playing        BOOLEAN      NOT NULL DEFAULT FALSE,
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE watch_party_messages (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id    UUID        NOT NULL REFERENCES watch_party_rooms(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)             ON DELETE CASCADE,
  username   TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Direct messages ───────────────────────────────────────────────────────────

CREATE TABLE dm_threads (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user1_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user1_id, user2_id),
  -- enforce user1_id < user2_id (UUID string order) to guarantee unique pairs
  CONSTRAINT dm_users_ordered CHECK (user1_id::text < user2_id::text)
);

CREATE TABLE dm_messages (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id     UUID        NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
  sender_id     UUID        NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  body          TEXT,
  movie_tmdb_id INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dm_message_has_content CHECK (body IS NOT NULL OR movie_tmdb_id IS NOT NULL)
);

CREATE TABLE dm_thread_reads (
  thread_id    UUID        NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (thread_id, user_id)
);

-- ── ML / Recommendations ──────────────────────────────────────────────────────

CREATE TABLE recommendation_impressions (
  id       UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id  UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id  INTEGER      NOT NULL,
  strategy VARCHAR(100),
  shown_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Trigger — auto-update avg_rating on movies ────────────────────────────────

CREATE OR REPLACE FUNCTION update_movie_rating() RETURNS TRIGGER AS $$
BEGIN
  UPDATE movies SET
    avg_rating   = (SELECT ROUND(AVG(score)::numeric, 1) FROM ratings WHERE movie_id = COALESCE(NEW.movie_id, OLD.movie_id)),
    rating_count = (SELECT COUNT(*)                       FROM ratings WHERE movie_id = COALESCE(NEW.movie_id, OLD.movie_id))
  WHERE id = COALESCE(NEW.movie_id, OLD.movie_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rating
AFTER INSERT OR UPDATE OR DELETE ON ratings
FOR EACH ROW EXECUTE FUNCTION update_movie_rating();

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- movies
CREATE INDEX idx_movies_tmdb_id      ON movies(tmdb_id);
CREATE INDEX idx_movies_release_date ON movies(release_date DESC);
CREATE INDEX idx_movies_popularity   ON movies(popularity DESC);
CREATE INDEX idx_movies_vote_average ON movies(vote_average DESC);
CREATE INDEX idx_movies_title_trgm   ON movies USING gin(title gin_trgm_ops);

-- movie_genres / credits
CREATE INDEX idx_movie_genres_tmdb    ON movie_genres(tmdb_id);
CREATE INDEX idx_movie_directors_tmdb ON movie_directors(tmdb_id);
CREATE INDEX idx_movie_actors_tmdb    ON movie_actors(tmdb_id);

-- ratings
CREATE INDEX idx_ratings_user  ON ratings(user_id);
CREATE INDEX idx_ratings_movie ON ratings(movie_id);

-- comments
CREATE INDEX idx_comments_movie ON comments(movie_id);

-- watch history
CREATE INDEX idx_watch_history_user ON watch_history(user_id);

-- subtitles
CREATE INDEX idx_user_subtitles_movie ON user_subtitles(movie_id);

-- social
CREATE INDEX idx_user_follows_follower  ON user_follows(follower_id);
CREATE INDEX idx_user_follows_following ON user_follows(following_id);

-- lists
CREATE INDEX idx_user_lists_user   ON user_lists(user_id);
CREATE INDEX idx_user_lists_public ON user_lists(is_public);
CREATE INDEX idx_user_list_movies_list ON user_list_movies(list_id);

-- watch party
CREATE INDEX idx_watch_party_code     ON watch_party_rooms(room_code);
CREATE INDEX idx_watch_party_msgs_room ON watch_party_messages(room_id);

-- DMs
CREATE INDEX idx_dm_messages_thread ON dm_messages(thread_id, created_at);

-- impressions
CREATE INDEX idx_impressions_user      ON recommendation_impressions(user_id);
CREATE INDEX idx_impressions_user_tmdb ON recommendation_impressions(user_id, tmdb_id);
