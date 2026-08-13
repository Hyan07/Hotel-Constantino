import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { query, withTransaction } from '../lib/db.js';

function isStrongPassword(password) {
  return password.length >= 12
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^a-zA-Z0-9]/.test(password);
}

export async function bootstrapInitialAdminFromEnv() {
  const values = [env.INITIAL_ADMIN_EMAIL, env.INITIAL_ADMIN_FULL_NAME, env.INITIAL_ADMIN_PASSWORD];
  if (values.every((value) => !value)) return false;
  if (values.some((value) => !value)) {
    throw new Error('Defina as três variáveis INITIAL_ADMIN_* ou remova todas elas.');
  }
  if (!isStrongPassword(env.INITIAL_ADMIN_PASSWORD)) {
    throw new Error('INITIAL_ADMIN_PASSWORD precisa ter 12+ caracteres, maiúscula, minúscula, número e símbolo.');
  }

  const email = env.INITIAL_ADMIN_EMAIL.trim().toLowerCase();
  const [existing] = await query('SELECT id, email FROM users ORDER BY created_at LIMIT 1');
  if (existing) {
    if (existing.email === email) return false;
    throw new Error('O banco já possui usuários. Remova as variáveis INITIAL_ADMIN_* e administre acessos pelo sistema.');
  }

  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(env.INITIAL_ADMIN_PASSWORD, 12);
  await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO users (id, email, password_hash, full_name, role, active)
       VALUES (?, ?, ?, ?, 'admin', 1)`,
      [id, email, passwordHash, env.INITIAL_ADMIN_FULL_NAME.trim()]
    );
    await connection.execute(
      `INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values)
       VALUES (?, 'BOOTSTRAP_ADMIN', 'users', ?, ?)`,
      [id, id, JSON.stringify({ email, full_name: env.INITIAL_ADMIN_FULL_NAME.trim(), role: 'admin', active: true })]
    );
  });
  console.log(`Administrador inicial criado: ${email}. Remova agora as variáveis INITIAL_ADMIN_*.`);
  return true;
}
