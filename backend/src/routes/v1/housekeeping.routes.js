import { Router } from 'express';
import { authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  completeHousekeepingTask,
  createHousekeepingTask,
  listHousekeeping,
  startHousekeepingTask,
} from '../../services/housekeeping.service.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { actorFrom } from './route-helpers.js';
import {
  housekeepingActionSchema,
  housekeepingCreateSchema,
  housekeepingListSchema,
  idParamsSchema,
} from './schemas.js';

export const housekeepingRouter = Router();

housekeepingRouter.get(
  '/',
  authorize('housekeeping.read'),
  validate(housekeepingListSchema, 'query'),
  asyncHandler(async (request, response) =>
    response.json(await listHousekeeping(request.validated.query)),
  ),
);
housekeepingRouter.post(
  '/',
  authorize('housekeeping.write'),
  validate(housekeepingCreateSchema),
  asyncHandler(async (request, response) => {
    response.status(201).json({
      data: await createHousekeepingTask(request.body, actorFrom(request)),
    });
  }),
);
housekeepingRouter.post(
  '/:id/start',
  authorize('housekeeping.write'),
  validate(idParamsSchema, 'params'),
  validate(housekeepingActionSchema),
  asyncHandler(async (request, response) => {
    response.json({
      data: await startHousekeepingTask(request.params.id, request.body, actorFrom(request)),
    });
  }),
);
housekeepingRouter.post(
  '/:id/complete',
  authorize('housekeeping.write'),
  validate(idParamsSchema, 'params'),
  validate(housekeepingActionSchema),
  asyncHandler(async (request, response) => {
    response.json({
      data: await completeHousekeepingTask(request.params.id, request.body, actorFrom(request)),
    });
  }),
);
