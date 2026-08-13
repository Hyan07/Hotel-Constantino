import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const envModuleUrl = new URL('../src/config/env.js', import.meta.url).href;
const baseProductionEnvironment = {
  ...process.env,
  NODE_ENV: 'production',
  APP_URL: 'https://hotel.example.invalid',
  DB_USER: 'constantinos_prod',
  DB_PASSWORD: 'production-test-password-only',
  SESSION_SECRET: 'production-test-session-secret-only-2026',
  DEV_AUTH_BYPASS: 'false',
  ADMIN_BOOTSTRAP_ENABLED: 'false',
  BOOTSTRAP_ADMIN_NAME: '',
  BOOTSTRAP_ADMIN_EMAIL: '',
  BOOTSTRAP_ADMIN_PASSWORD: '',
};

function validateEnvironment(overrides = {}) {
  return spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', `await import(${JSON.stringify(envModuleUrl)})`],
    {
      env: { ...baseProductionEnvironment, ...overrides },
      encoding: 'utf8',
    },
  );
}

describe('validação do ambiente de produção', () => {
  it('aceita uma configuração segura completa', () => {
    assert.equal(validateEnvironment().status, 0);
  });

  it('recusa bypass, root e segredos fracos', () => {
    for (const overrides of [
      { DEV_AUTH_BYPASS: 'true' },
      { DB_USER: 'root' },
      { SESSION_SECRET: 'secret' },
      { DB_PASSWORD: 'change-me' },
    ]) {
      assert.notEqual(validateEnvironment(overrides).status, 0);
    }
  });

  it('valida todos os campos quando o bootstrap é habilitado', () => {
    const result = validateEnvironment({ ADMIN_BOOTSTRAP_ENABLED: 'true' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /BOOTSTRAP_ADMIN_NAME/u);
    assert.match(result.stderr, /BOOTSTRAP_ADMIN_EMAIL/u);
    assert.match(result.stderr, /BOOTSTRAP_ADMIN_PASSWORD/u);
  });
});
