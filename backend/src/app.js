import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { apiRouter } from './routes/index.routes.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendDistributionDirectory = path.resolve(currentDirectory, '../../frontend/dist');

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxy);

  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(request) {
          return {
            id: request.id,
            method: request.method,
            url: request.url?.split('?')[0],
            remoteAddress: request.remoteAddress,
          };
        },
        res(response) {
          return { statusCode: response.statusCode };
        },
      },
      genReqId(request, response) {
        const incoming = request.headers['x-request-id'];
        const requestId =
          typeof incoming === 'string' && /^[A-Za-z0-9_-]{8,80}$/u.test(incoming)
            ? incoming
            : randomUUID();
        response.setHeader('x-request-id', requestId);
        return requestId;
      },
      customLogLevel(_request, response, error) {
        if (error || response.statusCode >= 500) return 'error';
        if (response.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          imgSrc: ["'self'", 'data:'],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
        },
      },
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  app.use('/api', apiRouter);

  if (env.isProduction) {
    app.use(
      express.static(frontendDistributionDirectory, {
        etag: true,
        index: false,
        immutable: true,
        maxAge: '1y',
      }),
    );
    app.get('/{*path}', (request, response, next) => {
      if (request.path.startsWith('/api')) return next();
      response.setHeader('Cache-Control', 'no-cache');
      return response.sendFile(path.join(frontendDistributionDirectory, 'index.html'));
    });
  } else {
    app.get('/', (_request, response) => {
      response.status(200).json({
        data: {
          message: "Backend do Constantino's Hotel disponível.",
          frontend: env.appUrl,
          api: '/api',
        },
      });
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
