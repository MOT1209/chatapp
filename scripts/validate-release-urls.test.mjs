// Unit tests for scripts/validate-release-urls.mjs — mandatory repair tests #2–#4:
// a release must reject missing URLs and localhost, and accept valid https/wss.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateUrl, validateReleaseUrls } from './validate-release-urls.mjs';

test('strict mode rejects a missing API_URL and WS_URL', () => {
  const result = validateReleaseUrls({ apiUrl: '', wsUrl: undefined, strict: true });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0], /API_URL is required/);
  assert.match(result.errors[1], /WS_URL is required/);
});

test('strict mode rejects localhost, loopback IPs and 127.x addresses', () => {
  for (const [api, ws] of [
    ['http://localhost:4000', 'ws://localhost:4000/ws'],
    ['https://127.0.0.1', 'wss://127.0.0.1/ws'],
    ['https://0.0.0.0', 'wss://0.0.0.0/ws'],
    ['https://api.localhost', 'wss://api.localhost/ws'],
    ['https://127.254.1.2', 'wss://127.254.1.2/ws'],
  ]) {
    const apiResult = validateUrl(api, { kind: 'api', strict: true });
    assert.equal(apiResult.ok, false, `expected rejection of ${api}`);
    assert.match(apiResult.error, /loopback|https:/);
    const wsResult = validateUrl(ws, { kind: 'ws', strict: true });
    assert.equal(wsResult.ok, false, `expected rejection of ${ws}`);
  }
});

test('strict mode rejects plain http:// and ws://', () => {
  const api = validateUrl('http://api.example.com', { kind: 'api', strict: true });
  assert.equal(api.ok, false);
  assert.match(api.error, /must use https:/);
  const ws = validateUrl('ws://api.example.com/ws', { kind: 'ws', strict: true });
  assert.equal(ws.ok, false);
  assert.match(ws.error, /must use wss:/);
});

test('strict mode rejects malformed URLs, whitespace, quotes and control characters', () => {
  for (const bad of ['not a url', 'https://exa mple.com', 'https://api.example.com/"onload=x', "https://api.example.com/'", ' https://api.example.com', 'https://api.example.com\n']) {
    const result = validateUrl(bad, { kind: 'api', strict: true });
    assert.equal(result.ok, false, `expected rejection of ${JSON.stringify(bad)}`);
  }
});

test('strict mode rejects URLs with embedded credentials', () => {
  const result = validateUrl('https://user:pass@api.example.com', { kind: 'api', strict: true });
  assert.equal(result.ok, false);
  assert.match(result.error, /credentials/);
});

test('strict mode accepts valid https API_URL and wss WS_URL', () => {
  const result = validateReleaseUrls({
    apiUrl: 'https://api.chatapp.example.com',
    wsUrl: 'wss://api.chatapp.example.com/ws',
    strict: true,
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test('dev mode (non-strict) allows localhost with a warning and accepts missing URLs', () => {
  const result = validateReleaseUrls({ apiUrl: 'http://localhost:4000', wsUrl: 'ws://localhost:4000/ws', strict: false });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0], /loopback/);
});

test('dev mode still rejects garbage URLs in both fields', () => {
  const result = validateReleaseUrls({ apiUrl: 'ftp://nope', wsUrl: 'garbage', strict: false });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 2);
});
