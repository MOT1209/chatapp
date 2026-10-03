import { describe, it, expect, vi, afterEach } from 'vitest';
import { createMailer, LogMailer, ResendMailer, resetEmailBody } from '../src/lib/mailer.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createMailer', () => {
  it('returns a LogMailer when no provider is configured', () => {
    expect(createMailer({})).toBeInstanceOf(LogMailer);
    expect(createMailer({ resendApiKey: 'x' })).toBeInstanceOf(LogMailer);
    expect(createMailer({ mailFrom: 'a@b.com' })).toBeInstanceOf(LogMailer);
  });

  it('returns a ResendMailer only when both key and from-address are set', () => {
    expect(createMailer({ resendApiKey: 'x', mailFrom: 'a@b.com' })).toBeInstanceOf(ResendMailer);
  });
});

describe('LogMailer', () => {
  it('never puts the token in the log line (it is a credential)', async () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await new LogMailer().sendPasswordReset('u@example.com', 'super-secret-token');
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).not.toContain('super-secret-token');
  });
});

describe('resetEmailBody', () => {
  it('includes the token and a one-hour, single-use notice', () => {
    const { subject, text } = resetEmailBody('the-token');
    expect(subject).toMatch(/reset/i);
    expect(text).toContain('the-token');
    expect(text).toMatch(/expires in 1 hour/i);
    expect(text).not.toMatch(/https?:\/\//); // no link without APP_WEB_URL
  });

  it('adds a link built from APP_WEB_URL, with no double slash', () => {
    const { text } = resetEmailBody('tok', 'https://chat.example.com/');
    expect(text).toContain('https://chat.example.com/reset?token=tok');
  });
});

describe('ResendMailer', () => {
  it('POSTs the token to Resend with the configured sender', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await new ResendMailer('key_123', 'ChatApp <no-reply@example.com>').sendPasswordReset('to@example.com', 'tok-abc');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer key_123');
    const body = JSON.parse(init.body as string);
    expect(body.from).toBe('ChatApp <no-reply@example.com>');
    expect(body.to).toBe('to@example.com');
    expect(body.text).toContain('tok-abc');
  });

  it('throws when Resend rejects the request, without leaking the body to the caller', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('domain not verified', { status: 403 })));
    await expect(
      new ResendMailer('key_123', 'no-reply@example.com').sendPasswordReset('to@example.com', 'tok'),
    ).rejects.toThrow(/403/);
  });
});
