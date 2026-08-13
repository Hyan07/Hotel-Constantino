import { Router } from 'express';
import { executeDataQuery } from '../services/data-query.js';
import { requestIp } from '../utils/safe.js';

export const dataRouter = Router();

dataRouter.post('/query', async (request, response, next) => {
  try {
    const data = await executeDataQuery(request.body, request.auth, {
      ipAddress: requestIp(request),
      userAgent: request.get('user-agent')
    });
    response.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
});
