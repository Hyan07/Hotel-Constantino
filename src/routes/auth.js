import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { requireAuth } from '../middleware/auth.js';
import { clearSessionCookie, createSessionToken, setSessionCookie } from '../services/session.js';
import { HttpError } from '../utils/http-error.js';

const loginSchema = z.object({
  email: z.string().trim().email().max(190).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128)
});

export const authRouter = Router();

authRouter.post('/login', rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { ok: false, error: { code: 'LOGIN_RATE_LIMIT', message: 'Muitas tentativas. Aguarde alguns minutos.' } }
}), async (request, response, next) => {
  try {
    const input = loginSchema.parse(request.body);
    const [user] = await query(
      'SELECT id, email, full_name, role, active, password_hash, session_version FROM users WHERE email = ? LIMIT 1',
      [input.email]
    );
    const valid = user ? await bcrypt.compare(input.password, user.password_hash) : false;
    if (!valid || !user.active) {
      throw new HttpError(401, 'E-mail ou senha incorretos.', 'INVALID_CREDENTIALS');
    }

    const token = await createSessionToken(user);
    setSessionCookie(response, token);
    await query('UPDATE users SET last_sign_in_at = UTC_TIMESTAMP(3) WHERE id = ?', [user.id]);
    response.json({
      ok: true,
      data: {
        session: { user: { id: user.id, email: user.email } },
        profile: { id: user.id, full_name: user.full_name, role: user.role, active: Boolean(user.active) }
      }
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/session', requireAuth, (request, response) => {
  const { id, full_name, role, active } = request.auth.profile;
  response.set('Cache-Control', 'no-store');
  response.json({
    ok: true,
    data: {
      session: { user: request.auth.user },
      profile: { id, full_name, role, active: Boolean(active) }
    }
  });
});

authRouter.post('/logout', (_request, response) => {
  clearSessionCookie(response);
  response.json({ ok: true, data: null });
});
