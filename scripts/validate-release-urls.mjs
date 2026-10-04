#!/usr/bin/env node
// Release URL validation for ChatApp release builds.
//
// Tag builds (real releases) MUST point at a real backend: API_URL over https://
// and WS_URL over wss://. localhost, plain http/ws, bare IPs, whitespace, quotes
// and other injection-ish values are rejected — the release must never ship
// silently pointing at a developer machine (repair brief §4).
//
// Manual dispatch builds (workflow_dispatch, no tag) stay allowed to use
// localhost for dry-run testing; they get a warning instead of a failure.
//
// Usage:
//   node scripts/validate-release-urls.mjs --strict   # tag builds: both URLs required
//   node scripts/validate-release-urls.mjs            # dev builds: optional, warned
//
// Exit codes: 0 = acceptable, 1 = rejected (release must stop).

'use strict';

import { pathToFileURL } from 'node:url';

const LOOPBACK_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  '::',
  'local',
  'ip6-localhost',
  'ip6-loopback',
]);

/**
 * Validates one URL.
 * @param {string|null|undefined} raw the URL from the environment
 * @param {{ kind: 'api'|'ws', strict: boolean }} opts
 * @returns {{ ok: true, url: string, warning?: string } | { ok: false, error: string }}
 */
export function validateUrl(raw, opts) {
  const { kind, strict } = opts;
  const secureProtocol = kind === 'api' ? 'https:' : 'wss:';
  const insecureProtocol = kind === 'api' ? 'http:' : 'ws:';
  const label = kind === 'api' ? 'API_URL' : 'WS_URL';

  if (raw === undefined || raw === null || String(raw).trim() === '') {
    if (strict) {
      return { ok: false, error: `${label} is required for a release build. Set the repository variable ${label} (or pass it to workflow_dispatch).` };
    }
    return { ok: true, url: '', warning: `${label} is not set: this build will point at localhost and cannot reach any server.` };
  }

  const value = String(raw);

  // Whitespace or quotes anywhere are never part of a legitimate URL — they are
  // either a typo or an attempt to sneak a value past shell-based validation.
  if (value !== value.trim() || /\s/.test(value) || /["'`]/.test(value) || /[\u0000-\u001f\u007f]/.test(value)) {
    return { ok: false, error: `${label} contains whitespace, quotes or control characters: refusing it.` };
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: `${label} is not a valid URL: ${JSON.stringify(value)}` };
  }

  if (strict && parsed.protocol !== secureProtocol) {
    return { ok: false, error: `${label} must use ${secureProtocol}// for a release build (got ${parsed.protocol}//). Plain ${insecureProtocol}// is only allowed for manual development builds.` };
  }
  if (!strict && parsed.protocol !== secureProtocol && parsed.protocol !== insecureProtocol) {
    return { ok: false, error: `${label} must be http(s)://${kind === 'api' ? '' : ' or ws(s)://'} (got ${parsed.protocol}//).` };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const isLoopback =
    LOOPBACK_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.startsWith('127.') ||
    hostname.startsWith('169.254.');
  if (isLoopback) {
    if (strict) {
      return { ok: false, error: `${label} must not point at a loopback address (${hostname}) in a release build.` };
    }
    return { ok: true, url: value, warning: `${label} points at a loopback address: fine for development builds only.` };
  }

  // Embedded credentials are never wanted in a shipped client URL.
  if (parsed.username !== '' || parsed.password !== '') {
    return { ok: false, error: `${label} must not contain credentials (user:pass@...).` };
  }

  return { ok: true, url: value };
}

/**
 * Validates both release URLs together.
 * @returns {{ ok: boolean, errors: string[], warnings: string[], apiUrl: string, wsUrl: string }}
 */
export function validateReleaseUrls({ apiUrl, wsUrl, strict }) {
  const errors = [];
  const warnings = [];
  const api = validateUrl(apiUrl, { kind: 'api', strict });
  const ws = validateUrl(wsUrl, { kind: 'ws', strict });
  for (const result of [api, ws]) {
    if (!result.ok) {
      errors.push(result.error);
    } else if (result.warning) {
      warnings.push(result.warning);
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    apiUrl: api.ok ? api.url : '',
    wsUrl: ws.ok ? ws.url : '',
  };
}

function main(argv) {
  const strict = argv.includes('--strict');
  const result = validateReleaseUrls({
    apiUrl: process.env.API_URL,
    wsUrl: process.env.WS_URL,
    strict,
  });
  for (const warning of result.warnings) {
    console.warn(`::warning::${warning}`);
  }
  if (!result.ok) {
    for (const error of result.errors) {
      console.error(`::error::${error}`);
    }
    console.error('Release validation failed: refusing to build a release with unusable backend URLs.');
    process.exit(1);
  }
  console.log(`Release URL validation passed (strict=${strict}).`);
}

// Only run as a CLI, so unit tests can import the functions safely.
const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invoked) {
  main(process.argv.slice(2));
}
