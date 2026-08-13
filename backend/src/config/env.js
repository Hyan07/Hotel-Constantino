import 'dotenv/config';
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const knownExampleSecrets = new Set([
  'troque_esta_senha_local',
  'change-me',
  'changeme',
  'example',
  'secret',
]);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_URL: z.string().url().default('http://localhost:5173'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    TRUST_PROXY: booleanFromString,
    DB_HOST: z.string().trim().min(1).default('127.0.0.1'),
    DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
    DB_NAME: z
      .string()
      .regex(/^[a-zA-Z0-9_]+$/)
      .default('constantinos_hotel_dev'),
    DB_USER: z.string().trim().min(1).default('constantinos_dev'),
    DB_PASSWORD: z.string().default(''),
    DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(50).default(10),
    DB_SSL: booleanFromString,
    SESSION_SECRET: z.string().default(''),
    SESSION_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9._-]+$/)
      .default('constantinos.sid'),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(8),
    DEV_AUTH_BYPASS: booleanFromString,
    ADMIN_BOOTSTRAP_ENABLED: booleanFromString,
    BOOTSTRAP_ADMIN_NAME: z.string().trim().default(''),
    BOOTSTRAP_ADMIN_EMAIL: z.string().trim().default(''),
    BOOTSTRAP_ADMIN_PASSWORD: z.string().default(''),
  })
  .superRefine((values, context) => {
    if (values.DB_USER.toLowerCase() === 'root') {
      context.addIssue({
        code: 'custom',
        path: ['DB_USER'],
        message: 'a aplicação não pode usar a conta root do MySQL',
      });
    }

    if (values.ADMIN_BOOTSTRAP_ENABLED) {
      const bootstrapFields = [
        ['BOOTSTRAP_ADMIN_NAME', values.BOOTSTRAP_ADMIN_NAME, 3],
        ['BOOTSTRAP_ADMIN_PASSWORD', values.BOOTSTRAP_ADMIN_PASSWORD, 12],
      ];

      for (const [key, value, minimum] of bootstrapFields) {
        if (value.length < minimum || knownExampleSecrets.has(value.toLowerCase())) {
          context.addIssue({
            code: 'custom',
            path: [key],
            message: `deve ter pelo menos ${minimum} caracteres e não pode usar valor de exemplo`,
          });
        }
      }

      if (!z.email().safeParse(values.BOOTSTRAP_ADMIN_EMAIL).success) {
        context.addIssue({
          code: 'custom',
          path: ['BOOTSTRAP_ADMIN_EMAIL'],
          message: 'deve ser um e-mail válido',
        });
      }
    }

    if (values.NODE_ENV !== 'production') return;

    if (values.DEV_AUTH_BYPASS) {
      context.addIssue({
        code: 'custom',
        path: ['DEV_AUTH_BYPASS'],
        message: 'não pode ser ativado em produção',
      });
    }

    if (!values.APP_URL.startsWith('https://')) {
      context.addIssue({
        code: 'custom',
        path: ['APP_URL'],
        message: 'deve usar HTTPS em produção',
      });
    }

    for (const [key, value, minimum] of [
      ['DB_PASSWORD', values.DB_PASSWORD, 12],
      ['SESSION_SECRET', values.SESSION_SECRET, 32],
    ]) {
      if (value.length < minimum || knownExampleSecrets.has(value.toLowerCase())) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `deve ser um segredo exclusivo com pelo menos ${minimum} caracteres`,
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');

  throw new Error(`Configuração de ambiente inválida: ${details}`);
}

export const env = Object.freeze({
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  appUrl: parsed.data.APP_URL,
  logLevel: parsed.data.LOG_LEVEL,
  trustProxy: parsed.data.TRUST_PROXY,
  db: Object.freeze({
    host: parsed.data.DB_HOST,
    port: parsed.data.DB_PORT,
    name: parsed.data.DB_NAME,
    user: parsed.data.DB_USER,
    password: parsed.data.DB_PASSWORD,
    connectionLimit: parsed.data.DB_CONNECTION_LIMIT,
    ssl: parsed.data.DB_SSL,
  }),
  sessionSecret: parsed.data.SESSION_SECRET,
  sessionCookieName: parsed.data.SESSION_COOKIE_NAME,
  sessionTtlHours: parsed.data.SESSION_TTL_HOURS,
  devAuthBypass: parsed.data.DEV_AUTH_BYPASS,
  adminBootstrap: Object.freeze({
    enabled: parsed.data.ADMIN_BOOTSTRAP_ENABLED,
    name: parsed.data.BOOTSTRAP_ADMIN_NAME,
    email: parsed.data.BOOTSTRAP_ADMIN_EMAIL,
    password: parsed.data.BOOTSTRAP_ADMIN_PASSWORD,
  }),
  isDevelopment: parsed.data.NODE_ENV === 'development',
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
});
