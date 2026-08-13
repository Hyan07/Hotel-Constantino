import { Router } from 'express';
import { z } from 'zod';
import { login, logout, me } from '../../controllers/auth.controller.js';
import { requireAuthentication, requireCsrf } from '../../middlewares/auth.js';
import { createRateLimit } from '../../middlewares/rate-limit.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';

const router = Router();
const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});
const loginRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

router.post('/login', loginRateLimit, validate(loginSchema), asyncHandler(login));
router.get('/me', requireAuthentication, me);
router.post('/logout', requireAuthentication, requireCsrf, asyncHandler(logout));

export { router as authRouter };
