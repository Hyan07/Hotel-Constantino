import { Router } from 'express';
import { authorize } from '../../middlewares/auth.js';
import { getDashboard } from '../../services/dashboard.service.js';
import { asyncHandler } from '../../utils/async-handler.js';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/',
  authorize('dashboard.read'),
  asyncHandler(async (_request, response) => response.json({ data: await getDashboard() })),
);
