import compression from 'compression';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { adminRouter } from './routes/admin.js';
import { configRouter } from './routes/config.js';
import { healthRouter } from './routes/health.js';
import { storageRouter } from './routes/storage.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(currentDir, '../public');

export function createApp() {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", env.SUPABASE_URL, env.SUPABASE_URL.replace('https://', 'wss://')],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', rateLimit({
    windowMs: 60_000,
    limit: env.NODE_ENV === 'test' ? 10_000 : 180,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { ok: false, error: { code: 'RATE_LIMIT', message: 'Muitas solicitações. Aguarde um instante.' } }
  }));

  app.use('/api/config', configRouter);
  app.use('/api/health', healthRouter);
  app.use('/api/admin', requireAuth, adminRouter);
  app.use('/api/storage', requireAuth, storageRouter);
  app.use('/api', notFoundHandler);

  app.use(express.static(publicDir, {
    extensions: ['html'],
    maxAge: env.NODE_ENV === 'production' ? '1h' : 0,
    setHeaders(response, filePath) {
      if (filePath.endsWith('.html')) response.setHeader('Cache-Control', 'no-store');
    }
  }));

  app.get('*splat', (_request, response) => response.sendFile(path.join(publicDir, 'index.html')));
  app.use(errorHandler);
  return app;
}
