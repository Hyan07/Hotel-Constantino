import { Router } from 'express';
import { authorize } from '../../middlewares/auth.js';
import { requireIdempotencyKey } from '../../middlewares/idempotency.js';
import { validate } from '../../middlewares/validate.js';
import {
  addCharge,
  addPayment,
  checkOut,
  getStay,
  listStays,
} from '../../services/stays.service.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { actorFrom, sendIdempotent } from './route-helpers.js';
import {
  chargeCreateSchema,
  idParamsSchema,
  paymentCreateSchema,
  stayActionSchema,
  stayListSchema,
} from './schemas.js';

export const staysRouter = Router();

staysRouter.get(
  '/',
  authorize('stays.read'),
  validate(stayListSchema, 'query'),
  asyncHandler(async (request, response) => response.json(await listStays(request.query))),
);
staysRouter.get(
  '/:id',
  authorize('stays.read'),
  validate(idParamsSchema, 'params'),
  asyncHandler(async (request, response) => {
    const stay = await getStay(request.params.id);
    if (!stay)
      throw new AppError('Hospedagem não encontrada.', { statusCode: 404, code: 'NOT_FOUND' });
    response.json({ data: stay });
  }),
);
staysRouter.post(
  '/:id/charges',
  authorize('charges.write'),
  validate(idParamsSchema, 'params'),
  validate(chargeCreateSchema),
  asyncHandler(async (request, response) => {
    response.status(201).json({
      data: await addCharge(request.params.id, request.body, actorFrom(request)),
    });
  }),
);
staysRouter.post(
  '/:id/payments',
  authorize('payments.write'),
  requireIdempotencyKey,
  validate(idParamsSchema, 'params'),
  validate(paymentCreateSchema),
  asyncHandler(async (request, response) => {
    const result = await addPayment(
      request.params.id,
      request.body,
      actorFrom(request),
      request.idempotencyKey,
    );
    sendIdempotent(response, result);
  }),
);
staysRouter.post(
  '/:id/checkout',
  authorize('stays.checkout'),
  requireIdempotencyKey,
  validate(idParamsSchema, 'params'),
  validate(stayActionSchema),
  asyncHandler(async (request, response) => {
    const result = await checkOut(
      request.params.id,
      request.body,
      actorFrom(request),
      request.idempotencyKey,
    );
    sendIdempotent(response, result, 200);
  }),
);
