import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStoragePath } from '../src/utils/safe.js';

test('normalizeStoragePath accepts a scoped safe path', () => {
  assert.equal(normalizeStoragePath('/guest-id/file.pdf'), 'guest-id/file.pdf');
});

test('normalizeStoragePath rejects traversal and backslashes', () => {
  assert.equal(normalizeStoragePath('../secret.env'), null);
  assert.equal(normalizeStoragePath('folder\\secret.env'), null);
});
