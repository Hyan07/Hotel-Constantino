import { closePool } from '../src/db/pool.js';
import { getMigrationStatus, listTables } from '../src/db/migrations.js';

try {
  const migrations = await getMigrationStatus();
  const tables = await listTables();
  console.log(JSON.stringify({ migrations, totalTabelas: tables.length }, null, 2));
  if (migrations.some((migration) => migration.checksumValid === false)) process.exitCode = 1;
} catch (error) {
  console.error(`Não foi possível consultar o banco (${error.code ?? 'erro'}).`);
  process.exitCode = 1;
} finally {
  await closePool();
}
