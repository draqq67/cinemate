import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import app from '../src/app.js';
import { createTestUser, authAgent } from './helpers.js';

describe('Movies — GET /api/movies', () => {
  it('returns paginated movie list with default sort', async () => {
    const res = await request(app).get('/api/movies');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      movies: expect.any(Array),
      total: expect.any(Number),
      page: 1,
      pages: expect.any(Number),
    });
    expect(res.body.movies.length).toBeGreaterThan(0);
  });

  it('returns movies with required fields', async () => {
    const res = await request(app).get('/api/movies?limit=1');
    const movie = res.body.movies[0];
    expect(movie).toHaveProperty('tmdb_id');
    expect(movie).toHaveProperty('title');
    expect(movie).toHaveProperty('poster_path');
    expect(movie).toHaveProperty('vote_average');
    expect(movie).toHaveProperty('genres');
    expect(Array.isArray(movie.genres)).toBe(true);
  });

  it('filters by genre', async () => {
    const res = await request(app).get('/api/movies?genre=Drama&limit=5');
    expect(res.status).toBe(200);
    res.body.movies.forEach(m => {
      expect(m.genres).toContain('Drama');
    });
  });

  it('searches by title', async () => {
    const res = await request(app).get('/api/movies?search=fight&limit=5');
    expect(res.status).toBe(200);
    res.body.movies.forEach(m => {
      expect(m.title.toLowerCase()).toContain('fight');
    });
  });

  it('sorts by rating descending', async () => {
    const res = await request(app).get('/api/movies?sort=rating&limit=10');
    expect(res.status).toBe(200);
    const ratings = res.body.movies.map(m => parseFloat(m.vote_average));
    for (let i = 1; i < ratings.length; i++) {
      expect(ratings[i - 1]).toBeGreaterThanOrEqual(ratings[i]);
    }
  });

  it('sorts by newest release date', async () => {
    const res = await request(app).get('/api/movies?sort=newest&limit=10');
    expect(res.status).toBe(200);
    const dates = res.body.movies.map(m => new Date(m.release_date).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
    }
  });

  it('paginates correctly', async () => {
    const page1 = await request(app).get('/api/movies?limit=5&page=1');
    const page2 = await request(app).get('/api/movies?limit=5&page=2');
    const ids1 = page1.body.movies.map(m => m.tmdb_id);
    const ids2 = page2.body.movies.map(m => m.tmdb_id);
    const overlap = ids1.filter(id => ids2.includes(id));
    expect(overlap.length).toBe(0);
  });

  it('returns empty array for non-existent search term', async () => {
    const res = await request(app).get('/api/movies?search=xyzzy_no_match_12345');
    expect(res.status).toBe(200);
    expect(res.body.movies).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });
});

describe('Movies — GET /api/movies/genres', () => {
  it('returns genre list with counts', async () => {
    const res = await request(app).get('/api/movies/genres');
    expect(res.status).toBe(200);
    expect(res.body.genres.length).toBeGreaterThan(0);
    res.body.genres.forEach(g => {
      expect(g).toHaveProperty('id');
      expect(g).toHaveProperty('name');
      expect(g).toHaveProperty('count');
    });
  });
});

describe('Movies — GET /api/movies/:tmdbId', () => {
  it('returns full movie detail for Fight Club (550)', async () => {
    const res = await request(app).get('/api/movies/550');
    expect(res.status).toBe(200);
    expect(res.body.movie.title).toBe('Fight Club');
    expect(res.body.movie.tmdb_id).toBe(550);
    expect(Array.isArray(res.body.cast)).toBe(true);
    expect(Array.isArray(res.body.crew)).toBe(true);
    expect(Array.isArray(res.body.tmdbReviews)).toBe(true);
    expect(Array.isArray(res.body.comments)).toBe(true);
  });

  it('includes genres, keywords, countries in movie detail', async () => {
    const res = await request(app).get('/api/movies/550');
    expect(Array.isArray(res.body.movie.genres)).toBe(true);
    expect(res.body.movie.genres.length).toBeGreaterThan(0);
  });

  it('returns 404 for non-existent tmdb_id', async () => {
    const res = await request(app).get('/api/movies/999999999');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

describe('Movies — rating', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app)
      .post('/api/movies/550/rate')
      .send({ score: 8 });
    expect(res.status).toBe(401);
  });

  it('saves rating and returns updated avg', async () => {
    const { data } = await createTestUser();
    const agent = await authAgent(data.email, data.password);
    const res = await agent.post('/api/movies/550/rate').send({ score: 9 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.avg_rating).toBeDefined();
    expect(res.body.rating_count).toBeGreaterThan(0);
  });

  it('updates existing rating on duplicate', async () => {
    const { data } = await createTestUser();
    const agent = await authAgent(data.email, data.password);
    await agent.post('/api/movies/550/rate').send({ score: 7 });
    const res = await agent.post('/api/movies/550/rate').send({ score: 10 });
    expect(res.status).toBe(200);
    const myRating = await agent.get('/api/movies/550/my-rating');
    expect(myRating.body.score).toBe(10);
  });

  it('returns 400 for score out of range', async () => {
    const { data } = await createTestUser();
    const agent = await authAgent(data.email, data.password);
    const res = await agent.post('/api/movies/550/rate').send({ score: 11 });
    expect(res.status).toBe(400);
  });
});

describe('Movies — comments', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app)
      .post('/api/movies/550/comments')
      .send({ body: 'great movie' });
    expect(res.status).toBe(401);
  });

  it('posts a comment and returns 201', async () => {
    const { data } = await createTestUser();
    const agent = await authAgent(data.email, data.password);
    const res = await agent.post('/api/movies/550/comments').send({ body: 'Amazing film!' });
    expect(res.status).toBe(201);
    expect(res.body.comment.body).toBe('Amazing film!');
    expect(res.body.comment.username).toBe(data.username);
  });

  it('returns 400 for empty comment', async () => {
    const { data } = await createTestUser();
    const agent = await authAgent(data.email, data.password);
    const res = await agent.post('/api/movies/550/comments').send({ body: '   ' });
    expect(res.status).toBe(400);
  });

  it('comment appears in movie detail', async () => {
    const { data } = await createTestUser();
    const agent = await authAgent(data.email, data.password);
    await agent.post('/api/movies/550/comments').send({ body: 'Test comment for retrieval' });
    const detail = await request(app).get('/api/movies/550');
    const found = detail.body.comments.some(c => c.body === 'Test comment for retrieval');
    expect(found).toBe(true);
  });
});

describe('Movies — watchlist', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app).post('/api/movies/550/watchlist');
    expect(res.status).toBe(401);
  });

  it('adds movie to watchlist', async () => {
    const { data } = await createTestUser();
    const agent = await authAgent(data.email, data.password);
    const res = await agent.post('/api/movies/550/watchlist');
    expect(res.status).toBe(200);
    expect(res.body.added).toBe(true);
  });

  it('removes movie from watchlist on second toggle', async () => {
    const { data } = await createTestUser();
    const agent = await authAgent(data.email, data.password);
    await agent.post('/api/movies/550/watchlist');
    const res = await agent.post('/api/movies/550/watchlist');
    expect(res.body.added).toBe(false);
  });

  it('watchlist status reflects current state', async () => {
    const { data } = await createTestUser();
    const agent = await authAgent(data.email, data.password);
    const before = await agent.get('/api/movies/550/watchlist');
    expect(before.body.inWatchlist).toBe(false);
    await agent.post('/api/movies/550/watchlist');
    const after = await agent.get('/api/movies/550/watchlist');
    expect(after.body.inWatchlist).toBe(true);
  });
});