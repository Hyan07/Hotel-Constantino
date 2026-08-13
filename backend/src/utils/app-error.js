export class AppError extends Error {
  constructor(message, { statusCode = 500, code = 'INTERNAL_SERVER_ERROR', details } = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message, details) {
  return new AppError(message, { statusCode: 400, code: 'BAD_REQUEST', details });
}

export function unauthorized(message = 'Autenticação obrigatória.') {
  return new AppError(message, { statusCode: 401, code: 'UNAUTHORIZED' });
}

export function forbidden(message = 'Você não tem permissão para esta ação.') {
  return new AppError(message, { statusCode: 403, code: 'FORBIDDEN' });
}

export function notFoundError(message = 'Registro não encontrado.') {
  return new AppError(message, { statusCode: 404, code: 'NOT_FOUND' });
}

export function conflict(message, code = 'CONFLICT') {
  return new AppError(message, { statusCode: 409, code });
}

export function unprocessable(message, details) {
  return new AppError(message, { statusCode: 422, code: 'VALIDATION_ERROR', details });
}
