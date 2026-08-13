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
    SUPABASE_URL: process.env.SUPABASE_URL || 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_local_preview',
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || 'sb_secret_local_preview_only'
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
