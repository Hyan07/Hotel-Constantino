import { Router } from 'express';

export const configRouter = Router();

configRouter.get('/', (_request, response) => {
  response.set('Cache-Control', 'no-store');
  response.json({
    appName: "Constantino's Hotel",
    timezone: 'America/Sao_Paulo',
    database: 'mysql'
  });
});
