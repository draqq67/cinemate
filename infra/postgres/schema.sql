--
-- PostgreSQL database dump
--

\restrict WTMyLQh5v9BYKGEyX84IfiuufZgH9wRSOdCbDYWuN9ELajLA2QfwyvX4MeCduMn

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: update_movie_rating(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_movie_rating() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE movies SET
    avg_rating   = (SELECT ROUND(AVG(score)::numeric, 1) FROM ratings WHERE movie_id = COALESCE(NEW.movie_id, OLD.movie_id)),
    rating_count = (SELECT COUNT(*) FROM ratings WHERE movie_id = COALESCE(NEW.movie_id, OLD.movie_id))
  WHERE id = COALESCE(NEW.movie_id, OLD.movie_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_movie_rating() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.comments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    movie_id uuid NOT NULL,
    parent_id uuid,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.comments OWNER TO postgres;

--
-- Name: dm_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dm_messages (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    thread_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    body text,
    movie_tmdb_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dm_message_has_content CHECK (((body IS NOT NULL) OR (movie_tmdb_id IS NOT NULL)))
);


ALTER TABLE public.dm_messages OWNER TO postgres;

--
-- Name: dm_thread_reads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dm_thread_reads (
    thread_id uuid NOT NULL,
    user_id uuid NOT NULL,
    last_read_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.dm_thread_reads OWNER TO postgres;

--
-- Name: dm_threads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dm_threads (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user1_id uuid NOT NULL,
    user2_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dm_users_ordered CHECK (((user1_id)::text < (user2_id)::text))
);


ALTER TABLE public.dm_threads OWNER TO postgres;

--
-- Name: genres; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.genres (
    id integer NOT NULL,
    name text NOT NULL
);


ALTER TABLE public.genres OWNER TO postgres;

--
-- Name: movie_actors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.movie_actors (
    tmdb_id integer NOT NULL,
    actor_name character varying(200) NOT NULL,
    actor_tmdb_id integer NOT NULL,
    profile_path text,
    cast_order smallint
);


ALTER TABLE public.movie_actors OWNER TO postgres;

--
-- Name: movie_directors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.movie_directors (
    tmdb_id integer NOT NULL,
    director_name character varying(200) NOT NULL,
    director_tmdb_id integer
);


ALTER TABLE public.movie_directors OWNER TO postgres;

--
-- Name: movie_genres; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.movie_genres (
    tmdb_id integer NOT NULL,
    genre_id integer NOT NULL
);


ALTER TABLE public.movie_genres OWNER TO postgres;

--
-- Name: movies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.movies (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tmdb_id integer NOT NULL,
    title text NOT NULL,
    poster_path text,
    release_date date,
    year integer GENERATED ALWAYS AS ((EXTRACT(year FROM release_date))::integer) STORED,
    runtime integer,
    popularity numeric(10,3),
    vote_average numeric(4,2),
    vote_count integer,
    avg_rating numeric(3,1) DEFAULT 0,
    rating_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    jellyfin_id text
);


ALTER TABLE public.movies OWNER TO postgres;

--
-- Name: ratings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ratings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    movie_id uuid NOT NULL,
    score integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ratings_score_check CHECK (((score >= 1) AND (score <= 10)))
);


ALTER TABLE public.ratings OWNER TO postgres;

--
-- Name: recommendation_impressions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.recommendation_impressions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    tmdb_id integer NOT NULL,
    strategy character varying(100),
    shown_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.recommendation_impressions OWNER TO postgres;

--
-- Name: user_follows; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_follows (
    follower_id uuid NOT NULL,
    following_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.user_follows OWNER TO postgres;

--
-- Name: user_list_follows; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_list_follows (
    user_id uuid NOT NULL,
    list_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.user_list_follows OWNER TO postgres;

--
-- Name: user_list_movies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_list_movies (
    list_id uuid NOT NULL,
    movie_id uuid NOT NULL,
    sort_order integer DEFAULT 0,
    added_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.user_list_movies OWNER TO postgres;

--
-- Name: user_lists; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_lists (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    is_public boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.user_lists OWNER TO postgres;

--
-- Name: user_subtitles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_subtitles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    movie_id uuid NOT NULL,
    language character varying(10) DEFAULT 'en'::character varying NOT NULL,
    label character varying(100) DEFAULT 'Custom'::character varying NOT NULL,
    content_vtt text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_subtitles OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email text NOT NULL,
    username text NOT NULL,
    password text NOT NULL,
    role text DEFAULT 'user'::text NOT NULL,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    preferences jsonb
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: watch_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.watch_history (
    user_id uuid NOT NULL,
    movie_id uuid NOT NULL,
    progress_s integer DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.watch_history OWNER TO postgres;

--
-- Name: watch_party_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.watch_party_messages (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    room_id uuid NOT NULL,
    user_id uuid NOT NULL,
    username text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.watch_party_messages OWNER TO postgres;

--
-- Name: watch_party_rooms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.watch_party_rooms (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    host_id uuid NOT NULL,
    movie_id uuid NOT NULL,
    room_code character varying(8) NOT NULL,
    is_active boolean DEFAULT true,
    playback_position numeric(12,2) DEFAULT 0,
    is_playing boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.watch_party_rooms OWNER TO postgres;

--
-- Name: watchlist; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.watchlist (
    user_id uuid NOT NULL,
    movie_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.watchlist OWNER TO postgres;

--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: dm_messages dm_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dm_messages
    ADD CONSTRAINT dm_messages_pkey PRIMARY KEY (id);


--
-- Name: dm_thread_reads dm_thread_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dm_thread_reads
    ADD CONSTRAINT dm_thread_reads_pkey PRIMARY KEY (thread_id, user_id);


--
-- Name: dm_threads dm_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dm_threads
    ADD CONSTRAINT dm_threads_pkey PRIMARY KEY (id);


--
-- Name: dm_threads dm_threads_user1_id_user2_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dm_threads
    ADD CONSTRAINT dm_threads_user1_id_user2_id_key UNIQUE (user1_id, user2_id);


--
-- Name: genres genres_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.genres
    ADD CONSTRAINT genres_name_key UNIQUE (name);


--
-- Name: genres genres_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.genres
    ADD CONSTRAINT genres_pkey PRIMARY KEY (id);


--
-- Name: movie_actors movie_actors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.movie_actors
    ADD CONSTRAINT movie_actors_pkey PRIMARY KEY (tmdb_id, actor_tmdb_id);


--
-- Name: movie_directors movie_directors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.movie_directors
    ADD CONSTRAINT movie_directors_pkey PRIMARY KEY (tmdb_id, director_name);


--
-- Name: movie_genres movie_genres_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.movie_genres
    ADD CONSTRAINT movie_genres_pkey PRIMARY KEY (tmdb_id, genre_id);


--
-- Name: movies movies_jellyfin_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.movies
    ADD CONSTRAINT movies_jellyfin_id_key UNIQUE (jellyfin_id);


--
-- Name: movies movies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.movies
    ADD CONSTRAINT movies_pkey PRIMARY KEY (id);


--
-- Name: movies movies_tmdb_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.movies
    ADD CONSTRAINT movies_tmdb_id_key UNIQUE (tmdb_id);


--
-- Name: ratings ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_pkey PRIMARY KEY (id);


--
-- Name: ratings ratings_user_id_movie_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_user_id_movie_id_key UNIQUE (user_id, movie_id);


--
-- Name: recommendation_impressions recommendation_impressions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recommendation_impressions
    ADD CONSTRAINT recommendation_impressions_pkey PRIMARY KEY (id);


--
-- Name: user_follows user_follows_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_follows
    ADD CONSTRAINT user_follows_pkey PRIMARY KEY (follower_id, following_id);


--
-- Name: user_list_follows user_list_follows_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_list_follows
    ADD CONSTRAINT user_list_follows_pkey PRIMARY KEY (user_id, list_id);


--
-- Name: user_list_movies user_list_movies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_list_movies
    ADD CONSTRAINT user_list_movies_pkey PRIMARY KEY (list_id, movie_id);


--
-- Name: user_lists user_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_lists
    ADD CONSTRAINT user_lists_pkey PRIMARY KEY (id);


--
-- Name: user_subtitles user_subtitles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_subtitles
    ADD CONSTRAINT user_subtitles_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: watch_history watch_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.watch_history
    ADD CONSTRAINT watch_history_pkey PRIMARY KEY (user_id, movie_id);


--
-- Name: watch_party_messages watch_party_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.watch_party_messages
    ADD CONSTRAINT watch_party_messages_pkey PRIMARY KEY (id);


--
-- Name: watch_party_rooms watch_party_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.watch_party_rooms
    ADD CONSTRAINT watch_party_rooms_pkey PRIMARY KEY (id);


--
-- Name: watch_party_rooms watch_party_rooms_room_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.watch_party_rooms
    ADD CONSTRAINT watch_party_rooms_room_code_key UNIQUE (room_code);


--
-- Name: watchlist watchlist_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_pkey PRIMARY KEY (user_id, movie_id);


--
-- Name: idx_comments_movie; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_comments_movie ON public.comments USING btree (movie_id);


--
-- Name: idx_dm_messages_thread; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_dm_messages_thread ON public.dm_messages USING btree (thread_id, created_at);


--
-- Name: idx_impressions_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_impressions_user ON public.recommendation_impressions USING btree (user_id);


--
-- Name: idx_impressions_user_tmdb; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_impressions_user_tmdb ON public.recommendation_impressions USING btree (user_id, tmdb_id);


--
-- Name: idx_movie_actors_tmdb; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_movie_actors_tmdb ON public.movie_actors USING btree (tmdb_id);


--
-- Name: idx_movie_directors_tmdb; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_movie_directors_tmdb ON public.movie_directors USING btree (tmdb_id);


--
-- Name: idx_movie_genres_tmdb; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_movie_genres_tmdb ON public.movie_genres USING btree (tmdb_id);


--
-- Name: idx_movies_popularity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_movies_popularity ON public.movies USING btree (popularity DESC);


--
-- Name: idx_movies_release_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_movies_release_date ON public.movies USING btree (release_date DESC);


--
-- Name: idx_movies_title_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_movies_title_trgm ON public.movies USING gin (title public.gin_trgm_ops);


--
-- Name: idx_movies_tmdb_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_movies_tmdb_id ON public.movies USING btree (tmdb_id);


--
-- Name: idx_movies_vote_average; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_movies_vote_average ON public.movies USING btree (vote_average DESC);


--
-- Name: idx_ratings_movie; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ratings_movie ON public.ratings USING btree (movie_id);


--
-- Name: idx_ratings_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ratings_user ON public.ratings USING btree (user_id);


--
-- Name: idx_user_follows_follower; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_follows_follower ON public.user_follows USING btree (follower_id);


--
-- Name: idx_user_follows_following; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_follows_following ON public.user_follows USING btree (following_id);


--
-- Name: idx_user_list_movies_list; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_list_movies_list ON public.user_list_movies USING btree (list_id);


--
-- Name: idx_user_lists_public; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_lists_public ON public.user_lists USING btree (is_public);


--
-- Name: idx_user_lists_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_lists_user ON public.user_lists USING btree (user_id);


--
-- Name: idx_user_subtitles_movie; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_subtitles_movie ON public.user_subtitles USING btree (movie_id);


--
-- Name: idx_watch_history_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_watch_history_user ON public.watch_history USING btree (user_id);


--
-- Name: idx_watch_party_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_watch_party_code ON public.watch_party_rooms USING btree (room_code);


--
-- Name: idx_watch_party_msgs_room; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_watch_party_msgs_room ON public.watch_party_messages USING btree (room_id);


--
-- Name: ratings trg_rating; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_rating AFTER INSERT OR DELETE OR UPDATE ON public.ratings FOR EACH ROW EXECUTE FUNCTION public.update_movie_rating();


--
-- Name: comments comments_movie_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_movie_id_fkey FOREIGN KEY (movie_id) REFERENCES public.movies(id) ON DELETE CASCADE;


--
-- Name: comments comments_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.comments(id) ON DELETE CASCADE;


--
-- Name: comments comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: dm_messages dm_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dm_messages
    ADD CONSTRAINT dm_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: dm_messages dm_messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dm_messages
    ADD CONSTRAINT dm_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.dm_threads(id) ON DELETE CASCADE;


--
-- Name: dm_thread_reads dm_thread_reads_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dm_thread_reads
    ADD CONSTRAINT dm_thread_reads_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.dm_threads(id) ON DELETE CASCADE;


--
-- Name: dm_thread_reads dm_thread_reads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dm_thread_reads
    ADD CONSTRAINT dm_thread_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: dm_threads dm_threads_user1_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dm_threads
    ADD CONSTRAINT dm_threads_user1_id_fkey FOREIGN KEY (user1_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: dm_threads dm_threads_user2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dm_threads
    ADD CONSTRAINT dm_threads_user2_id_fkey FOREIGN KEY (user2_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: movie_genres movie_genres_genre_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.movie_genres
    ADD CONSTRAINT movie_genres_genre_id_fkey FOREIGN KEY (genre_id) REFERENCES public.genres(id) ON DELETE CASCADE;


--
-- Name: movie_genres movie_genres_tmdb_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.movie_genres
    ADD CONSTRAINT movie_genres_tmdb_id_fkey FOREIGN KEY (tmdb_id) REFERENCES public.movies(tmdb_id) ON DELETE CASCADE;


--
-- Name: ratings ratings_movie_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_movie_id_fkey FOREIGN KEY (movie_id) REFERENCES public.movies(id) ON DELETE CASCADE;


--
-- Name: ratings ratings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: recommendation_impressions recommendation_impressions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recommendation_impressions
    ADD CONSTRAINT recommendation_impressions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_follows user_follows_follower_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_follows
    ADD CONSTRAINT user_follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_follows user_follows_following_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_follows
    ADD CONSTRAINT user_follows_following_id_fkey FOREIGN KEY (following_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_list_follows user_list_follows_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_list_follows
    ADD CONSTRAINT user_list_follows_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.user_lists(id) ON DELETE CASCADE;


--
-- Name: user_list_follows user_list_follows_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_list_follows
    ADD CONSTRAINT user_list_follows_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_list_movies user_list_movies_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_list_movies
    ADD CONSTRAINT user_list_movies_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.user_lists(id) ON DELETE CASCADE;


--
-- Name: user_list_movies user_list_movies_movie_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_list_movies
    ADD CONSTRAINT user_list_movies_movie_id_fkey FOREIGN KEY (movie_id) REFERENCES public.movies(id) ON DELETE CASCADE;


--
-- Name: user_lists user_lists_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_lists
    ADD CONSTRAINT user_lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_subtitles user_subtitles_movie_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_subtitles
    ADD CONSTRAINT user_subtitles_movie_id_fkey FOREIGN KEY (movie_id) REFERENCES public.movies(id) ON DELETE CASCADE;


--
-- Name: user_subtitles user_subtitles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_subtitles
    ADD CONSTRAINT user_subtitles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: watch_history watch_history_movie_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.watch_history
    ADD CONSTRAINT watch_history_movie_id_fkey FOREIGN KEY (movie_id) REFERENCES public.movies(id) ON DELETE CASCADE;


--
-- Name: watch_history watch_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.watch_history
    ADD CONSTRAINT watch_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: watch_party_messages watch_party_messages_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.watch_party_messages
    ADD CONSTRAINT watch_party_messages_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.watch_party_rooms(id) ON DELETE CASCADE;


--
-- Name: watch_party_messages watch_party_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.watch_party_messages
    ADD CONSTRAINT watch_party_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: watch_party_rooms watch_party_rooms_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.watch_party_rooms
    ADD CONSTRAINT watch_party_rooms_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: watch_party_rooms watch_party_rooms_movie_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.watch_party_rooms
    ADD CONSTRAINT watch_party_rooms_movie_id_fkey FOREIGN KEY (movie_id) REFERENCES public.movies(id) ON DELETE CASCADE;


--
-- Name: watchlist watchlist_movie_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_movie_id_fkey FOREIGN KEY (movie_id) REFERENCES public.movies(id) ON DELETE CASCADE;


--
-- Name: watchlist watchlist_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict WTMyLQh5v9BYKGEyX84IfiuufZgH9wRSOdCbDYWuN9ELajLA2QfwyvX4MeCduMn

