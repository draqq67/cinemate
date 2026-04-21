import request from 'supertest';
import app from '../src/app.js';

export { app };

export async function createTestUser(overrides = {}) {
  const defaults = {
    email: `user_${Date.now()}@test.cinemate`,
    username: `testuser_${Date.now()}`,
    password: 'TestPass123!',
  };
  const data = { ...defaults, ...overrides };
  const res = await request(app)
    .post('/api/auth/register')
    .send(data);
  return { res, data };
}

export async function loginTestUser(email, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  // Extract cookies for subsequent requests
  const cookies = res.headers['set-cookie'];
  return { res, cookies };
}

export async function authAgent(email, password) {
  const { cookies } = await loginTestUser(email, password);
  return {
    get: (url) => request(app).get(url).set('Cookie', cookies),
    post: (url) => request(app).post(url).set('Cookie', cookies),
    put: (url) => request(app).put(url).set('Cookie', cookies),
    delete: (url) => request(app).delete(url).set('Cookie', cookies),
  };
}