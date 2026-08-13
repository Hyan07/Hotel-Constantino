import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { closePool, query } from '../src/lib/db.js';

const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
const fullName = process.env.INITIAL_ADMIN_FULL_NAME?.trim();
const password = process.env.INITIAL_ADMIN_PASSWORD;

if (!email || !fullName || !password) {
  console.error('Defina INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_FULL_NAME e INITIAL_ADMIN_PASSWORD somente durante esta execução.');
  process.exit(1);
}

const strongPassword = password.length >= 12
  && /[a-z]/.test(password)
  && /[A-Z]/.test(password)
  && /\d/.test(password)
  && /[^a-zA-Z0-9]/.test(password);

if (!strongPassword) {
  console.error('A senha precisa ter 12+ caracteres, maiúscula, minúscula, número e símbolo.');
  process.exit(1);
}

try {
  const passwordHash = await bcrypt.hash(password, 12);
  await query(
    `INSERT INTO users (id, email, password_hash, full_name, role, active)
     VALUES (?, ?, ?, ?, 'admin', 1)`,
    [crypto.randomUUID(), email, passwordHash, fullName]
  );
  console.log(`Administrador criado com sucesso: ${email}.`);
  console.log('A senha não foi gravada nem exibida. Remova as variáveis temporárias do ambiente.');
} catch (error) {
  if (error.code === 'ER_DUP_ENTRY') console.error('Já existe um usuário com este e-mail.');
  else console.error(`Não foi possível criar o administrador: ${error.message}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
