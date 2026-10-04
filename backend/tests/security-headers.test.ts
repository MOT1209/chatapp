import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { securityHeaders } from '../src/middleware/security-headers.js';
import { env } from '../src/config/env.js';

/**
 * P0-4: the review found helmet's defaults still in place, which is a weaker policy
 * than this API needs. These assertions are on real HTTP responses rather than on the
 * middleware's configuration, because the defaults are easy to reintroduce by accident.
 */
function appWithHeaders() {
  const app = express();
  app.use(securityHeaders());
  app.get('/probe', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('security headers', () => {
  afterEach(() => {
    env.NODE_ENV = 'test';
  });

  it('locks the response down with a deny-all CSP', async () => {
    const res = await request(appWithHeaders()).get('/probe');

    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
  });

  it('denies framing through the CSP, which is the modern clickjacking defence', async () => {
    const res = await request(appWithHeaders()).get('/probe');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });

  it('enables COEP, COOP and no-referrer so responses stay out of other origins', async () => {
    const res = await request(appWithHeaders()).get('/probe');

    expect(res.headers['cross-origin-embedder-policy']).toBe('require-corp');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });

  it('allows a different origin to read the response, which is what the web client needs', async () => {
    // Paired with an exact-origin CORS allowlist plus credentials: a blanket
    // `same-origin` would break the web app, while omitting it entirely is fine
    // only because the body carries no sensitive data outside the allowlist.
    const res = await request(appWithHeaders()).get('/probe');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('does not send HSTS outside production, so local http development keeps working', async () => {
    const res = await request(appWithHeaders()).get('/probe');
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  it('sends HSTS in production', async () => {
    env.NODE_ENV = 'production';
    const res = await request(appWithHeaders()).get('/probe');

    expect(res.headers['strict-transport-security']).toContain('max-age=63072000');
    expect(res.headers['strict-transport-security']).toContain('includeSubDomains');
  });
});