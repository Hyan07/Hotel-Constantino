import { Router } from 'express';
import { authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  createFinanceEntry,
  listFinance,
  reverseFinanceEntry,
} from '../../services/finance.service.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { actorFrom } from './route-helpers.js';
import {
  financeCreateSchema,
  financeListSchema,
  financeReverseSchema,
  idParamsSchema,
} from './schemas.js';

export const financeRouter = Router();

financeRouter.get(
  '/',
  authorize('finance.read'),
  validate(financeListSchema, 'query'),
  asyncHandler(async (request, response) => response.json(await listFinance(request.query))),
);
financeRouter.post(
  '/',
  authorize('finance.write'),
  validate(financeCreateSchema),
  asyncHandler(async (request, response) => {
    response.status(201).json({ data: await createFinanceEntry(request.body, actorFrom(request)) });
  }),
);
financeRouter.post(
  '/:id/reverse',
  authorize('finance.write'),
  validate(idParamsSchema, 'params'),
  validate(financeReverseSchema),
  asyncHandler(async (request, response) => {
    await reverseFinanceEntry(request.params.id, request.body, actorFrom(request));
    response.status(204).end();
  }),
);
