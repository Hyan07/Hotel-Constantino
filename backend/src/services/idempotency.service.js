import { AppError } from '../utils/app-error.js';
import { hashValue } from '../utils/tokens.js';

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function beginIdempotentOperation(connection, { key, scope, userId, payload }) {
  const keyHash = hashValue(key);
  const requestHash = hashValue(stableJson(payload));
  const [insertResult] = await connection.execute(
    `INSERT IGNORE INTO idempotency_keys
      (key_hash, scope, user_id, request_hash, expires_at)
     VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3) + INTERVAL 24 HOUR)`,
    [keyHash, scope, userId, requestHash],
  );
  if (insertResult.affectedRows === 1) return { replay: false, keyHash };

  const [rows] = await connection.execute(
    `SELECT request_hash AS requestHash, response_status AS responseStatus,
            response_body AS responseBody, completed_at AS completedAt
       FROM idempotency_keys
      WHERE key_hash = ? AND scope = ? AND user_id = ?
      FOR UPDATE`,
    [keyHash, scope, userId],
  );
  const existing = rows[0];
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new AppError('A chave de idempotência já foi usada com outros dados.', {
        statusCode: 409,
        code: 'IDEMPOTENCY_CONFLICT',
      });
    }
    if (existing.completedAt) {
      return {
        replay: true,
        status: Number(existing.responseStatus),
        body:
          typeof existing.responseBody === 'string'
            ? JSON.parse(existing.responseBody)
            : existing.responseBody,
      };
    }
    throw new AppError('Uma operação com esta chave ainda está em andamento.', {
      statusCode: 409,
      code: 'IDEMPOTENCY_IN_PROGRESS',
    });
  }

  throw new AppError('Não foi possível iniciar a operação idempotente.', {
    statusCode: 409,
    code: 'IDEMPOTENCY_CONFLICT',
  });
}

export async function completeIdempotentOperation(
  connection,
  { keyHash, scope, userId, status, body },
) {
  await connection.execute(
    `UPDATE idempotency_keys
        SET response_status = ?, response_body = ?, completed_at = UTC_TIMESTAMP(3)
      WHERE key_hash = ? AND scope = ? AND user_id = ?`,
    [status, JSON.stringify(body), keyHash, scope, userId],
  );
}
