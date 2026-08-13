import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

export function createOpaqueToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  const source = typeof token === 'string' ? token : '';
  return env.sessionSecret
    ? createHmac('sha256', env.sessionSecret).update(source).digest('hex')
    : createHash('sha256').update(source).digest('hex');
}

export function tokensMatch(rawToken, expectedHash) {
  if (typeof rawToken !== 'string' || typeof expectedHash !== 'string') return false;
  const actual = Buffer.from(hashToken(rawToken), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashValue(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}
