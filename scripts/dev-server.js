import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const forwarded = process.argv.slice(2).filter((argument) => argument !== '--');
const viteBinary = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');

const api = spawn(process.execPath, ['--watch', 'src/server.js'], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.API_PORT || '3000',
    APP_URL: process.env.APP_URL || 'http://localhost:4173',
    MYSQL_HOST: process.env.MYSQL_HOST || '127.0.0.1',
    MYSQL_PORT: process.env.MYSQL_PORT || '3306',
    MYSQL_DATABASE: process.env.MYSQL_DATABASE || 'constantinos_hotel',
    MYSQL_USER: process.env.MYSQL_USER || 'root',
    MYSQL_PASSWORD: process.env.MYSQL_PASSWORD || 'local-development-password',
    SESSION_SECRET: process.env.SESSION_SECRET || 'local-development-session-secret-change-me-123456'
  },
  stdio: 'inherit'
});

const vite = spawn(viteBinary, forwarded, {
  cwd: root,
  env: process.env,
  stdio: 'inherit'
});

function shutdown(code = 0) {
  if (!api.killed) api.kill('SIGTERM');
  if (!vite.killed) vite.kill('SIGTERM');
  setTimeout(() => process.exit(code), 100).unref();
}

api.on('exit', (code) => { if (code && code !== 0) shutdown(code); });
vite.on('exit', (code) => shutdown(code ?? 0));
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
