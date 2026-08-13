import { unprocessable } from '../utils/app-error.js';

export function validate(schema, source = 'body') {
  return (request, _response, next) => {
    const result = schema.safeParse(request[source]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return next(unprocessable('Revise os campos informados.', details));
    }
    request.validated = {
      ...(request.validated ?? {}),
      [source]: result.data,
    };
    if (source !== 'query') request[source] = result.data;
    return next();
  };
}
