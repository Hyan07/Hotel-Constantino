import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema = fs.readFileSync(new URL('../database/mysql/001_install.sql', import.meta.url), 'utf8');

test('MySQL schema includes all persistent security and hotel entities', () => {
  for (const table of ['users', 'guests', 'rooms', 'reservations', 'reservation_guests', 'payments', 'maintenance', 'private_files', 'audit_logs']) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }
  assert.match(schema, /reservations_room_idx/);
  assert.match(schema, /LONGBLOB/);
  assert.doesNotMatch(schema, /supabase|postgresql|auth\.users/i);
});
