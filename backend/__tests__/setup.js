import pool from '../src/db/pool.js';

// Runs once before all test suites
beforeAll(async () => {
  // Verify DB connection
  await pool.query('SELECT 1');
});

// Close pool after all tests
afterAll(async () => {
  await pool.end();
});