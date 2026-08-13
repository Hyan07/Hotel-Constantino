export async function createSessionRecord(connection, session) {
  await connection.execute(
    `INSERT INTO sessions (id_hash, user_id, csrf_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [session.idHash, session.userId, session.csrfHash, session.expiresAt],
  );
}

export async function findSession(connection, idHash) {
  const [rows] = await connection.execute(
    `SELECT id_hash AS idHash, user_id AS userId, csrf_hash AS csrfHash,
            expires_at AS expiresAt, last_seen_at AS lastSeenAt
       FROM sessions
      WHERE id_hash = ? AND expires_at > UTC_TIMESTAMP(3)
      LIMIT 1`,
    [idHash],
  );
  return rows[0] ?? null;
}

export async function touchSession(connection, idHash) {
  await connection.execute(
    `UPDATE sessions SET last_seen_at = UTC_TIMESTAMP(3)
      WHERE id_hash = ? AND last_seen_at < UTC_TIMESTAMP(3) - INTERVAL 5 MINUTE`,
    [idHash],
  );
}

export async function deleteSession(connection, idHash) {
  if (!idHash) return;
  await connection.execute('DELETE FROM sessions WHERE id_hash = ?', [idHash]);
}
