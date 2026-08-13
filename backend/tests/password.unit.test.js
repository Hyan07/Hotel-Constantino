import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashPassword, verifyPassword } from '../src/utils/password.js';

describe('senhas com scrypt', () => {
  it('gera salt aleatório e valida somente a senha correta', async () => {
    const first = await hashPassword('Uma senha local forte 2026!');
    const second = await hashPassword('Uma senha local forte 2026!');

    assert.notEqual(first, second);
    assert.equal(await verifyPassword('Uma senha local forte 2026!', first), true);
    assert.equal(await verifyPassword('senha incorreta', first), false);
  });
});
