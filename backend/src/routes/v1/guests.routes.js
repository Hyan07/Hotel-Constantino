import { Router } from 'express';
import { authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  archiveGuest,
  createGuest,
  getGuest,
  listGuests,
  updateGuest,
} from '../../services/guests.service.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { actorFrom } from './route-helpers.js';
import { guestInputSchema, guestListSchema, guestUpdateSchema, idParamsSchema } from './schemas.js';

export const guestsRouter = Router();

guestsRouter.get(
  '/',
  authorize('guests.read'),
  validate(guestListSchema, 'query'),
  asyncHandler(async (request, response) => response.json(await listGuests(request.query))),
);
guestsRouter.post(
  '/',
  authorize('guests.write'),
  validate(guestInputSchema),
  asyncHandler(async (request, response) => {
    const guest = await createGuest(request.body, actorFrom(request));
    response.status(201).json({ data: guest });
  }),
);
guestsRouter.get(
  '/:id',
  authorize('guests.read'),
  validate(idParamsSchema, 'params'),
  asyncHandler(async (request, response) => {
    const guest = await getGuest(request.params.id);
    if (!guest)
      throw new AppError('Hóspede não encontrado.', { statusCode: 404, code: 'NOT_FOUND' });
    response.json({ data: guest });
  }),
);
guestsRouter.patch(
  '/:id',
  authorize('guests.write'),
  validate(idParamsSchema, 'params'),
  validate(guestUpdateSchema),
  asyncHandler(async (request, response) => {
    response.json({ data: await updateGuest(request.params.id, request.body, actorFrom(request)) });
  }),
);
guestsRouter.delete(
  '/:id',
  authorize('guests.write'),
  validate(idParamsSchema, 'params'),
  validate(guestUpdateSchema.pick({ version: true })),
  asyncHandler(async (request, response) => {
    await archiveGuest(request.params.id, request.body.version, actorFrom(request));
    response.status(204).end();
  }),
);
