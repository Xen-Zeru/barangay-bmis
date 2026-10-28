import dotenv from 'dotenv';
import { z } from 'zod';

const nodeEnv = process.env.NODE_ENV ?? 'development';

dotenv.config({
  path: nodeEnv === 'test' ? '.env.test' : '.env',
  quiet: true,
});

const booleanString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required.'),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters.'),
  SESSION_COOKIE_NAME: z.string().min(1).max(64).default('bmis.sid'),
  SESSION_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(480),
  COOKIE_SECURE: booleanString.default(false),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  TRUST_PROXY: booleanString.default(false),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  RATE_LIMIT_DISABLED: booleanString.default(false),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const data = parsed.data;

if (data.NODE_ENV === 'production') {
  if (data.SESSION_SECRET.includes('test-only') || data.SESSION_SECRET.includes('replace-with')) {
    throw new Error('SESSION_SECRET still contains a placeholder value.');
  }
  if (data.RATE_LIMIT_DISABLED) {
    throw new Error('RATE_LIMIT_DISABLED must be false in production.');
  }
}

export const env = {
  ...data,
  isProduction: data.NODE_ENV === 'production',
  isTest: data.NODE_ENV === 'test',
  sessionTtlMs: data.SESSION_TTL_MINUTES * 60_000,
  allowedOrigins: data.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
  secureCookies: data.NODE_ENV === 'production' ? true : data.COOKIE_SECURE,
} as const;
