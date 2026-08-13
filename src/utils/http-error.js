export class HttpError extends Error {
  constructor(status, message, code = 'REQUEST_FAILED', details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function assertFound(value, message = 'Registro não encontrado.') {
  if (!value) throw new HttpError(404, message, 'NOT_FOUND');
  return value;
}
