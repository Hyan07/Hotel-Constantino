import { Router } from 'express';
import { getHealth, getLive, getReady } from '../controllers/health.controller.js';
import { apiV1Router } from './v1/index.routes.js';

export const apiRouter = Router();

apiRouter.get('/', (_request, response) => {
  response.status(200).json({
    data: {
      name: "Constantino's Hotel API",
      version: '2.0.0-alpha.2',
      endpoints: {
        health: '/api/health',
        apiV1: '/api/v1',
      },
    },
  });
});

apiRouter.get('/health', getHealth);
apiRouter.get('/health/live', getLive);
apiRouter.get('/health/ready', getReady);
apiRouter.use('/v1', apiV1Router);
