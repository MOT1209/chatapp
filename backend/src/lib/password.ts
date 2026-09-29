import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

/** Same cost as real hashes; compared against when no user matched, to equalise login timing. */
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dummy-password-never-matches', env.BCRYPT_ROUNDS);

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
