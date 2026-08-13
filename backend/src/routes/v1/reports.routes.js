import { Router } from 'express';
import { authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { getReports } from '../../services/reports.service.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { reportSchema } from './schemas.js';

export const reportsRouter = Router();

reportsRouter.get(
  '/',
  authorize('reports.read'),
  validate(reportSchema, 'query'),
  asyncHandler(async (request, response) =>
    response.json({ data: await getReports(request.query) }),
  ),
);
