import { env } from '../config/env.js';
import { withConnection } from '../db/pool.js';
import { getUserAccess, findUserByEmail } from '../db/repositories/auth.repository.js';
import { resolveSession } from '../services/auth.service.js';
import { AppError } from '../utils/app-error.js';
import { tokensMatch } from '../utils/tokens.js';

export function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=');
        const key = separator >= 0 ? part.slice(0, separator) : part;
        const value = separator >= 0 ? part.slice(separator + 1) : '';
        try {
          return [key, decodeURIComponent(value)];
        } catch {
          return [key, value];
        }
      }),
  );
}

export function normalizeRemoteAddress(address = '') {
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

export function canUseDevelopmentBypass({ nodeEnv, enabled, remoteAddress }) {
  const normalized = normalizeRemoteAddress(remoteAddress);
  return (
    nodeEnv === 'development' && enabled && (normalized === '127.0.0.1' || normalized === '::1')
  );
}

async function resolveDevelopmentUser() {
  return withConnection(async (connection) => {
    const user = await findUserByEmail(connection, 'dev-admin@localhost.invalid');
    return user ? getUserAccess(connection, user.id) : null;
  });
}

export async function requireAuthentication(request, _response, next) {
  try {
    const cookies = parseCookies(request.headers.cookie);
    const rawSessionId = cookies[env.sessionCookieName];
    const resolved = await resolveSession(rawSessionId);

    if (resolved) {
      request.auth = {
        user: resolved.user,
        session: resolved.session,
        rawSessionId,
        isBypass: false,
      };
      return next();
    }

    const bypassAllowed = canUseDevelopmentBypass({
      nodeEnv: env.nodeEnv,
      enabled: env.devAuthBypass,
      remoteAddress: request.socket.remoteAddress,
    });
    if (bypassAllowed) {
      const user = await resolveDevelopmentUser();
      if (user) {
        request.auth = { user, session: null, rawSessionId: null, isBypass: true };
        return next();
      }
    }

    return next(
      new AppError('Faça login para continuar.', { statusCode: 401, code: 'AUTH_REQUIRED' }),
    );
  } catch (error) {
    return next(error);
  }
}

export function requireCsrf(request, _response, next) {
  if (request.auth?.isBypass) return next();
  const token = request.headers['x-csrf-token'];
  if (!tokensMatch(token, request.auth?.session?.csrfHash)) {
    return next(
      new AppError('Token de segurança inválido. Atualize a página e tente novamente.', {
        statusCode: 403,
        code: 'CSRF_INVALID',
      }),
    );
  }
  return next();
}

export function authorize(permission) {
  return function authorizationMiddleware(request, _response, next) {
    if (!request.auth?.user?.permissions.includes(permission)) {
      return next(
        new AppError('Você não tem permissão para esta ação.', {
          statusCode: 403,
          code: 'FORBIDDEN',
        }),
      );
    }
    return next();
  };
}
