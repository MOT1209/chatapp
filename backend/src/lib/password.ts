/**
 * Password hashing.
 *
 * bcryptjs is a pure-JS implementation, so it needs no native build step. The contract
 * caps passwords at 72 chars, which is bcrypt's own input limit.
 */

import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
