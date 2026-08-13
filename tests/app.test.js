import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_value';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_value_for_server_only';

const [{ createApp }, requestModule] = await Promise.all([
  import('../src/app.js'),
  import('supertest')
]);
const request = requestModule.default;

test('public config exposes publishable data but never the secret key', async () => {
  const response = await request(createApp()).get('/api/config').expect(200);
  assert.equal(response.body.supabasePublishableKey, 'sb_publishable_test_value');
  assert.equal(JSON.stringify(response.body).includes('sb_secret_test_value'), false);
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
