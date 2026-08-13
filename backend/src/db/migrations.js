import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
import { getPool, withConnection } from './pool.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.join(currentDirectory, 'migrations');
const migrationFilePattern = /^\d{3,}_[a-z0-9_-]+\.sql$/;

function checksum(content) {
  return createHash('sha256').update(content).digest('hex');
}

function splitStatements(content) {
  return content
    .split(/;\s*(?:\r?\n|$)/u)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function loadMigrations() {
  const fileNames = (await readdir(migrationsDirectory))
    .filter((fileName) => migrationFilePattern.test(fileName))
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    fileNames.map(async (fileName) => {
      const content = await readFile(path.join(migrationsDirectory, fileName), 'utf8');
      return { fileName, content, checksum: checksum(content) };
    }),
  );
}

async function migrationTableExists(connection) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS tableCount
       FROM information_schema.tables
      WHERE table_schema = ? AND table_name = 'schema_migrations'`,
    [env.db.name],
  );
  return Number(rows[0].tableCount) === 1;
}

async function ensureMigrationTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) NOT NULL PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
}

async function appliedMigrations(connection) {
  if (!(await migrationTableExists(connection))) return new Map();
  const [rows] = await connection.execute(
    'SELECT version, checksum, applied_at AS appliedAt FROM schema_migrations ORDER BY version',
  );
  return new Map(rows.map((row) => [row.version, row]));
}

export async function getMigrationStatus() {
  const migrations = await loadMigrations();

  return withConnection(async (connection) => {
    const applied = await appliedMigrations(connection);
    return migrations.map((migration) => {
      const record = applied.get(migration.fileName);
      return {
        version: migration.fileName,
        status: record ? 'applied' : 'pending',
        checksumValid: record ? record.checksum === migration.checksum : null,
        appliedAt: record?.appliedAt ?? null,
      };
    });
  });
}

export async function runMigrations() {
  const migrations = await loadMigrations();
  const lockName = `constantinos-hotel:migrations:${env.db.name}`;

  return withConnection(async (connection) => {
    const [lockRows] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', [lockName]);
    if (Number(lockRows[0].acquired) !== 1) {
      throw new Error('Não foi possível obter o lock exclusivo das migrations.');
    }

    try {
      await ensureMigrationTable(connection);
      const applied = await appliedMigrations(connection);
      const executed = [];

      for (const migration of migrations) {
        const record = applied.get(migration.fileName);
        if (record) {
          if (record.checksum !== migration.checksum) {
            throw new Error(`Migration aplicada foi alterada: ${migration.fileName}`);
          }
          continue;
        }

        for (const statement of splitStatements(migration.content)) {
          await connection.query(statement);
        }
        await connection.execute(
          'INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)',
          [migration.fileName, migration.checksum],
        );
        executed.push(migration.fileName);
      }

      return executed;
    } finally {
      await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]);
    }
  });
}

export async function resetDatabase(confirmation) {
  if (env.isProduction) {
    throw new Error('db:reset é proibido em produção.');
  }
  if (confirmation !== env.db.name) {
    throw new Error(`Confirmação inválida. Use --confirm=${env.db.name}.`);
  }

  await withConnection(async (connection) => {
    const [rows] = await connection.execute(
      'SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = ?',
      [env.db.name],
    );
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    try {
      for (const { tableName } of rows) {
        const safeName = String(tableName).replaceAll('`', '``');
        await connection.query(`DROP TABLE IF EXISTS \`${safeName}\``);
      }
    } finally {
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    }
  });

  return runMigrations();
}

export async function listTables() {
  const [rows] = await getPool().execute(
    `SELECT table_name AS tableName
       FROM information_schema.tables
      WHERE table_schema = ?
      ORDER BY table_name`,
    [env.db.name],
  );
  return rows.map((row) => row.tableName);
}
