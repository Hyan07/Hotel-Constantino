import { createApp } from './app.js';
import { env } from './config/env.js';
import { closePool } from './lib/db.js';
import { bootstrapInitialAdminFromEnv } from './services/bootstrap-admin.js';

let server;

async function startApplication() {
  await bootstrapInitialAdminFromEnv();
  const app = createApp();
  server = app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`Constantino's Hotel disponível na porta ${env.PORT}`);
  });
}

function shutdown(signal) {
  console.log(`${signal} recebido. Encerrando com segurança...`);
  if (!server) {
    closePool()
      .catch(() => {})
      .finally(() => process.exit(0));
    return;
  }
  server.close(async () => {
    await closePool().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startApplication().catch(async (error) => {
  console.error('Falha ao iniciar o Constantino\'s Hotel:', error);
  await closePool().catch(() => {});
  process.exit(1);
});