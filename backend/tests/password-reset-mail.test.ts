import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import nodemailer from 'nodemailer';
import type { Express } from 'express';
import { buildTestApp, registerUser } from './helpers/test-app.js';
import { resetDb } from './helpers/db.js';
import { prisma } from '../src/lib/prisma.js';
import * as authService from '../src/services/auth.service.js';
import { resetMailTransportForTests } from '../src/services/email.service.js';
import { env } from '../src/config/env.js';

/**
 * P0-1: password reset was unusable in production — the token was hashed and never
 * delivered. These tests pin the two halves that fix it: the mail actually goes out,
 * and a per-account cooldown stops the endpoint being used as a spam amplifier.
 */
let app: Express;

/**
 * `env` is a module-level object shared by every import in the process, so these
 * tests mutate it. Snapshot the keys they touch and put them back, otherwise a
 * leftover `SMTP_HOST` silently makes a later test think mail is configured.
 */
const ENV_KEYS = [
  'APP_BASE_URL',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'SMTP_FROM_NAME',
  'PASSWORD_RESET_COOLDOWN_SECONDS',
] as const;

let envBackup: Record<(typeof ENV_KEYS)[number], unknown>;

beforeAll(() => {
  app = buildTestApp();
});

beforeEach(() => {
  resetMailTransportForTests();
  const mutable = env as unknown as Record<string, unknown>;
  envBackup = Object.fromEntries(ENV_KEYS.map((k) => [k, mutable[k]])) as typeof envBackup;
});

afterEach(async () => {
  vi.restoreAllMocks();
  resetMailTransportForTests();
  const mutable = env as unknown as Record<string, unknown>;
  for (const key of ENV_KEYS) mutable[key] = envBackup[key];
  await resetDb();
});

/** Installs a fake SMTP transport and returns the messages it captured. */
function fakeSmtp() {
  const sent: Array<{ to?: string; from?: unknown; subject?: string; text?: string }> = [];
  const sendMail = vi.fn(async (options: { to?: string; from?: unknown; subject?: string; text?: string }) => {
    sent.push(options);
    return { messageId: `test-${sent.length}` };
  });
  vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as never);
  return { sent, sendMail };
}

async function enableSmtp(): Promise<void> {
  env.SMTP_HOST = 'smtp.test';
  env.SMTP_PORT = 587;
  env.SMTP_FROM = 'no-reply@test.example';
  env.SMTP_FROM_NAME = 'ChatApp';
  env.APP_BASE_URL = 'https://app.test.example';
}

describe('password reset — email delivery', () => {
  it('sends exactly one email containing a working reset link', async () => {
    const smtp = fakeSmtp();
    await enableSmtp();
    await registerUser(app, { username: 'mailuser', email: 'mailuser@example.com' });

    const issued = await authService.requestPasswordReset('mailuser@example.com');

    expect(smtp.sent).toHaveLength(1);
    expect(smtp.sent[0]?.to).toBe('mailuser@example.com');
    expect(smtp.sent[0]?.text).toContain(issued?.resetToken);
  });

  it('builds the reset link from APP_BASE_URL over https, not from a hardcoded host', async () => {
    const smtp = fakeSmtp();
    await enableSmtp();
    await registerUser(app, { username: 'linkuser', email: 'linkuser@example.com' });

    await authService.requestPasswordReset('linkuser@example.com');

    expect(smtp.sent[0]?.text).toContain('https://app.test.example/reset-password?token=');
  });

  it('mentions the configured sender name so the mail is not an anonymous bounce', async () => {
    const smtp = fakeSmtp();
    await enableSmtp();
    await registerUser(app, { username: 'fromuser', email: 'fromuser@example.com' });

    await authService.requestPasswordReset('fromuser@example.com');

    expect(smtp.sent[0]?.from).toEqual({ name: 'ChatApp', address: 'no-reply@test.example' });
  });

  it('sends nothing at all for an unknown address, so the endpoint cannot enumerate users', async () => {
    const smtp = fakeSmtp();
    await enableSmtp();

    const result = await authService.requestPasswordReset('nobody-here@example.com');

    expect(result).toBeUndefined();
    expect(smtp.sent).toHaveLength(0);
  });

  it('still answers 202 for a known address with SMTP enabled', async () => {
    fakeSmtp();
    await enableSmtp();
    await registerUser(app, { username: 'known202', email: 'known202@example.com' });

    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'known202@example.com' });
    expect(res.status).toBe(202);
  });

  it('never puts the token in the HTTP response even when a mail was sent', async () => {
    fakeSmtp();
    await enableSmtp();
    await registerUser(app, { username: 'noresptoken', email: 'noresptoken@example.com' });

    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'noresptoken@example.com' });

    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
  });

  it('never logs the raw token when a real transport is in use', async () => {
    fakeSmtp();
    await enableSmtp();
    await registerUser(app, { username: 'nologtoken', email: 'nologtoken@example.com' });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await authService.requestPasswordReset('nologtoken@example.com');

    expect(JSON.stringify(logSpy.mock.calls)).not.toMatch(/[0-9a-f]{64}/);
    logSpy.mockRestore();
  });

  it('reports failure without throwing, so a bounced mail cannot become a 500', async () => {
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: vi.fn(async () => {
        throw new Error('550 mailbox unavailable');
      }),
    } as never);
    await enableSmtp();
    await registerUser(app, { username: 'bounceuser', email: 'bounceuser@example.com' });

    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'bounceuser@example.com' });

    expect(res.status).toBe(202);
  });

  it('never leaks SMTP credentials or the provider error text into the logs', async () => {
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: vi.fn(async () => {
        throw new Error('535 auth failed for user postmaster:Sup3rSecret!42');
      }),
    } as never);
    await enableSmtp();
    await registerUser(app, { username: 'leakuser', email: 'leakuser@example.com' });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await authService.requestPasswordReset('leakuser@example.com');

    const logged = JSON.stringify(warnSpy.mock.calls);
    expect(logged).not.toContain('Sup3rSecret');
    expect(logged).not.toContain('postmaster');
    warnSpy.mockRestore();
  });

  it('does not send when no transport is configured, outside production', async () => {
    const smtp = fakeSmtp();
    env.SMTP_HOST = undefined;
    env.SMTP_PORT = undefined;
    env.SMTP_FROM = undefined;
    await registerUser(app, { username: 'notransport', email: 'notransport@example.com' });

    await authService.requestPasswordReset('notransport@example.com');

    expect(smtp.sent).toHaveLength(0);
  });
});

