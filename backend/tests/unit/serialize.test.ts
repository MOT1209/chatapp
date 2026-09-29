import { describe, it, expect } from 'vitest';
import { serializeMessage, serializePublicUser, serializeSelfUser } from '../../src/lib/serialize.js';
import type { MessageRecord, UserRecord } from '../../src/data/records.js';

const user = (over: Partial<UserRecord> = {}): UserRecord => ({
  id: 'u_1',
  email: 'a@example.com',
  username: 'ahmad',
  displayName: 'Ahmad',
  passwordHash: 'hash',
  avatarUrl: null,
  status: 'offline',
  lastSeenAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...over,
});

describe('user serialization', () => {
  it('never leaks email or passwordHash in the public shape', () => {
    const dto = serializePublicUser(user());
    expect(dto).not.toHaveProperty('email');
    expect(dto).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(dto)).not.toContain('hash');
  });

  it('includes email only for the self shape', () => {
    expect(serializeSelfUser(user()).email).toBe('a@example.com');
  });

  it('derives isOnline from the presence status', () => {
    expect(serializePublicUser(user({ status: 'online' })).isOnline).toBe(true);
    expect(serializePublicUser(user({ status: 'offline' })).isOnline).toBe(false);
  });
});

describe('message serialization', () => {
  const message = (over: Partial<MessageRecord> = {}): MessageRecord => ({
    id: 'm_1',
    conversationId: 'c_1',
    senderId: 'u_1',
    clientId: 'cid-1',
    body: 'hi',
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    editedAt: null,
    deletedAt: null,
    ...over,
  });

  it('is "sent" when the recipient has not read up to it', () => {
    const dto = serializeMessage(message(), user(), null);
    expect(dto.status).toBe('sent');
    expect(dto.readAt).toBeNull();
  });

  it('is "read" once the recipient lastReadAt reaches the message time', () => {
    const readAt = new Date('2026-01-01T10:05:00.000Z');
    const dto = serializeMessage(message(), user(), readAt);
    expect(dto.status).toBe('read');
    expect(dto.readAt).toBe(readAt.toISOString());
  });

  it('stays "sent" when lastReadAt predates the message', () => {
    const dto = serializeMessage(message(), user(), new Date('2026-01-01T09:00:00.000Z'));
    expect(dto.status).toBe('sent');
  });

  it('falls back clientId to the id when none was stored', () => {
    const dto = serializeMessage(message({ clientId: null }), user(), null);
    expect(dto.clientId).toBe('m_1');
  });
});
