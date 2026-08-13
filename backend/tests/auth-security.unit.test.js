import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.DEV_AUTH_BYPASS = 'false';

const { canUseDevelopmentBypass } = await import('../src/middlewares/auth.js');

describe('bypass de autenticação', () => {
  it('aceita somente desenvolvimento habilitado em loopback', () => {
    assert.equal(
      canUseDevelopmentBypass({
        nodeEnv: 'development',
        enabled: true,
        remoteAddress: '::ffff:127.0.0.1',
      }),
      true,
    );
  });

  it('recusa produção mesmo quando a opção foi solicitada', () => {
    assert.equal(
      canUseDevelopmentBypass({
        nodeEnv: 'production',
        enabled: true,
        remoteAddress: '127.0.0.1',
      }),
      false,
    );
  });

  it('recusa endereços fora do loopback e não considera cabeçalhos de proxy', () => {
    assert.equal(
      canUseDevelopmentBypass({
        nodeEnv: 'development',
        enabled: true,
        remoteAddress: '192.168.1.20',
      }),
      false,
    );
  });
});
