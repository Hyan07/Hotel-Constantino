import { Router } from 'express';
import { authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  createUser,
  listAuditLogs,
  listRoles,
  listUsers,
  updateUser,
} from '../../services/users.service.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { actorFrom } from './route-helpers.js';
import {
  auditListSchema,
  idParamsSchema,
  paginationSchema,
  userCreateSchema,
  userUpdateSchema,
} from './schemas.js';

export const usersRouter = Router();
export const auditRouter = Router();

usersRouter.get(
  '/roles',
  authorize('users.read'),
  asyncHandler(async (_request, response) => response.json({ data: await listRoles() })),
);
usersRouter.get(
  '/',
  authorize('users.read'),
  validate(paginationSchema, 'query'),
  asyncHandler(async (request, response) =>
    response.json(await listUsers(request.validated.query)),
  ),
);
usersRouter.post(
  '/',
  authorize('users.write'),
  validate(userCreateSchema),
  asyncHandler(async (request, response) => {
    response.status(201).json({ data: await createUser(request.body, actorFrom(request)) });
  }),
);
usersRouter.patch(
  '/:id',
  authorize('users.write'),
  validate(idParamsSchema, 'params'),
  validate(userUpdateSchema),
  asyncHandler(async (request, response) => {
    response.json({ data: await updateUser(request.params.id, request.body, actorFrom(request)) });
  }),
);

auditRouter.get(
  '/',
  authorize('audit.read'),
  validate(auditListSchema, 'query'),
  asyncHandler(async (request, response) =>
    response.json(await listAuditLogs(request.validated.query)),
  ),
);
