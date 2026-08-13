import 'dotenv/config';
import { z } from 'zod';

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  return String(value ?? '').toLowerCase() === 'true';
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.string().url().default('http://localhost:3000'),
  MYSQL_HOST: z.string().min(1),
  MYSQL_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  MYSQL_DATABASE: z.string().regex(/^[a-zA-Z0-9_$-]+$/),
  MYSQL_USER: z.string().min(1),
  MYSQL_PASSWORD: z.string().min(1),
  MYSQL_SSL: booleanFromEnv.default(false),
  MYSQL_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(50).default(10),
  SESSION_SECRET: z.string().min(32),
  SESSION_HOURS: z.coerce.number().int().min(1).max(72).default(8),
  MAX_UPLOAD_BYTES: z.coerce.number().int().min(1024).max(20 * 1024 * 1024).default(10 * 1024 * 1024),
  INITIAL_ADMIN_EMAIL: z.string().email().optional(),
  INITIAL_ADMIN_FULL_NAME: z.string().trim().min(3).max(120).optional(),
  INITIAL_ADMIN_PASSWORD: z.string().min(12).max(128).optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).max(2).default(1)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Configuração de ambiente inválida: ${details}`);
}

export const env = Object.freeze(parsed.data);
