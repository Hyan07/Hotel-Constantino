import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../lib/db.js';
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
    const data = await query(
      `SELECT id, email, full_name, role, active, last_sign_in_at, created_at, updated_at
       FROM users ORDER BY full_name LIMIT 1000`
    );
    response.json({
      ok: true,
      data: data.map((user) => ({ ...user, active: Boolean(user.active) }))
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/users', async (request, response, next) => {
  try {
    const input = createUserSchema.parse(request.body);
    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(input.password, 12);
    await withTransaction(async (connection) => {
      try {
        await connection.execute(
          `INSERT INTO users (id, email, password_hash, full_name, role, active)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [userId, input.email.trim().toLowerCase(), passwordHash, input.fullName, input.role]
        );
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Já existe um usuário com este e-mail.', 'DUPLICATE_EMAIL');
        throw error;
      }
      await writeAudit({
        userId: request.auth.user.id,
        action: 'CREATE_AUTH_USER',
        tableName: 'users',
        recordId: userId,
        after: { email: input.email.trim().toLowerCase(), full_name: input.fullName, role: input.role, active: true },
        ipAddress: requestIp(request),
        userAgent: request.get('user-agent'),
        connection
      });
    });

    response.status(201).json({ ok: true, data: { id: userId } });
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
    const after = await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        'SELECT id, role, active FROM users WHERE id = ? FOR UPDATE',
        [request.params.id]
      );
      const before = assertFound(rows[0], 'Usuário não encontrado.');
      const active = typeof input.active === 'boolean' ? input.active : Boolean(before.active);
      await connection.execute(
        `UPDATE users SET role = ?, active = ?, session_version = session_version + 1
         WHERE id = ?`,
        [input.role, active ? 1 : 0, request.params.id]
      );
      const result = { id: before.id, role: input.role, active };
      await writeAudit({
        userId: request.auth.user.id,
        action: 'UPDATE_USER_ROLE',
        tableName: 'users',
        recordId: request.params.id,
        before: { ...before, active: Boolean(before.active) },
        after: result,
        ipAddress: requestIp(request),
        userAgent: request.get('user-agent'),
        connection
      });
      return result;
    });

    response.json({ ok: true, data: after });
  } catch (error) {
    next(error);
  }
});
