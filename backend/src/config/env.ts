import 'dotenv/config';
import { z } from 'zod';

// Placeholders that show up in .env.example, tutorials, or a lazy first guess.
// None of these should ever reach a production deployment.
const KNOWN_WEAK_SECRETS = new Set([
  'secret',
  'password',
  'change-me',
  'changeme',
  'change-me-access',
  'change-me-refresh',
  'dev-secret',
  'test-secret',
  'dev-access-secret-change-me',
  'dev-refresh-secret-change-me',
]);

const MIN_PRODUCTION_SECRET_LENGTH = 32;

function isWeakSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.length === 0 || KNOWN_WEAK_SECRETS.has(normalized) || normalized.length < MIN_PRODUCTION_SECRET_LENGTH;
}

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    JWT_ACCESS_SECRET: z.string().min(1, 'JWT_ACCESS_SECRET is required'),
    JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET is required'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('30d'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
    // Email (optional). Password-reset mail is sent only when both are set;
    // otherwise the reset endpoint still works but sends nothing (see lib/mailer.ts).
    RESEND_API_KEY: z.string().optional(),
    MAIL_FROM: z.string().optional(),
    // Optional web client origin; when set, reset emails also include a clickable link.
    APP_WEB_URL: z.string().url().optional(),
  })
  .superRefine((data, ctx) => {
    // Weak secrets are a real risk only once this config is what a live
    // service trusts. development and test explicitly allow throwaway
    // values — see backend/.env.example and vitest.config.ts.
    if (data.NODE_ENV !== 'production') {
      return;
    }
    for (const field of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      if (isWeakSecret(data[field])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is missing, too short, or a known placeholder. Production requires a long, random secret — generate one with: openssl rand -base64 48`,
        });
      }
    }
    if (data.JWT_ACCESS_SECRET === data.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must not be identical in production.',
      });
    }
  });

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Zod's fieldErrors carry only field names and messages, never the offending
  // value — safe to log even when the failure is about a weak secret.
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
export type Env = z.infer<typeof EnvSchema>;
