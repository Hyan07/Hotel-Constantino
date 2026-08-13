import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.MYSQL_HOST = '127.0.0.1';
process.env.MYSQL_DATABASE = 'constantinos_test';
process.env.MYSQL_USER = 'test';
process.env.MYSQL_PASSWORD = 'test-password';
process.env.SESSION_SECRET = 'session-test-secret-with-at-least-32-characters';

const { createSessionToken, verifySessionToken } = await import('../src/services/session.js');

test('signed session token round-trips user and session version', async () => {
  const token = await createSessionToken({ id: 'user-123', session_version: 7 });
  const payload = await verifySessionToken(token);
  assert.equal(payload.sub, 'user-123');
  assert.equal(payload.sessionVersion, 7);
});

test('tampered session token is rejected', async () => {
  const token = await createSessionToken({ id: 'user-123', session_version: 1 });
  const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
  await assert.rejects(() => verifySessionToken(tampered));
});
