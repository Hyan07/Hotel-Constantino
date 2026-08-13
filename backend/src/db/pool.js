import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

let pool;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: env.db.host,
      port: env.db.port,
      database: env.db.name,
      user: env.db.user,
      password: env.db.password,
      connectionLimit: env.db.connectionLimit,
      waitForConnections: true,
      queueLimit: 0,
      charset: 'utf8mb4',
      timezone: 'Z',
      dateStrings: ['DATE'],
      decimalNumbers: false,
      enableKeepAlive: true,
      ssl: env.db.ssl ? { minVersion: 'TLSv1.2' } : undefined,
    });
  }

  return pool;
}

export async function checkDatabase() {
  const [rows] = await getPool().execute(
    'SELECT VERSION() AS version, UTC_TIMESTAMP(3) AS utcTime, DATABASE() AS databaseName',
  );

  return rows[0];
}

export async function withConnection(work) {
  const connection = await getPool().getConnection();

  try {
    return await work(connection);
  } finally {
    connection.release();
  }
}

export async function withTransaction(
  work,
  { isolationLevel = 'READ COMMITTED', maxAttempts = 3 } = {},
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await withConnection(async (connection) => {
        await connection.query(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
        await connection.beginTransaction();

        try {
          const result = await work(connection);
          await connection.commit();
          return result;
        } catch (error) {
          await connection.rollback();
          throw error;
        }
      });
    } catch (error) {
      const retryable = ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code);
      if (!retryable || attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 25));
    }
  }

  throw new Error('A transação não pôde ser concluída.');
}

export async function closePool() {
  if (!pool) return;
  const activePool = pool;
  pool = undefined;
  await activePool.end();
}
