import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { validate } from '../src/middlewares/validate.js';

describe('middleware de validaÃ§Ã£o', () => {
  it('valida query sem sobrescrever o getter somente leitura do Express 5', () => {
    const request = {};
    Object.defineProperty(request, 'query', {
      enumerable: true,
      get: () => ({ page: '2' }),
    });
    let nextError;

    validate(z.object({ page: z.coerce.number().int().positive() }), 'query')(
      request,
      {},
      (error) => {
        nextError = error;
      },
    );

    assert.equal(nextError, undefined);
    assert.deepEqual(request.validated.query, { page: 2 });
    assert.deepEqual(request.query, { page: '2' });
  });
});
