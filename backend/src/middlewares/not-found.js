export function notFound(request, response) {
  response.status(404).json({
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: 'A rota solicitada não foi encontrada.',
      requestId: request.id,
    },
  });
}
