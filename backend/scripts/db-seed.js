import { closePool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrations.js';
import { runDevelopmentSeed } from '../src/db/seeds/development.js';

try {
  await runMigrations();
  const result = await runDevelopmentSeed();
  console.log(
    `Seed local concluído: ${result.rooms} quartos, ${result.guests} hóspedes e ${result.reservations} reservas de demonstração.`,
  );
} catch (error) {
  console.error(`Falha no seed (${error.code ?? 'erro'}): ${error.message}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
