import { Router } from 'express';
import { authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { listCharges, listPayments } from '../../services/stays.service.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { transactionListSchema } from './schemas.js';

export const chargesRouter = Router();
export const paymentsRouter = Router();

chargesRouter.get(
  '/',
  authorize('stays.read'),
  validate(transactionListSchema, 'query'),
  asyncHandler(async (request, response) => response.json(await listCharges(request.query))),
);
paymentsRouter.get(
  '/',
  authorize('finance.read'),
  validate(transactionListSchema, 'query'),
  asyncHandler(async (request, response) => response.json(await listPayments(request.query))),
);
