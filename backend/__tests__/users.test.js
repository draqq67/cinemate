import { describe, it, expect, beforeAll } from '@jest/globals';
import app from '../src/app.js';
import { createTestUser, authAgent } from './helpers.js';
import pool from '../src/db/pool.js'

describe('Users — /me/stats', () => {
  it('returns 401 when not authenticated', async () => {
    const { default: request } = await import('supertest');
    const res = await request(app).get('/api/users/me/stats');
    expect(res.status).toBe(401);
  });

  it('returns zero stats for new user', async () => {
    const { data } = await createTestUser();
    const agent = await authAgent(data.email, data.password);
    const res = await agent.get('/api/users/me/stats');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      watched:  0,
      rated:    0,
      wishlist: 0,
    });
  });

  it('reflects ratings in stats', async () => {
    const { data } = await createTestUser();
    const agent = await authAgent(data.email, data.password);
    await agent.post('/api/movies/550/rate').send({ score: 8 });
    const res = await agent.get('/api/users/me/stats');
    expect(res.body.rated).toBe(1);
    expect(parseFloat(res.body.avgRating)).toBe(8);
  });

  it('reflects wishlist in stats', async () => {
    const { data } = await createTestUser();
    const agent = await authAgent(data.email, data.password);
    await agent.post('/api/movies/550/watchlist');
    const res = await agent.get('/api/users/me/stats');
    expect(res.body.wishlist).toBe(1);
  });
});

describe('Users — /me/favourites', () => {
  it('returns movies rated 8 or above', async () => {
    const { data } = await createTestUser();
    const agent = await authAgent(data.email, data.password);
    await agent.post('/api/movies/550/rate').send({ score: 9 });
    const res = await agent.get('/api/users/me/favourites?limit=5');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    res.body.items.forEach(m => {
      expect(m.score).toBeGreaterThanOrEqual(8);
    });
  });

  it('does not include movies rated below 8', async () => {
    const { data } = await createTestUser();
    const agent = await authAgent(data.email, data.password);
    await agent.post('/api/movies/550/rate').send({ score: 6 });
    const res = await agent.get('/api/users/me/favourites?limit=5');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(0);
  });
});

describe('Users — /me/wishlist', () => {
  it('returns added movies', async () => {
    const { data } = await createTestUser();
    const agent = await authAgent(data.email, data.password);
    await agent.post('/api/movies/550/watchlist');
    const res = await agent.get('/api/users/me/wishlist?limit=5');
    expect(res.status).toBe(200);
    expect(res.body.items.some(m => m.tmdb_id === 550)).toBe(true);
  });

  it('does not include removed movies', async () => {
    const { data } = await createTestUser();
    const agent = await authAgent(data.email, data.password);
    await agent.post('/api/movies/550/watchlist');
    await agent.post('/api/movies/550/watchlist'); // toggle off
    const res = await agent.get('/api/users/me/wishlist?limit=5');
    expect(res.body.items.some(m => m.tmdb_id === 550)).toBe(false);
  });
});

describe('Users — /me/comments', () => {
  it('returns comments made by user', async () => {
    const { data } = await createTestUser();
    const agent = await authAgent(data.email, data.password);
    await agent.post('/api/movies/550/comments').send({ body: 'My test comment' });
    const res = await agent.get('/api/users/me/comments?limit=5');
    expect(res.status).toBe(200);
    expect(res.body.items.some(c => c.body === 'My test comment')).toBe(true);
  });

  it('returns movie title alongside comment', async () => {
    const { data } = await createTestUser();
    const agent = await authAgent(data.email, data.password);
    await agent.post('/api/movies/550/comments').send({ body: 'Comment with title check' });
    const res = await agent.get('/api/users/me/comments?limit=5');
    const comment = res.body.items.find(c => c.body === 'Comment with title check');
    expect(comment.movie_title).toBe('Fight Club');
    expect(comment.tmdb_id).toBe(550);
  });
});