import { closePool } from '../src/db/pool.js';
import { resetDatabase } from '../src/db/migrations.js';

const confirmationArgument = process.argv.find((argument) => argument.startsWith('--confirm='));
const confirmation = confirmationArgument?.slice('--confirm='.length);

try {
  const executed = await resetDatabase(confirmation);
  console.log(`Banco recriado com ${executed.length} migration(s). Execute npm run db:seed.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
