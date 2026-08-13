import { env } from '../src/config/env.js';
import { closePool } from '../src/db/pool.js';
import { bootstrapFirstAdministrator } from '../src/services/admin-bootstrap.service.js';

try {
  if (!env.adminBootstrap.enabled) {
    throw new Error('Defina ADMIN_BOOTSTRAP_ENABLED=true apenas durante esta operação.');
  }

  const result = await bootstrapFirstAdministrator();
  console.log(
    result.created
      ? 'Primeiro administrador criado. Remova imediatamente as variáveis BOOTSTRAP_ADMIN_* e desative ADMIN_BOOTSTRAP_ENABLED.'
      : 'Já existe um administrador ativo; o bootstrap permaneceu inerte. Remova as variáveis temporárias.',
  );
} catch (error) {
  console.error(`Não foi possível criar o administrador: ${error.message}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