describe('password reset — per-account cooldown', () => {
  async function issueCooldown(): Promise<void> {
    env.PASSWORD_RESET_COOLDOWN_SECONDS = 60;
  }

  it('sends a second email only after the cooldown has elapsed', async () => {
    const smtp = fakeSmtp();
    await enableSmtp();
    await issueCooldown();
    await registerUser(app, { username: 'cooldownuser', email: 'cooldownuser@example.com' });

    const first = await authService.requestPasswordReset('cooldownuser@example.com');
    const second = await authService.requestPasswordReset('cooldownuser@example.com');

    expect(first).toBeDefined();
    expect(second).toBeUndefined();
    expect(smtp.sent).toHaveLength(1);
  });

  it('mints no second token while inside the cooldown, so no unusable link is created', async () => {
    fakeSmtp();
    await enableSmtp();
    await issueCooldown();
    await registerUser(app, { username: 'nocoins', email: 'nocoins@example.com' });

    await authService.requestPasswordReset('nocoins@example.com');
    await authService.requestPasswordReset('nocoins@example.com');

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'nocoins@example.com' } });
    const rows = await prisma.passwordResetToken.count({ where: { userId: user.id } });
    expect(rows).toBe(1);
  });

  it('allows a new email once the cooldown window has passed', async () => {
    const smtp = fakeSmtp();
    await enableSmtp();
    await issueCooldown();
    await registerUser(app, { username: 'cooldownexpiry', email: 'cooldownexpiry@example.com' });

    await authService.requestPasswordReset('cooldownexpiry@example.com');
    // Age the existing row out of the window rather than sleeping 60s.
    await prisma.passwordResetToken.updateMany({ data: { createdAt: new Date(Date.now() - 120_000) } });

    const second = await authService.requestPasswordReset('cooldownexpiry@example.com');

    expect(second).toBeDefined();
    expect(smtp.sent).toHaveLength(2);
  });

  it('counts only that account, so one abuser cannot lock everyone else out', async () => {
    const smtp = fakeSmtp();
    await enableSmtp();
    await issueCooldown();
    await registerUser(app, { username: 'victim1', email: 'victim1@example.com' });
    await registerUser(app, { username: 'attacker', email: 'attacker@example.com' });

    await authService.requestPasswordReset('attacker@example.com');
    const victim = await authService.requestPasswordReset('victim1@example.com');

    expect(victim).toBeDefined();
    expect(smtp.sent).toHaveLength(2);
  });

  it('keeps a cooldown-blocked request indistinguishable from a successful one', async () => {
    fakeSmtp();
    await enableSmtp();
    await issueCooldown();
    await registerUser(app, { username: 'indistinct', email: 'indistinct@example.com' });

    const first = await request(app).post('/api/auth/forgot-password').send({ email: 'indistinct@example.com' });
    const second = await request(app).post('/api/auth/forgot-password').send({ email: 'indistinct@example.com' });

    expect(second.status).toBe(first.status);
    expect(second.body).toEqual(first.body);
  });
});