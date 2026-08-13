import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { requireRoles } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { HttpError, assertFound } from '../utils/http-error.js';
import { requestIp } from '../utils/safe.js';

const roleSchema = z.object({
  role: z.enum(['admin', 'reception', 'housekeeping', 'viewer']),
  active: z.boolean().optional()
});

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(128),
  fullName: z.string().trim().min(3).max(120),
  role: z.enum(['admin', 'reception', 'housekeeping', 'viewer'])
});

export const adminRouter = Router();
adminRouter.use(requireRoles('admin'));

adminRouter.get('/users', async (_request, response, next) => {
  try {
    const [{ data, error }, authResult] = await Promise.all([
      supabaseAdmin
      .from('profiles')
      .select('id, full_name, role, active, created_at, updated_at')
      .order('full_name'),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    ]);
    if (error) throw new HttpError(400, error.message, error.code);
    if (authResult.error) throw new HttpError(400, authResult.error.message, authResult.error.code);
    const usersById = new Map(authResult.data.users.map((user) => [user.id, user]));
    response.json({
      ok: true,
      data: data.map((profile) => ({
        ...profile,
        email: usersById.get(profile.id)?.email ?? null,
        last_sign_in_at: usersById.get(profile.id)?.last_sign_in_at ?? null
      }))
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/users', async (request, response, next) => {
  try {
    const input = createUserSchema.parse(request.body);
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName }
    });
    if (error) throw new HttpError(400, error.message, error.code);

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ full_name: input.fullName, role: input.role, active: true })
      .eq('id', data.user.id);

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(data.user.id);
      throw new HttpError(400, profileError.message, profileError.code);
    }

    await writeAudit({
      userId: request.auth.user.id,
      action: 'CREATE_AUTH_USER',
      tableName: 'profiles',
      recordId: data.user.id,
      after: { full_name: input.fullName, role: input.role, active: true },
      ipAddress: requestIp(request)
    });

    response.status(201).json({ ok: true, data: { id: data.user.id } });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/users/:id/role', async (request, response, next) => {
  try {
    if (request.params.id === request.auth.user.id) {
      throw new HttpError(400, 'Seu próprio perfil de acesso não pode ser alterado.', 'SELF_ROLE_CHANGE');
    }

    const input = roleSchema.parse(request.body);
    const { data: before, error: beforeError } = await supabaseAdmin
      .from('profiles')
      .select('id, role, active')
      .eq('id', request.params.id)
      .maybeSingle();
    if (beforeError) throw new HttpError(400, beforeError.message, beforeError.code);
    assertFound(before, 'Usuário não encontrado.');

    const update = { role: input.role };
    if (typeof input.active === 'boolean') update.active = input.active;

    const { data: after, error } = await supabaseAdmin
      .from('profiles')
      .update(update)
      .eq('id', request.params.id)
      .select('id, role, active')
      .single();
    if (error) throw new HttpError(400, error.message, error.code);

    await writeAudit({
      userId: request.auth.user.id,
      action: 'UPDATE_USER_ROLE',
      tableName: 'profiles',
      recordId: request.params.id,
      before,
      after,
      ipAddress: requestIp(request)
    });

    response.json({ ok: true, data: after });
  } catch (error) {
    next(error);
  }
});
