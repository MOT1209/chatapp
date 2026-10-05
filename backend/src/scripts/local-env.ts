import { randomBytes } from 'node:crypto';

// Builds the `.env` that `start-server.bat` writes for a first-time local setup.
//
// Pure on purpose (no file or process access): the interesting decisions are all
// here, so they are unit-tested instead of being buried in a batch file.

export type LocalEnvInput = {
  /** The PostgreSQL password chosen at install time. Any characters are allowed. */
  dbPassword: string;
  dbUser?: string;
  /**
   * A dedicated database, never the server's default `postgres` one: that database is
   * shared with whatever else lives on the machine, and `prisma migrate deploy` refuses
   * to run against a non-empty schema (P3005).
   */
  dbName?: string;
  /** This PC's LAN address, only when a phone on the same network needs to reach the web app. */
  lanIp?: string;
  /** Injectable for tests. */
  randomSecret?: () => string;
};

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

/** 96 hex characters = 384 bits, comfortably over the 32-character production minimum. */
const defaultSecret = (): string => randomBytes(48).toString('hex');

export function buildLocalEnv(input: LocalEnvInput): string {
  const { dbPassword, dbUser = 'postgres', dbName = 'chatapp', lanIp, randomSecret = defaultSecret } = input;

  if (dbPassword.length === 0) {
    throw new Error('The PostgreSQL password is empty.');
  }
  if (lanIp !== undefined && lanIp !== '' && !IPV4.test(lanIp)) {
    throw new Error('The LAN address is not a valid IPv4 address (expected e.g. 192.168.1.20).');
  }

  const origins = ['http://localhost:5173'];
  if (lanIp) {
    origins.push(`http://${lanIp}:5173`);
  }
  // Where the emailed reset link points: the web app, not the API. Prefer the LAN address
  // when there is one, since that is how a phone (the reason for giving it) reaches the app.
  const appBaseUrl = lanIp ? `http://${lanIp}:5173` : 'http://localhost:5173';

  // The password goes through encodeURIComponent: a raw `@`, `:`, `/`, `%`, `#` or `?`
  // would end the credentials early or make the URL unparseable.
  const databaseUrl = `postgresql://${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPassword)}@localhost:5432/${encodeURIComponent(dbName)}?schema=public`;

  // Fresh random secrets per machine. These used to be fixed strings committed to the repo,
  // which let anyone who had read the repo forge an access token for any user on a
  // development server reachable from the LAN.
  const access = randomSecret();
  let refresh = randomSecret();
  if (refresh === access) {
    refresh = randomSecret();
  }

  return (
    [
      'NODE_ENV=development',
      'PORT=4000',
      `CORS_ORIGIN=${origins.join(',')}`,
      `DATABASE_URL="${databaseUrl}"`,
      `JWT_ACCESS_SECRET=${access}`,
      `JWT_REFRESH_SECRET=${refresh}`,
      'JWT_ACCESS_TTL=15m',
      'JWT_REFRESH_TTL=30d',
      'BCRYPT_ROUNDS=10',
      `APP_BASE_URL=${appBaseUrl}`,
      // No mail provider on a personal machine, so print the reset link to this console.
      'DEV_LOG_RESET_TOKEN=true',
    ].join('\n') + '\n'
  );
}
