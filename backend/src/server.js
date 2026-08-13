import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { closePool } from './db/pool.js';
import { bootstrapFirstAdministrator } from './services/admin-bootstrap.service.js';

let server;
let isShuttingDown = false;

function safeError(error) {
  return {
    errorName: error?.name,
    errorCode: error?.code,
    ...(env.isDevelopment ? { stack: error?.stack } : {}),
  };
}

async function start() {
  const bootstrap = await bootstrapFirstAdministrator();
  if (bootstrap.created) {
    logger.warn(
      'Primeiro administrador criado pelo bootstrap. Remova imediatamente as variáveis BOOTSTRAP_ADMIN_* e desative ADMIN_BOOTSTRAP_ENABLED.',
    );
  } else if (bootstrap.enabled) {
    logger.warn(
      'Bootstrap administrativo ignorado porque já existe administrador ativo. Remova as variáveis temporárias.',
    );
  }

  const app = createApp();
  server = app.listen(env.port, () => {
    logger.info(
      {
        port: env.port,
        url: env.appUrl,
      },
      "Constantino's Hotel iniciado",
    );
  });
}

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, 'Encerrando servidor com segurança');

  if (!server) {
    await closePool().catch((error) => logger.error(safeError(error), 'Falha ao encerrar o pool'));
    process.exit(1);
  }

  const forceShutdownTimer = setTimeout(() => {
    logger.fatal('Tempo limite de desligamento excedido');
    process.exit(1);
  }, 10_000);
  forceShutdownTimer.unref();

  server.close(async (error) => {
    clearTimeout(forceShutdownTimer);

    if (error) {
      logger.error(safeError(error), 'Falha ao encerrar o servidor');
      process.exit(1);
    }

    try {
      await closePool();
      logger.info('Servidor e pool MySQL encerrados');
      process.exit(0);
    } catch (poolError) {
      logger.error(safeError(poolError), 'Falha ao encerrar o pool MySQL');
      process.exit(1);
    }
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.fatal(safeError(reason), 'Promise rejeitada sem tratamento');
  void shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal(safeError(error), 'Exceção não capturada');
  void shutdown('uncaughtException');
});

try {
  await start();
} catch (error) {
  logger.fatal(safeError(error), 'Falha ao iniciar o servidor');
  await shutdown('startupFailure');
}
