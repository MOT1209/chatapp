/**
 * Collision-resistant id generator for the in-memory store.
 *
 * The Prisma store lets the database mint ids (cuid). The memory store needs its own,
 * and the frontend treats every id as an opaque string, so the exact format is free.
 */

import { randomUUID } from 'node:crypto';

export function newId(prefix = ''): string {
  return `${prefix}${randomUUID()}`;
}
