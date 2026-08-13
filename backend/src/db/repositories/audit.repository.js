const allowedContextKeys = new Set([
  'reason',
  'fromStatus',
  'toStatus',
  'roomId',
  'reservationId',
  'stayId',
  'roleCodes',
  'failureType',
]);

function sanitizeContext(context = {}) {
  return Object.fromEntries(
    Object.entries(context).filter(([key, value]) => allowedContextKeys.has(key) && value != null),
  );
}

export async function writeAudit(
  connection,
  { actorUserId = null, action, entityType, entityId = null, requestId = null, context },
) {
  await connection.execute(
    `INSERT INTO audit_logs
      (actor_user_id, action, entity_type, entity_id, request_id, context)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      actorUserId,
      action,
      entityType,
      entityId == null ? null : String(entityId),
      requestId,
      context ? JSON.stringify(sanitizeContext(context)) : null,
    ],
  );
}
