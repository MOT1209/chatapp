/**
 * In-memory DataStore.
 *
 * Backs the automated test suite and the optional offline demo mode (STORE=memory).
 * It reproduces the constraints the services rely on: unique email/username, a single
 * direct conversation per user pair, and idempotent message inserts on
 * (conversationId, senderId, clientId).
 */

import { ApiError } from '../lib/errors.js';
import { newId } from '../lib/id.js';
import type {
  ConversationMemberRecord,
  ConversationRecord,
  MessageRecord,
  PasswordResetRecord,
  SessionRecord,
  UserRecord,
} from './records.js';
import type {
  CreateMessageInput,
  CreateSessionInput,
  CreateUserInput,
  DataStore,
  ListMessagesInput,
} from './store.js';

const clone = <T>(value: T): T => (value === null ? value : ({ ...value } as T));

export class MemoryStore implements DataStore {
  private users = new Map<string, UserRecord>();
  private sessions = new Map<string, SessionRecord>();
  private conversations = new Map<string, ConversationRecord>();
  private members = new Map<string, ConversationMemberRecord>();
  private messages = new Map<string, MessageRecord>();
  private resets = new Map<string, PasswordResetRecord>();

  /* --------------------------------- Users -------------------------------- */

  async createUser(input: CreateUserInput): Promise<UserRecord> {
    const email = input.email.toLowerCase();
    const username = input.username.toLowerCase();
    for (const u of this.users.values()) {
      if (u.email === email) {
        throw ApiError.conflict('That email is already registered.', { email: 'That email is already registered.' });
      }
      if (u.username === username) {
        throw ApiError.conflict('That username is already taken.', { username: 'That username is already taken.' });
      }
    }
    const now = new Date();
    const record: UserRecord = {
      id: newId('u_'),
      email,
      username,
      displayName: input.displayName,
      passwordHash: input.passwordHash,
      avatarUrl: null,
      status: 'offline',
      lastSeenAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(record.id, record);
    return clone(record);
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    return clone(this.users.get(id) ?? null);
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const target = email.toLowerCase();
    for (const u of this.users.values()) {
      if (u.email === target) return clone(u);
    }
    return null;
  }

  async findUserByUsername(username: string): Promise<UserRecord | null> {
    const target = username.toLowerCase();
    for (const u of this.users.values()) {
      if (u.username === target) return clone(u);
    }
    return null;
  }

  async findUserByIdentifier(identifier: string): Promise<UserRecord | null> {
    const target = identifier.toLowerCase();
    for (const u of this.users.values()) {
      if (u.email === target || u.username === target) return clone(u);
    }
    return null;
  }

  async searchUsers(input: { query: string; excludeUserId: string; limit: number }): Promise<UserRecord[]> {
    const q = input.query.toLowerCase();
    const matches = [...this.users.values()].filter(
      (u) =>
        u.id !== input.excludeUserId &&
        (u.username.includes(q) || u.displayName.toLowerCase().includes(q)),
    );
    matches.sort((a, b) => a.username.localeCompare(b.username));
    return matches.slice(0, input.limit).map(clone);
  }

  async updateUser(id: string, patch: { displayName?: string; avatarUrl?: string | null }): Promise<UserRecord> {
    const user = this.users.get(id);
    if (!user) throw ApiError.notFound('User not found.');
    if (patch.displayName !== undefined) user.displayName = patch.displayName;
    if (patch.avatarUrl !== undefined) user.avatarUrl = patch.avatarUrl;
    user.updatedAt = new Date();
    return clone(user);
  }

  async updateUserPresence(id: string, status: 'online' | 'offline', lastSeenAt: Date | null): Promise<UserRecord | null> {
    const user = this.users.get(id);
    if (!user) return null;
    user.status = status;
    user.lastSeenAt = lastSeenAt;
    user.updatedAt = new Date();
    return clone(user);
  }

  async updateUserPassword(id: string, passwordHash: string): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.passwordHash = passwordHash;
      user.updatedAt = new Date();
    }
  }

  /* -------------------------------- Sessions ------------------------------ */

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const record: SessionRecord = {
      id: newId('s_'),
      userId: input.userId,
      refreshHash: input.refreshHash,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
      createdAt: new Date(),
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    this.sessions.set(record.id, record);
    return clone(record);
  }

  async findSessionByRefreshHash(hash: string): Promise<SessionRecord | null> {
    for (const s of this.sessions.values()) {
      if (s.refreshHash === hash) return clone(s);
    }
    return null;
  }

  async revokeSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session && !session.revokedAt) session.revokedAt = new Date();
  }

  async revokeAllSessions(userId: string): Promise<void> {
    for (const s of this.sessions.values()) {
      if (s.userId === userId && !s.revokedAt) s.revokedAt = new Date();
    }
  }

  /* ----------------------------- Conversations ---------------------------- */

  private membersOf(conversationId: string): ConversationMemberRecord[] {
    return [...this.members.values()].filter((m) => m.conversationId === conversationId);
  }

  async findDirectConversation(userAId: string, userBId: string): Promise<ConversationRecord | null> {
    for (const c of this.conversations.values()) {
      if (c.type !== 'direct') continue;
      const ids = new Set(this.membersOf(c.id).map((m) => m.userId));
      if (ids.size === 2 && ids.has(userAId) && ids.has(userBId)) return clone(c);
    }
    return null;
  }

  async createDirectConversation(userAId: string, userBId: string): Promise<ConversationRecord> {
    const now = new Date();
    const conversation: ConversationRecord = {
      id: newId('c_'),
      type: 'direct',
      title: null,
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(conversation.id, conversation);
    for (const userId of [userAId, userBId]) {
      const member: ConversationMemberRecord = {
        id: newId('m_'),
        conversationId: conversation.id,
        userId,
        role: 'member',
        joinedAt: now,
        lastReadAt: null,
      };
      this.members.set(member.id, member);
    }
    return clone(conversation);
  }

  async listConversationsForUser(userId: string): Promise<ConversationRecord[]> {
    const ids = new Set(
      [...this.members.values()].filter((m) => m.userId === userId).map((m) => m.conversationId),
    );
    return [...this.conversations.values()]
      .filter((c) => ids.has(c.id))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map(clone);
  }

  async findConversationById(id: string): Promise<ConversationRecord | null> {
    return clone(this.conversations.get(id) ?? null);
  }

  async listMembers(conversationId: string): Promise<ConversationMemberRecord[]> {
    return this.membersOf(conversationId).map(clone);
  }

  async findMember(conversationId: string, userId: string): Promise<ConversationMemberRecord | null> {
    for (const m of this.members.values()) {
      if (m.conversationId === conversationId && m.userId === userId) return clone(m);
    }
    return null;
  }

  async setLastRead(conversationId: string, userId: string, at: Date): Promise<void> {
    for (const m of this.members.values()) {
      if (m.conversationId === conversationId && m.userId === userId) {
        if (!m.lastReadAt || m.lastReadAt.getTime() < at.getTime()) m.lastReadAt = at;
        return;
      }
    }
  }

  async touchConversation(id: string, at: Date): Promise<void> {
    const conversation = this.conversations.get(id);
    if (conversation) conversation.updatedAt = at;
  }

  /* -------------------------------- Messages ------------------------------ */

  async findMessageByClientId(conversationId: string, senderId: string, clientId: string): Promise<MessageRecord | null> {
    for (const m of this.messages.values()) {
      if (m.conversationId === conversationId && m.senderId === senderId && m.clientId === clientId) {
        return clone(m);
      }
    }
    return null;
  }

  async createMessage(input: CreateMessageInput): Promise<MessageRecord> {
    const record: MessageRecord = {
      id: newId('msg_'),
      conversationId: input.conversationId,
      senderId: input.senderId,
      clientId: input.clientId,
      body: input.body,
      createdAt: new Date(),
      editedAt: null,
      deletedAt: null,
    };
    this.messages.set(record.id, record);
    return clone(record);
  }

  async findMessageById(id: string): Promise<MessageRecord | null> {
    return clone(this.messages.get(id) ?? null);
  }

  async listMessages(input: ListMessagesInput): Promise<MessageRecord[]> {
    let rows = [...this.messages.values()].filter(
      (m) => m.conversationId === input.conversationId && !m.deletedAt,
    );
    if (input.before) {
      const boundary = input.before;
      rows = rows.filter((m) => {
        const delta = m.createdAt.getTime() - boundary.createdAt.getTime();
        return delta < 0 || (delta === 0 && m.id < boundary.id);
      });
    }
    rows.sort((a, b) => {
      const delta = b.createdAt.getTime() - a.createdAt.getTime();
      return delta !== 0 ? delta : b.id.localeCompare(a.id);
    });
    return rows.slice(0, input.limit).map(clone);
  }

  async getLastMessage(conversationId: string): Promise<MessageRecord | null> {
    const rows = await this.listMessages({ conversationId, limit: 1 });
    return rows[0] ?? null;
  }

  async countUnread(conversationId: string, userId: string, lastReadAt: Date | null): Promise<number> {
    return [...this.messages.values()].filter(
      (m) =>
        m.conversationId === conversationId &&
        !m.deletedAt &&
        m.senderId !== userId &&
        (!lastReadAt || m.createdAt.getTime() > lastReadAt.getTime()),
    ).length;
  }

  /* ----------------------------- Password reset --------------------------- */

  async createPasswordReset(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<PasswordResetRecord> {
    const record: PasswordResetRecord = {
      id: newId('prt_'),
      userId: input.userId,
      tokenHash: input.tokenHash,
      createdAt: new Date(),
      expiresAt: input.expiresAt,
      usedAt: null,
    };
    this.resets.set(record.id, record);
    return clone(record);
  }

  async findPasswordReset(tokenHash: string): Promise<PasswordResetRecord | null> {
    for (const r of this.resets.values()) {
      if (r.tokenHash === tokenHash) return clone(r);
    }
    return null;
  }

  async markPasswordResetUsed(id: string): Promise<void> {
    const record = this.resets.get(id);
    if (record) record.usedAt = new Date();
  }
}
