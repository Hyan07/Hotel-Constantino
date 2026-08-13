import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../public/assets/js/modules/database.js';

test('database client sends structured allowlist-friendly queries', async () => {
  const previousFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ ok: true, data: [{ id: 'guest-1', full_name: 'Ana' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const database = await getDatabase();
    const result = await database.from('guests')
      .select('id, full_name')
      .or('full_name.ilike.%ana%,email.ilike.%ana%')
      .is('deleted_at', null)
      .order('full_name')
      .limit(10);

    assert.equal(result.error, null);
    assert.equal(result.data[0].full_name, 'Ana');
    assert.equal(captured.url, '/api/data/query');
    assert.equal(captured.body.resource, 'guests');
    assert.equal(captured.body.operation, 'select');
    assert.equal(captured.body.filters[0].operator, 'or');
    assert.equal(captured.body.filters[0].conditions.length, 2);
    assert.equal(captured.options.credentials, 'same-origin');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('database client preserves insert-returning-single semantics', async () => {
  const previousFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ ok: true, data: { id: 'new-id' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  try {
    const database = await getDatabase();
    const result = await database.from('guests').insert({ full_name: 'Ana Maria' }).select().single();
    assert.equal(result.data.id, 'new-id');
    assert.equal(body.operation, 'insert');
    assert.equal(body.returning, true);
    assert.equal(body.single, true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
