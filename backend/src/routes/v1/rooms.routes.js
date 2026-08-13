import { Router } from 'express';
import { authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  changeRoomStatus,
  createRoom,
  getRoom,
  listRooms,
  updateRoom,
} from '../../services/rooms.service.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { actorFrom } from './route-helpers.js';
import {
  idParamsSchema,
  roomCreateSchema,
  roomListSchema,
  roomStatusSchema,
  roomUpdateSchema,
} from './schemas.js';

export const roomsRouter = Router();

roomsRouter.get(
  '/',
  authorize('rooms.read'),
  validate(roomListSchema, 'query'),
  asyncHandler(async (request, response) =>
    response.json(await listRooms(request.validated.query)),
  ),
);
roomsRouter.post(
  '/',
  authorize('rooms.write'),
  validate(roomCreateSchema),
  asyncHandler(async (request, response) => {
    response.status(201).json({ data: await createRoom(request.body, actorFrom(request)) });
  }),
);
roomsRouter.get(
  '/:id',
  authorize('rooms.read'),
  validate(idParamsSchema, 'params'),
  asyncHandler(async (request, response) => {
    const room = await getRoom(request.params.id);
    if (!room) throw new AppError('Quarto não encontrado.', { statusCode: 404, code: 'NOT_FOUND' });
    response.json({ data: room });
  }),
);
roomsRouter.patch(
  '/:id',
  authorize('rooms.write'),
  validate(idParamsSchema, 'params'),
  validate(roomUpdateSchema),
  asyncHandler(async (request, response) => {
    response.json({ data: await updateRoom(request.params.id, request.body, actorFrom(request)) });
  }),
);
roomsRouter.post(
  '/:id/status',
  authorize('rooms.write'),
  validate(idParamsSchema, 'params'),
  validate(roomStatusSchema),
  asyncHandler(async (request, response) => {
    response.json({
      data: await changeRoomStatus(request.params.id, request.body, actorFrom(request)),
    });
  }),
);
