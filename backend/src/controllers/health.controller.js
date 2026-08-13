import { env } from '../config/env.js';
import { checkDatabase } from '../db/pool.js';

function livePayload() {
  return {
    service: 'constantinos-hotel-api',
    status: 'ok',
    environment: env.nodeEnv,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  };
}

export function getHealth(_request, response) {
  response.status(200).json({ data: livePayload() });
}

export function getLive(_request, response) {
  response.status(200).json({ data: livePayload() });
}

export async function getReady(request, response) {
  try {
    await checkDatabase();
    response.status(200).json({
      data: {
        service: 'constantinos-hotel-api',
        status: 'ready',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    request.log.warn({ errorCode: error.code }, 'Dependência indisponível no readiness');
    response.status(503).json({
      error: {
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'O serviço ainda não está pronto.',
        requestId: request.id,
      },
    });
  }
}
