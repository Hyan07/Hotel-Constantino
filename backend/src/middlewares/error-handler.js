import { env } from '../config/env.js';

export function errorHandler(error, request, response, _next) {
  const candidateStatus = error.statusCode ?? error.status;
  const statusCode =
    Number.isInteger(candidateStatus) && candidateStatus >= 400 && candidateStatus <= 599
      ? candidateStatus
      : 500;
  const isServerError = statusCode >= 500;
  const isInvalidJson = error.type === 'entity.parse.failed';

  request.log[isServerError ? 'error' : 'warn'](
    {
      errorName: error.name,
      errorCode: error.code,
      statusCode,
      ...(env.isDevelopment && isServerError ? { stack: error.stack } : {}),
    },
    isServerError ? 'Erro não tratado durante a requisição' : 'Requisição rejeitada',
  );

  response.status(statusCode).json({
    error: {
      code: isInvalidJson ? 'INVALID_JSON' : (error.code ?? 'INTERNAL_SERVER_ERROR'),
      message: isInvalidJson
        ? 'O corpo JSON da requisição é inválido.'
        : isServerError && env.isProduction
          ? 'Ocorreu um erro interno. Tente novamente.'
          : error.message,
      requestId: request.id,
      ...(!isServerError && error.details ? { details: error.details } : {}),
      ...(env.isDevelopment && isServerError ? { stack: error.stack } : {}),
    },
  });
}
