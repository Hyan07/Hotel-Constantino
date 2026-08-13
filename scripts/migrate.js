import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationFile = path.join(projectRoot, 'database/mysql/001_install.sql');
const sql = await fs.readFile(migrationFile, 'utf8');

const connection = await mysql.createConnection({
  host: env.MYSQL_HOST,
  port: env.MYSQL_PORT,
  database: env.MYSQL_DATABASE,
  user: env.MYSQL_USER,
  password: env.MYSQL_PASSWORD,
  ssl: env.MYSQL_SSL ? { rejectUnauthorized: true } : undefined,
  multipleStatements: true,
  timezone: 'Z'
});

try {
  await connection.query(sql);
  console.log(`MySQL preparado com sucesso em ${env.MYSQL_HOST}/${env.MYSQL_DATABASE}.`);
} finally {
  await connection.end();
}
