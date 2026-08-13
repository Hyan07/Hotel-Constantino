import { closePool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrations.js';

try {
  const executed = await runMigrations();
  console.log(
    executed.length > 0
      ? `Migrations aplicadas: ${executed.join(', ')}`
      : 'Banco atualizado; nenhuma migration pendente.',
  );
} catch (error) {
  console.error(`Falha nas migrations (${error.code ?? 'erro'}): ${error.message}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
