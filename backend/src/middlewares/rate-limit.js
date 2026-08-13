import { AppError } from '../utils/app-error.js';
import { env } from '../config/env.js';

export function createRateLimit({ windowMs, max, code = 'RATE_LIMITED' }) {
  const entries = new Map();

  return function rateLimit(request, _response, next) {
    const now = Date.now();
    if (entries.size >= 10_000) {
      for (const [entryKey, entry] of entries) {
        if (entry.resetAt <= now) entries.delete(entryKey);
      }
      if (entries.size >= 10_000) entries.delete(entries.keys().next().value);
    }
    const key = (env.trustProxy ? request.ip : request.socket.remoteAddress) ?? 'unknown';
    const current = entries.get(key);

    if (!current || current.resetAt <= now) {
      entries.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      return next(
        new AppError('Muitas tentativas. Aguarde alguns minutos.', {
          statusCode: 429,
          code,
        }),
      );
    }

    return next();
  };
}
