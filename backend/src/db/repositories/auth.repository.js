export async function findUserByEmail(connection, email) {
  const [rows] = await connection.execute(
    `SELECT id, full_name AS fullName, email, password_hash AS passwordHash, status,
            failed_login_attempts AS failedLoginAttempts, locked_until AS lockedUntil
       FROM users
      WHERE email = ? AND deleted_at IS NULL
      LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function getUserAccess(connection, userId) {
  const [users] = await connection.execute(
    `SELECT id, full_name AS fullName, email, status
       FROM users
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1`,
    [userId],
  );
  if (!users[0]) return null;

  const [accessRows] = await connection.execute(
    `SELECT DISTINCT roles.code AS roleCode, permissions.code AS permissionCode
       FROM user_roles
       JOIN roles ON roles.id = user_roles.role_id
       LEFT JOIN role_permissions ON role_permissions.role_id = roles.id
       LEFT JOIN permissions ON permissions.id = role_permissions.permission_id
      WHERE user_roles.user_id = ?`,
    [userId],
  );
  return {
    ...users[0],
    roles: [...new Set(accessRows.map((row) => row.roleCode).filter(Boolean))],
    permissions: [...new Set(accessRows.map((row) => row.permissionCode).filter(Boolean))],
  };
}

export async function registerLoginFailure(connection, userId) {
  if (!userId) return;
  await connection.execute(
    `UPDATE users
        SET failed_login_attempts = failed_login_attempts + 1,
            locked_until = CASE
              WHEN failed_login_attempts + 1 >= 5 THEN UTC_TIMESTAMP(3) + INTERVAL 15 MINUTE
              ELSE locked_until
            END
      WHERE id = ?`,
    [userId],
  );
}

export async function registerLoginSuccess(connection, userId) {
  await connection.execute(
    `UPDATE users
        SET failed_login_attempts = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP(3)
      WHERE id = ?`,
    [userId],
  );
}
