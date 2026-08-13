import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.string().url().default('http://localhost:3000'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(10),
  SUPABASE_SECRET_KEY: z.string().min(10),
  STORAGE_GUEST_DOCUMENTS_BUCKET: z.string().min(1).default('guest-documents'),
  STORAGE_RECEIPTS_BUCKET: z.string().min(1).default('receipts'),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
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
