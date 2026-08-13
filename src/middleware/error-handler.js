import { HttpError } from '../utils/http-error.js';

export function notFoundHandler(_request, _response, next) {
  next(new HttpError(404, 'Rota não encontrada.', 'ROUTE_NOT_FOUND'));
}

export function errorHandler(error, request, response, _next) {
  const status = Number(error.status) || 500;
  const known = error instanceof HttpError || status < 500;

  if (!known) {
    console.error(`[${request.method} ${request.originalUrl}]`, error);
  }

  response.status(status).json({
    ok: false,
    error: {
      code: error.code ?? 'INTERNAL_ERROR',
      message: known ? error.message : 'Não foi possível concluir a operação.',
      ...(known && error.details ? { details: error.details } : {})
    }
  });
}
