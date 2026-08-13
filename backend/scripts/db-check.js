import { env } from '../src/config/env.js';
import { checkDatabase, closePool } from '../src/db/pool.js';

try {
  const result = await checkDatabase();
  console.log(
    JSON.stringify(
      {
        status: 'ok',
        servidor: `${env.db.host}:${env.db.port}`,
        banco: result.databaseName,
        versãoMySQL: result.version,
        horárioUtc: result.utcTime,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(`Falha ao conectar ao MySQL (${error.code ?? 'erro'}).`);
  process.exitCode = 1;
} finally {
  await closePool();
}
