import { Router } from 'express';
import { authorize } from '../../middlewares/auth.js';
import { requireIdempotencyKey } from '../../middlewares/idempotency.js';
import { validate } from '../../middlewares/validate.js';
import {
  changeReservationStatus,
  createReservation,
  getReservation,
  listReservations,
  updateReservation,
} from '../../services/reservations.service.js';
import { checkIn } from '../../services/stays.service.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { actorFrom, sendIdempotent } from './route-helpers.js';
import {
  idParamsSchema,
  reservationActionSchema,
  reservationCreateSchema,
  reservationListSchema,
  reservationUpdateSchema,
  stayActionSchema,
} from './schemas.js';

export const reservationsRouter = Router();

reservationsRouter.get(
  '/',
  authorize('reservations.read'),
  validate(reservationListSchema, 'query'),
  asyncHandler(async (request, response) =>
    response.json(await listReservations(request.validated.query)),
  ),
);
reservationsRouter.post(
  '/',
  authorize('reservations.write'),
  requireIdempotencyKey,
  validate(reservationCreateSchema),
  asyncHandler(async (request, response) => {
    const result = await createReservation(
      request.body,
      actorFrom(request),
      request.idempotencyKey,
    );
    sendIdempotent(response, result);
  }),
);
reservationsRouter.get(
  '/:id',
  authorize('reservations.read'),
  validate(idParamsSchema, 'params'),
  asyncHandler(async (request, response) => {
    const reservation = await getReservation(request.params.id);
    if (!reservation)
      throw new AppError('Reserva não encontrada.', { statusCode: 404, code: 'NOT_FOUND' });
    response.json({ data: reservation });
  }),
);
reservationsRouter.patch(
  '/:id',
  authorize('reservations.write'),
  validate(idParamsSchema, 'params'),
  validate(reservationUpdateSchema),
  asyncHandler(async (request, response) => {
    response.json({
      data: await updateReservation(request.params.id, request.body, actorFrom(request)),
    });
  }),
);
for (const [path, status, permission] of [
  ['confirm', 'confirmada', 'reservations.write'],
  ['cancel', 'cancelada', 'reservations.cancel'],
  ['no-show', 'no_show', 'reservations.cancel'],
]) {
  reservationsRouter.post(
    `/:id/${path}`,
    authorize(permission),
    validate(idParamsSchema, 'params'),
    validate(reservationActionSchema),
    asyncHandler(async (request, response) => {
      response.json({
        data: await changeReservationStatus(
          request.params.id,
          status,
          request.body,
          actorFrom(request),
        ),
      });
    }),
  );
}
reservationsRouter.post(
  '/:id/check-in',
  authorize('stays.checkin'),
  requireIdempotencyKey,
  validate(idParamsSchema, 'params'),
  validate(stayActionSchema),
  asyncHandler(async (request, response) => {
    const result = await checkIn(
      request.params.id,
      request.body,
      actorFrom(request),
      request.idempotencyKey,
    );
    sendIdempotent(response, result);
  }),
);
