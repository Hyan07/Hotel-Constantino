import { query } from '../lib/db.js';
import { readSessionCookie, verifySessionToken } from '../services/session.js';
import { HttpError } from '../utils/http-error.js';

export async function requireAuth(request, _response, next) {
  try {
    const token = readSessionCookie(request);
    if (!token) {
      throw new HttpError(401, 'Sessão ausente ou inválida.', 'AUTH_REQUIRED');
    }

    let payload;
    try {
      payload = await verifySessionToken(token);
    } catch {
      throw new HttpError(401, 'Sua sessão expirou. Entre novamente.', 'INVALID_SESSION');
    }

    const [profile] = await query(
      'SELECT id, email, full_name, role, active, session_version FROM users WHERE id = ? LIMIT 1',
      [payload.sub]
    );
    if (!profile || !profile.active || Number(profile.session_version) !== Number(payload.sessionVersion)) {
      throw new HttpError(403, 'Usuário sem perfil ativo.', 'PROFILE_INACTIVE');
    }

    request.auth = { token, user: { id: profile.id, email: profile.email }, profile };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRoles(...roles) {
  return (request, _response, next) => {
    if (!request.auth || !roles.includes(request.auth.profile.role)) {
      return next(new HttpError(403, 'Você não tem permissão para esta ação.', 'FORBIDDEN'));
    }
    next();
  };
}
