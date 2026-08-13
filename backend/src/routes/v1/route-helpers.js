export function actorFrom(request) {
  return { userId: request.auth.user.id, requestId: request.id };
}

export function sendIdempotent(response, result, createdStatus = 201) {
  response.setHeader('Idempotency-Replayed', result.replay ? 'true' : 'false');
  return response.status(result.replay ? 200 : createdStatus).json({ data: result.data });
}
