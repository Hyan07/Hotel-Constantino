import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'fatal';
process.env.DEV_AUTH_BYPASS = 'false';

let app;

before(async () => {
  const module = await import('../src/app.js');
  app = module.createApp();
});

describe('GET /api/health', () => {
  it('confirma que a API está disponível', async () => {
    const response = await request(app).get('/api/health').expect(200);

    assert.equal(response.body.data.status, 'ok');
    assert.equal(response.body.data.service, 'constantinos-hotel-api');
    assert.equal(response.body.data.environment, 'test');
    assert.match(response.headers['x-request-id'], /^[a-f0-9-]{36}$/i);
  });

  it('envia cabeçalhos básicos de segurança', async () => {
    const response = await request(app).get('/api/health').expect(200);

    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['x-powered-by'], undefined);
    assert.ok(response.headers['content-security-policy']);
  });
});

describe('rotas desconhecidas', () => {
  it('retorna um erro padronizado', async () => {
    const response = await request(app).get('/api/rota-inexistente').expect(404);

    assert.equal(response.body.error.code, 'ROUTE_NOT_FOUND');
    assert.ok(response.body.error.requestId);
  });
});

describe('payload inválido', () => {
  it('rejeita JSON malformado sem expor erro interno', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('content-type', 'application/json')
      .send('{"email":')
      .expect(400);

    assert.equal(response.body.error.code, 'INVALID_JSON');
    assert.equal(response.body.error.stack, undefined);
    assert.ok(response.body.error.requestId);
  });
});
