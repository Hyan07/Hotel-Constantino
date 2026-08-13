import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();
const server = app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`Constantino's Hotel disponível na porta ${env.PORT}`);
});

function shutdown(signal) {
  console.log(`${signal} recebido. Encerrando com segurança...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
