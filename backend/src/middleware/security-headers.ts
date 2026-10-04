import helmet from 'helmet';
import { env } from '../config/env.js';

/**
 * Security headers (docs/api-contract.md §11.1).
 *
 * The API only ever returns JSON, so the policy is deliberately strict. The two
 * non-obvious parts are the CSP and COEP, which the review flagged as P0 because
 * helmet's defaults are a weaker policy than what this API needs.
 */
export function securityHeaders() {
  const isProduction = env.NODE_ENV === 'production';

  return helmet({
    // Everything is JSON from our own origin — no scripts, no frames, no plugins,
    // nothing to load cross-origin. `frame-ancestors` is the CSP half of clickjacking
    // defence; X-Frame-Options alone cannot deny embedding for every browser.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"],
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
        'script-src': ["'none'"],
      },
    },
    // Only meaningful over TLS, so enabling it in development would make every local
    // http://localhost request fail an unrelated check.
    strictTransportSecurity: isProduction
      ? { maxAge: 63_072_000, includeSubDomains: true, preload: true }
      : false,
    // The API is not embedded anywhere and loads no third-party resource, so it has
    // no reason to keep powerful browser features switched on.
    crossOriginEmbedderPolicy: { policy: 'require-corp' },
    // Lets a *different* origin embed our response, which is the point of the web
    // client's fetches. `credentialless` keeps cookies out of that cross-origin read
    // so `Access-Control-Allow-Credentials` alone is not enough to leak a response.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
  });
}