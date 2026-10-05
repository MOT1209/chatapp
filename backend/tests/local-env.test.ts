import { describe, expect, it } from 'vitest';
import { parse } from 'dotenv';
import { buildLocalEnv } from '../src/scripts/local-env.js';

function envOf(input: Parameters<typeof buildLocalEnv>[0]): Record<string, string> {
  return parse(buildLocalEnv(input));
}

describe('buildLocalEnv (start-server.bat first-run .env)', () => {
  it('targets a dedicated database, not the shared default "postgres" one', () => {
    const url = new URL(envOf({ dbPassword: 'pw' }).DATABASE_URL!);
    expect(url.pathname).toBe('/chatapp');
    expect(url.pathname).not.toBe('/postgres');
  });

  it.each(['p@ss:w/rd', '100%real', 'a#b?c&d=e', 'with space', 'RASHID.RASHID', 'ünï©ode', '$HOME`x`'])(
    'round-trips the password %j through a parseable URL',
    (password) => {
      const url = new URL(envOf({ dbPassword: password }).DATABASE_URL!);
      expect(url.hostname).toBe('localhost');
      expect(url.port).toBe('5432');
      expect(decodeURIComponent(url.password)).toBe(password);
      expect(url.username).toBe('postgres');
    },
  );

  it('generates long, distinct, non-placeholder token secrets that differ on every run', () => {
    const first = envOf({ dbPassword: 'pw' });
    const second = envOf({ dbPassword: 'pw' });
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      expect(first[key]!.length).toBeGreaterThanOrEqual(64);
      expect(first[key]).toMatch(/^[0-9a-f]+$/);
      expect(first[key]).not.toBe(second[key]);
    }
    expect(first.JWT_ACCESS_SECRET).not.toBe(first.JWT_REFRESH_SECRET);
  });

  it('never reuses the secrets that used to be committed to the repo', () => {
    const out = buildLocalEnv({ dbPassword: 'pw' });
    expect(out).not.toContain('dev-access-secret');
    expect(out).not.toContain('dev-refresh-secret');
    expect(out).not.toContain('change-me');
  });

  it('keeps access and refresh secrets distinct even if the generator repeats itself', () => {
    const values = ['same', 'same', 'other'];
    const out = envOf({ dbPassword: 'pw', randomSecret: () => values.shift()! });
    expect(out.JWT_ACCESS_SECRET).toBe('same');
    expect(out.JWT_REFRESH_SECRET).toBe('other');
  });

  it('allows only localhost by default, and adds the LAN address only when given', () => {
    expect(envOf({ dbPassword: 'pw' }).CORS_ORIGIN).toBe('http://localhost:5173');
    expect(envOf({ dbPassword: 'pw', lanIp: '192.168.1.20' }).CORS_ORIGIN).toBe(
      'http://localhost:5173,http://192.168.1.20:5173',
    );
    expect(envOf({ dbPassword: 'pw', lanIp: '' }).CORS_ORIGIN).toBe('http://localhost:5173');
  });

  it.each(['not-an-ip', '999.1.1.1', '1.2.3', '192.168.1.1:5173', 'http://192.168.1.1', '1.2.3.4,evil.com'])(
    'rejects the invalid LAN address %j instead of widening CORS with it',
    (lanIp) => {
      expect(() => buildLocalEnv({ dbPassword: 'pw', lanIp })).toThrow(/valid IPv4/);
    },
  );

  it('points the emailed reset link at the web app, not the API', () => {
    expect(envOf({ dbPassword: 'pw' }).APP_BASE_URL).toBe('http://localhost:5173');
    expect(envOf({ dbPassword: 'pw', lanIp: '192.168.1.20' }).APP_BASE_URL).toBe('http://192.168.1.20:5173');
  });

  it('prints reset links to the console, since a personal machine has no mail provider', () => {
    expect(envOf({ dbPassword: 'pw' }).DEV_LOG_RESET_TOKEN).toBe('true');
  });

  it('rejects an empty password', () => {
    expect(() => buildLocalEnv({ dbPassword: '' })).toThrow(/empty/);
  });

  it('never contains a wildcard origin or the old hard-coded LAN address', () => {
    const out = buildLocalEnv({ dbPassword: 'pw' });
    expect(out).not.toContain('*');
    expect(out).not.toContain('192.168.2.113');
  });
});
