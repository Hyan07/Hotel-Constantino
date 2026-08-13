import { Router } from 'express';
import { z } from 'zod';
import { executeOperation } from '../services/hotel-operations.js';
import { requestIp } from '../utils/safe.js';

const paramsSchema = z.object({ name: z.string().regex(/^[a-z_]+$/).max(80) });
const bodySchema = z.record(z.string(), z.unknown()).default({});

export const operationsRouter = Router();

operationsRouter.post('/:name', async (request, response, next) => {
  try {
    const { name } = paramsSchema.parse(request.params);
    const args = bodySchema.parse(request.body);
    const data = await executeOperation(name, args, request.auth, {
      ipAddress: requestIp(request),
      userAgent: request.get('user-agent')
    });
    response.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
});
