import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const parameters = Object.freeze({ cost: 16_384, blockSize: 8, parallelization: 1, length: 64 });
const dummySalt = Buffer.from('8f4ce196995b5995f03425f69c989b81', 'hex');

async function derive(password, salt) {
  return scrypt(password, salt, parameters.length, {
    N: parameters.cost,
    r: parameters.blockSize,
    p: parameters.parallelization,
    maxmem: 64 * 1024 * 1024,
  });
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return [
    'scrypt',
    'v1',
    parameters.cost,
    parameters.blockSize,
    parameters.parallelization,
    salt.toString('base64url'),
    hash.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password, encodedHash) {
  const parts = encodedHash?.split('$') ?? [];
  if (parts.length !== 7 || parts[0] !== 'scrypt' || parts[1] !== 'v1') {
    await derive(password, dummySalt);
    return false;
  }

  const [, , cost, blockSize, parallelization, saltValue, expectedValue] = parts;
  if (
    Number(cost) !== parameters.cost ||
    Number(blockSize) !== parameters.blockSize ||
    Number(parallelization) !== parameters.parallelization
  ) {
    await derive(password, dummySalt);
    return false;
  }

  const expected = Buffer.from(expectedValue, 'base64url');
  const actual = await derive(password, Buffer.from(saltValue, 'base64url'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
