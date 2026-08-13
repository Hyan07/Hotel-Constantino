import { hashPassword, verifyPassword } from '../utils/password.js';
import { createOpaqueToken, hashToken } from '../utils/tokens.js';
import { env } from '../config/env.js';
import { withConnection, withTransaction } from '../db/pool.js';
import {
  findUserByEmail,
  getUserAccess,
  registerLoginFailure,
  registerLoginSuccess,
} from '../db/repositories/auth.repository.js';
import {
  createSessionRecord,
  deleteSession,
  findSession,
  touchSession,
} from '../db/repositories/session.repository.js';
import { writeAudit } from '../db/repositories/audit.repository.js';
import { AppError } from '../utils/app-error.js';

const dummyHashPromise = hashPassword('invalid-password-for-timing-only');

export function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

export async function authenticateCredentials({ email, password, requestId }) {
  const normalizedEmail = normalizeEmail(email);

  const authenticatedUser = await withTransaction(async (connection) => {
    const user = await findUserByEmail(connection, normalizedEmail);
    const hashToCheck = user?.passwordHash ?? (await dummyHashPromise);
    const passwordValid = await verifyPassword(password, hashToCheck);
    const currentlyLocked = user?.lockedUntil && new Date(user.lockedUntil) > new Date();
    const accountAvailable = user?.status === 'active' && !currentlyLocked;

    if (!user || !passwordValid || !accountAvailable) {
      await registerLoginFailure(connection, user?.id);
      await writeAudit(connection, {
        actorUserId: user?.id ?? null,
        action: 'auth.login_failed',
        entityType: 'session',
        requestId,
        context: { failureType: currentlyLocked ? 'locked' : 'invalid_credentials' },
      });
      return null;
    }

    await registerLoginSuccess(connection, user.id);
    await writeAudit(connection, {
      actorUserId: user.id,
      action: 'auth.login',
      entityType: 'session',
      requestId,
    });
    return getUserAccess(connection, user.id);
  });

  if (!authenticatedUser) {
    throw new AppError('E-mail ou senha inválidos.', {
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
  }
  return authenticatedUser;
}

export async function createSession(userId, previousRawSessionId) {
  const rawSessionId = createOpaqueToken();
  const rawCsrfToken = createOpaqueToken();
  const expiresAt = new Date(Date.now() + env.sessionTtlHours * 60 * 60 * 1000);

  await withTransaction(async (connection) => {
    await connection.execute('DELETE FROM sessions WHERE expires_at <= UTC_TIMESTAMP(3)');
    if (previousRawSessionId) await deleteSession(connection, hashToken(previousRawSessionId));
    await createSessionRecord(connection, {
      idHash: hashToken(rawSessionId),
      userId,
      csrfHash: hashToken(rawCsrfToken),
      expiresAt,
    });
  });

  return { rawSessionId, rawCsrfToken, expiresAt };
}

export async function resolveSession(rawSessionId) {
  if (!rawSessionId) return null;
  return withConnection(async (connection) => {
    const session = await findSession(connection, hashToken(rawSessionId));
    if (!session) return null;
    const user = await getUserAccess(connection, session.userId);
    if (!user || user.status !== 'active') return null;
    await touchSession(connection, session.idHash);
    return { session, user };
  });
}

export async function endSession({ rawSessionId, userId, requestId }) {
  await withTransaction(async (connection) => {
    await deleteSession(connection, rawSessionId ? hashToken(rawSessionId) : null);
    await writeAudit(connection, {
      actorUserId: userId,
      action: 'auth.logout',
      entityType: 'session',
      requestId,
    });
  });
}
