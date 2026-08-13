import { HttpError } from '../utils/http-error.js';
import { ZodError } from 'zod';

export function notFoundHandler(_request, _response, next) {
  next(new HttpError(404, 'Rota não encontrada.', 'ROUTE_NOT_FOUND'));
}

export function errorHandler(error, request, response, _next) {
  let normalized = error;
  if (error instanceof ZodError) {
    normalized = new HttpError(400, 'Revise os dados informados.', 'VALIDATION_ERROR', error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })));
  } else if (error?.code === 'LIMIT_FILE_SIZE') {
    normalized = new HttpError(413, 'O arquivo excede o limite permitido.', 'FILE_TOO_LARGE');
  } else if (['ER_NO_SUCH_TABLE', 'ER_BAD_DB_ERROR', 'ECONNREFUSED', 'ENOTFOUND'].includes(error?.code)) {
    normalized = new HttpError(503, 'O banco MySQL não está disponível ou ainda não foi instalado.', 'DATABASE_UNAVAILABLE');
  } else if (error?.code === 'ER_DUP_ENTRY') {
    normalized = new HttpError(409, 'Já existe um registro com estes dados.', 'DUPLICATE_RECORD');
  } else if (error?.code === 'ER_NO_REFERENCED_ROW_2') {
    normalized = new HttpError(400, 'Uma referência informada não existe.', 'INVALID_REFERENCE');
  } else if (['ER_DATA_TOO_LONG', 'WARN_DATA_TRUNCATED', 'ER_TRUNCATED_WRONG_VALUE'].includes(error?.code)) {
    normalized = new HttpError(400, 'Um dos dados informados é inválido ou excede o limite permitido.', 'INVALID_DATABASE_VALUE');
  } else if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error?.code)) {
    normalized = new HttpError(409, 'A operação concorreu com outra alteração. Tente novamente.', 'CONCURRENT_UPDATE');
  }
  const status = Number(normalized.status) || 500;
  const known = normalized instanceof HttpError || status < 500;

  if (!known) {
    console.error(`[${request.method} ${request.originalUrl}]`, error);
  }

  response.status(status).json({
    ok: false,
    error: {
      code: normalized.code ?? 'INTERNAL_ERROR',
      message: known ? normalized.message : 'Não foi possível concluir a operação.',
      ...(known && normalized.details ? { details: normalized.details } : {})
    }
  });
}
