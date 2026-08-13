import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.logLevel,
  base: {
    application: 'constantinos-hotel',
    environment: env.nodeEnv,
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers.set-cookie',
      'req.body.password',
      'req.body.documentNumber',
      'req.body.email',
      'req.body.phone',
      'req.body.csrfToken',
      'req.query',
      'password',
      '*.password',
      '*.token',
      '*.documentNumber',
      '*.document_number',
      '*.phone',
      '*.email',
    ],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
