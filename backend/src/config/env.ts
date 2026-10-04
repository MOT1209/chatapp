import 'dotenv/config';
import { z } from 'zod';
import { loadSecretFiles } from './secrets.js';

// Fold `NAME_FILE` mounted secrets into `NAME` before anything reads process.env,
// so the Zod schema below only ever deals with one uniform set of variables.
loadSecretFiles();

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

/** `true`/`1`/`yes`/`on`, case-insensitive. Anything else is `false`. */
function envFlag(value: string): boolean {
  return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
}

/**
 * True for a database that provably lives on this machine.
 *
 * Only used to decide whether `NODE_ENV=test` is acceptable. Deliberately
 * permissive about the parts that do not matter (scheme, port, query string) and
 * strict about the host, because the host is what tells us whether a mistake can
 * reach a real deployment. An unparseable URL is treated as non-loopback so that
 * a typo fails closed rather than open.
 */
function isLoopbackDatabaseUrl(databaseUrl: string): boolean {
  try {
    const { hostname } = new URL(databaseUrl);
    const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0';
  } catch {
    return false;
  }
}

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    /**
     * How many reverse proxies sit in front of the app. Express derives `req.ip`
     * from this, and every per-IP rate limiter keys on `req.ip`, so a wrong value
     * is not cosmetic: too high and a client can spoof its own address in
     * `X-Forwarded-For` and walk straight past the auth limiters; too low and every
     * user shares the proxy's address, so one abusive client locks out everyone
     * behind it. `1` is correct for the single-proxy deployments this app targets;
     * set `0` for a directly exposed server.
     */
    TRUST_PROXY: z
      .string()
      .regex(/^\d+$/, 'TRUST_PROXY must be a non-negative integer (the number of proxy hops).')
      .default('1'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    JWT_ACCESS_SECRET: z.string().min(1, 'JWT_ACCESS_SECRET is required'),
    JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET is required'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('30d'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),

    /**
     * Public origin of this service, used only to build the password-reset link in
     * the outgoing email. No trailing slash — it is concatenated with `/reset-password`.
     */
    APP_BASE_URL: z.string().default('http://localhost:4000'),

    // --- Refresh-token cookie (P0: web clients must not hold the refresh token in JS) ---
    /** `Secure` is forced on in production; this flag only exists to pin it off in dev. */
    COOKIE_SECURE: z.string().optional(),
    /** `lax` sends the cookie on top-level navigations, which web clients need after a redirect. */
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    /** Scoped to the auth routes: the refresh cookie is never sent to /users or /conversations. */
    COOKIE_PATH: z.string().default('/api/auth'),

    // --- Outbound email (P0: password reset must actually reach the user) ---
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    /** Implicit TLS (port 465). Most providers use STARTTLS on 587 with `SMTP_SECURE=false`. */
    SMTP_SECURE: z.string().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    /** Envelope sender (`MAIL FROM`). Must be a mailbox your provider is allowed to use. */
    SMTP_FROM: z.string().optional(),
    SMTP_FROM_NAME: z.string().default('ChatApp'),

    // --- Password reset policy ---
    /**
     * Default 300s: the cooldown is the only thing limiting how often one mailbox can
     * be hit. A short window still allows an attacker a steady stream of mail, which is
     * both a spam problem for the user and a way to get the sending domain throttled.
     */
    PASSWORD_RESET_COOLDOWN_SECONDS: z.coerce.number().int().min(0).max(3600).default(300),
    PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(60),

    // --- Maintenance job (`npm run cleanup`, see src/scripts/cleanup.ts) ---
    /**
     * Rows deleted per statement. Bounded so a large backlog cannot turn into one
     * huge DELETE that pins locks and bloats the WAL; a bigger backlog is drained
     * across consecutive batches instead.
     */
    CLEANUP_BATCH_SIZE: z.coerce.number().int().min(1).max(10_000).default(500),
    /**
     * How long *revoked* sessions are kept before deletion. Sessions that are
     * already past `expiresAt` are always deleted regardless. The window exists so
     * a session can still be investigated after an incident.
     */
    SESSION_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
    /** How long *used* password-reset tokens are kept. Expired ones always go. */
    RESET_TOKEN_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  })
  .superRefine((data, ctx) => {
    const issue = (field: string, message: string): void => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
    };

    // Weak secrets are a real risk only once this config is what a live service
    // trusts. development and test explicitly allow throwaway values — see
    // backend/.env.example and vitest.config.ts.
    //
    // NODE_ENV=test silently switches off every rate limiter (see
    // middleware/rate-limit.ts) and relaxes the secret checks below. The test suite
    // needs that, but a deployment that inherited it would ship the API with no auth
    // throttling at all. A non-loopback database is the reliable signal that this is
    // not a developer's own machine, so refuse that combination outright.
    if (data.NODE_ENV === 'test' && !isLoopbackDatabaseUrl(data.DATABASE_URL)) {
      issue(
        'NODE_ENV',
        'NODE_ENV=test disables every rate limiter and weakens the secret checks, so it is only safe against a local database. Refusing to start with NODE_ENV=test and a non-loopback DATABASE_URL.',
      );
    }

    if (data.NODE_ENV !== 'production') {
      // A half-configured credential pair is still wrong everywhere: the provider
      // rejects the handshake and every reset email bounces. But the *presence* of
      // SMTP is only mandatory in production, so that local development and tests
      // can run without a mail provider.
      if (Boolean(data.SMTP_USER) !== Boolean(data.SMTP_PASS)) {
        issue('SMTP_PASS', 'SMTP_USER and SMTP_PASS must be set together, or neither.');
      }
      return;
    }

    const smtpFields = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM'] as const;
    const missingSmtp = smtpFields.filter((f) => !data[f]);
    const firstMissing = missingSmtp[0];
    if (firstMissing !== undefined) {
      issue(
        firstMissing,
        `${missingSmtp.join(', ')} must be set. Without a real transport a password reset email can never be delivered, so production refuses to boot. Provide the values as literals or as ${firstMissing}_FILE paths (see backend/README.md â†’ Secrets).`,
      );
    }
    if (Boolean(data.SMTP_USER) !== Boolean(data.SMTP_PASS)) {
      issue('SMTP_PASS', 'SMTP_USER and SMTP_PASS must be set together, or neither.');
    }

    for (const field of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      if (isWeakSecret(data[field])) {
        issue(
          field,
          `${field} is missing, too short, or a known placeholder. Production requires a long, random secret — generate one with: openssl rand -base64 48`,
        );
      }
    }
    if (data.JWT_ACCESS_SECRET === data.JWT_REFRESH_SECRET) {
      issue('JWT_REFRESH_SECRET', 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must not be identical in production.');
    }

    if (!data.APP_BASE_URL.startsWith('https://')) {
      issue(
        'APP_BASE_URL',
        'APP_BASE_URL must be an https:// URL in production: it is mailed to users inside the password-reset link.',
      );
    }

    // A wildcard origin plus credentialed requests is the textbook way to hand a
    // cookie-authenticated API to any site on the internet.
    if (data.CORS_ORIGIN.includes('*')) {
      issue('CORS_ORIGIN', 'CORS_ORIGIN must list explicit origins in production; "*" is not allowed.');
    }

    if (data.COOKIE_SAME_SITE === 'none' && !envFlag(data.COOKIE_SECURE ?? '')) {
      issue('COOKIE_SECURE', 'COOKIE_SAME_SITE=none requires COOKIE_SECURE=true.');
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

/** Resolved cookie policy. `Secure` is unconditionally on in production. */
export const cookieOptions = {
  secure: env.NODE_ENV === 'production' || envFlag(env.COOKIE_SECURE ?? ''),
  sameSite: env.COOKIE_SAME_SITE,
  path: env.COOKIE_PATH,
  // The refresh token must never be readable from script — that is the entire
  // point of moving it out of JS reach (contract §3.1.1).
  httpOnly: true,
} as const;

/** Whether a usable outbound mail transport is configured. */
export const smtpConfigured = Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_FROM);

/** Express `trust proxy` setting, as the numeric hop count it is validated to be. */
export const trustProxy = Number(env.TRUST_PROXY);

export { envFlag };
