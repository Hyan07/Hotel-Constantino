import { supabaseAdmin } from '../lib/supabase.js';
import { HttpError } from '../utils/http-error.js';

export async function requireAuth(request, _response, next) {
  try {
    const authorization = request.get('authorization') ?? '';
    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new HttpError(401, 'Sessão ausente ou inválida.', 'AUTH_REQUIRED');
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      throw new HttpError(401, 'Sua sessão expirou. Entre novamente.', 'INVALID_SESSION');
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, role, active')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError || !profile || !profile.active) {
      throw new HttpError(403, 'Usuário sem perfil ativo.', 'PROFILE_INACTIVE');
    }

    request.auth = { token, user: data.user, profile };
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
