import { Router } from 'express';
import { query } from '../lib/db.js';

export const healthRouter = Router();

healthRouter.get('/', async (_request, response) => {
  const started = Date.now();
  try {
    await query('SELECT 1 AS ok');
    response.json({
      ok: true,
      service: 'constantinos-hotel',
      database: 'mysql',
      databaseStatus: 'available',
      responseTimeMs: Date.now() - started,
      timestamp: new Date().toISOString()
    });
  } catch {
    response.status(503).json({
      ok: false,
      service: 'constantinos-hotel',
      database: 'mysql',
      databaseStatus: 'unavailable',
      responseTimeMs: Date.now() - started,
      timestamp: new Date().toISOString()
    });
  }
});
