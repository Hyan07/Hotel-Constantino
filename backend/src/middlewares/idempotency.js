import { AppError } from '../utils/app-error.js';

export function requireIdempotencyKey(request, _response, next) {
  const key = request.headers['idempotency-key'];
  if (typeof key !== 'string' || key.length < 12 || key.length > 120) {
    return next(
      new AppError('Envie uma chave Idempotency-Key válida.', {
        statusCode: 422,
        code: 'IDEMPOTENCY_KEY_REQUIRED',
      }),
    );
  }
  request.idempotencyKey = key;
  return next();
}
