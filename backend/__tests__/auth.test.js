import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import app from '../src/app.js';
import { createTestUser, loginTestUser, authAgent } from './helpers.js';

describe('Auth — register', () => {
  it('registers a new user and returns 201 with user object', async () => {
    const { res } = await createTestUser();
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      email: expect.stringContaining('@test.cinemate'),
      role: 'user',
    });
    expect(res.body.user.password).toBeUndefined();
  });

  it('returns 409 when email already exists', async () => {
    const { data } = await createTestUser();
    const res2 = await request(app)
      .post('/api/auth/register')
      .send(data);
    expect(res2.status).toBe(409);
    expect(res2.body.error).toMatch(/taken/i);
  });

  it('returns 400 when password is too short', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'short@test.cinemate', username: 'shortpass', password: '123' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'missing@test.cinemate' });
    expect(res.status).toBe(400);
  });

  it('sets HttpOnly cookies on register', async () => {
    const { res } = await createTestUser();
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const hasAccessToken = cookies.some(c => c.startsWith('accessToken='));
    const hasRefreshToken = cookies.some(c => c.startsWith('refreshToken='));
    expect(hasAccessToken).toBe(true);
    expect(hasRefreshToken).toBe(true);
    cookies.forEach(c => expect(c).toMatch(/HttpOnly/i));
  });
});

describe('Auth — login', () => {
  let testEmail, testPassword;

  beforeAll(async () => {
    const { data } = await createTestUser();
    testEmail = data.email;
    testPassword = data.password;
  });

  it('logs in with correct credentials and returns 200', async () => {
    const { res } = await loginTestUser(testEmail, testPassword);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(testEmail);
  });

  it('returns 401 with wrong password', async () => {
    const { res } = await loginTestUser(testEmail, 'wrongpassword');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('returns 401 with non-existent email', async () => {
    const { res } = await loginTestUser('nobody@test.cinemate', 'pass');
    expect(res.status).toBe(401);
  });
});

describe('Auth — /me', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns user data when authenticated', async () => {
    const { data } = await createTestUser();
    const agent = await authAgent(data.email, data.password);
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(data.email);
    expect(res.body.user.password).toBeUndefined();
  });
});

describe('Auth — logout', () => {
  it('clears cookies on logout', async () => {
    const { data } = await createTestUser();
    const agent = await authAgent(data.email, data.password);
    const res = await agent.post('/api/auth/logout');
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] || [];
    const accessCleared = cookies.some(c => c.includes('accessToken=;') || c.includes('accessToken=,'));
    expect(accessCleared).toBe(true);
  });
});

describe('Auth — rate limiting', () => {
  it('returns 429 after 10 failed login attempts', async () => {
    const attempts = Array.from({ length: 11 }, () =>
      request(app)
        .post('/api/auth/login')
        .send({ email: 'ratelimit@test.cinemate', password: 'wrong' })
    );
    const results = await Promise.all(attempts);
    const statuses = results.map(r => r.status);
    expect(statuses).toContain(429);
  });
});