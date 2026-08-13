import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.MYSQL_HOST = '127.0.0.1';
process.env.MYSQL_PORT = '3306';
process.env.MYSQL_DATABASE = 'constantinos_test';
process.env.MYSQL_USER = 'test';
process.env.MYSQL_PASSWORD = 'test-password';
process.env.SESSION_SECRET = 'test-session-secret-with-more-than-32-characters';

const [{ createApp }, requestModule] = await Promise.all([
  import('../src/app.js'),
  import('supertest')
]);
const request = requestModule.default;

test('public config identifies MySQL without exposing credentials', async () => {
  const response = await request(createApp()).get('/api/config').expect(200);
  assert.equal(response.body.database, 'mysql');
  assert.equal(JSON.stringify(response.body).includes('test-password'), false);
  assert.equal(JSON.stringify(response.body).includes('constantinos_test'), false);
  assert.match(response.headers['cache-control'], /no-store/);
});

test('admin API rejects unauthenticated requests', async () => {
  const response = await request(createApp()).get('/api/admin/users').expect(401);
  assert.equal(response.body.error.code, 'AUTH_REQUIRED');
});

test('unknown API routes return JSON 404 instead of the SPA shell', async () => {
  const response = await request(createApp()).get('/api/does-not-exist').expect(404);
  assert.equal(response.body.error.code, 'ROUTE_NOT_FOUND');
});

test('security headers are enabled', async () => {
  const response = await request(createApp()).get('/api/config').expect(200);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.match(response.headers['content-security-policy'], /default-src 'self'/);
});

test('mutating API requests reject a foreign origin', async () => {
  const response = await request(createApp())
    .post('/api/auth/logout')
    .set('Origin', 'https://attacker.example')
    .expect(403);
  assert.equal(response.body.error.code, 'INVALID_ORIGIN');
});
