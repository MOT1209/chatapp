import { Prisma } from '@prisma/client';

/** True for a unique-constraint violation (P2002), e.g. a race on directKey or clientId. */
export function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
