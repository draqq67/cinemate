CREATE TABLE movies (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tmdb_id             INTEGER NOT NULL UNIQUE,
  imdb_id             TEXT,
  title               TEXT NOT NULL,
  original_title      TEXT,
  overview            TEXT,
  tagline             TEXT,
  poster_path         TEXT,
  backdrop_path       TEXT,
  release_date        DATE,
  year                INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM release_date)::INT) STORED,
  runtime             INT,
  budget              BIGINT,
  revenue             BIGINT,
  popularity          NUMERIC(10,3),
  vote_average        NUMERIC(4,2),
  vote_count          INT,
  original_language   TEXT,
  status              TEXT,
  homepage            TEXT,
  adult               BOOLEAN DEFAULT FALSE,
  avg_rating          NUMERIC(3,1) DEFAULT 0,
  rating_count        INT DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE genres (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE
);

CREATE TABLE movie_genres (
  movie_id  UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  genre_id  INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (movie_id, genre_id)
);

CREATE TABLE production_companies (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  logo_path       TEXT,
  origin_country  TEXT
);

CREATE TABLE movie_production_companies (
  movie_id    UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  company_id  INTEGER NOT NULL REFERENCES production_companies(id) ON DELETE CASCADE,
  PRIMARY KEY (movie_id, company_id)
);

CREATE TABLE movie_countries (
  movie_id    UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  iso_code    TEXT NOT NULL,
  name        TEXT NOT NULL,
  PRIMARY KEY (movie_id, iso_code)
);

CREATE TABLE movie_languages (
  movie_id        UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  iso_code        TEXT NOT NULL,
  name            TEXT NOT NULL,
  english_name    TEXT NOT NULL,
  PRIMARY KEY (movie_id, iso_code)
);

CREATE TABLE ratings (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  movie_id   UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  score      INT NOT NULL CHECK (score BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, movie_id)
);

CREATE TABLE comments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  movie_id   UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  parent_id  UUID REFERENCES comments(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE watchlist (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  movie_id   UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, movie_id)
);

CREATE TABLE watch_history (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  movie_id    UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  progress_s  INT DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, movie_id)
);

CREATE OR REPLACE FUNCTION update_movie_rating() RETURNS TRIGGER AS $$
BEGIN
  UPDATE movies SET
    avg_rating   = (SELECT ROUND(AVG(score)::numeric, 1) FROM ratings WHERE movie_id = COALESCE(NEW.movie_id, OLD.movie_id)),
    rating_count = (SELECT COUNT(*) FROM ratings WHERE movie_id = COALESCE(NEW.movie_id, OLD.movie_id))
  WHERE id = COALESCE(NEW.movie_id, OLD.movie_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rating
AFTER INSERT OR UPDATE OR DELETE ON ratings
FOR EACH ROW EXECUTE FUNCTION update_movie_rating();

CREATE INDEX idx_movies_tmdb_id ON movies(tmdb_id);
CREATE INDEX idx_movies_release_date ON movies(release_date DESC);
CREATE INDEX idx_movies_popularity ON movies(popularity DESC);
CREATE INDEX idx_movies_vote_average ON movies(vote_average DESC);
CREATE INDEX idx_movie_genres_genre ON movie_genres(genre_id);
CREATE INDEX idx_ratings_user ON ratings(user_id);
CREATE INDEX idx_ratings_movie ON ratings(movie_id);
CREATE INDEX idx_comments_movie ON comments(movie_id);
CREATE INDEX idx_watch_history_user ON watch_history(user_id);

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_movies_title_trgm ON movies USING gin(title gin_trgm_ops);