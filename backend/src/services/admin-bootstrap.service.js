import { z } from 'zod';
import { env } from '../config/env.js';
import { withTransaction } from '../db/pool.js';
import { hashPassword } from '../utils/password.js';

const bootstrapSchema = z.object({
  name: z.string().trim().min(3).max(160),
  email: z
    .email()
    .max(254)
    .transform((value) => value.trim().toLowerCase()),
  password: z.string().min(12).max(128),
});

export async function bootstrapFirstAdministrator() {
  if (!env.adminBootstrap.enabled) return { enabled: false, created: false };

  const input = bootstrapSchema.parse(env.adminBootstrap);

  return withTransaction(async (connection) => {
    const [admins] = await connection.execute(
      `SELECT users.id
         FROM users
         JOIN user_roles ON user_roles.user_id = users.id
         JOIN roles ON roles.id = user_roles.role_id
        WHERE roles.code = 'administrador'
          AND users.status = 'active'
          AND users.deleted_at IS NULL
        LIMIT 1
        FOR UPDATE`,
    );

    if (admins[0]) return { enabled: true, created: false };

    const [[role]] = await connection.execute(
      "SELECT id FROM roles WHERE code = 'administrador' LIMIT 1",
    );
    if (!role) {
      throw new Error('A role administrador não existe. Execute as migrations antes do bootstrap.');
    }

    const passwordHash = await hashPassword(input.password);
    await connection.execute(
      `INSERT INTO users (full_name, email, password_hash, status)
       VALUES (?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE
         full_name = VALUES(full_name),
         password_hash = VALUES(password_hash),
         status = 'active',
         deleted_at = NULL`,
      [input.name, input.email, passwordHash],
    );
    const [[user]] = await connection.execute('SELECT id FROM users WHERE email = ?', [
      input.email,
    ]);
    await connection.execute('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [
      user.id,
      role.id,
    ]);

    return { enabled: true, created: true };
  });
}
