import { prisma } from '../../src/lib/prisma.js';

/** Clears every table between tests. Order respects foreign keys. */
export async function resetDb(): Promise<void> {
  await prisma.passwordResetToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversationMember.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.user.deleteMany();
}
