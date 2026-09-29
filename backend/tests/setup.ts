/**
 * Test bootstrap.
 *
 * Runs before any test module is imported, so the env is valid by the time
 * src/config/env.ts is first evaluated. Uses the in-memory store, so the whole suite
 * runs without a database.
 */

process.env.NODE_ENV = 'test';
process.env.STORE = 'memory';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret';
process.env.JWT_ACCESS_TTL = process.env.JWT_ACCESS_TTL ?? '15m';
process.env.JWT_REFRESH_TTL = process.env.JWT_REFRESH_TTL ?? '30d';
