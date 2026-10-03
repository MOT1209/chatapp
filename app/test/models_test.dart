import 'package:chat_app/models/conversation.dart';
import 'package:chat_app/models/message.dart';
import 'package:chat_app/models/user.dart';
import 'package:chat_app/l10n/app_localizations.dart';
import 'package:chat_app/ui/format.dart';
import 'package:chat_app/ui/screens/register_screen.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final en = lookupAppLocalizations(const Locale('en'));
  final ar = lookupAppLocalizations(const Locale('ar'));
  final v = RegisterValidators(en);

  const sara = {
    'id': 'u_2',
    'username': 'sara',
    'displayName': 'Sara',
    'avatarUrl': null,
    'isOnline': true,
    'lastSeenAt': '2026-09-28T14:00:00.000Z',
    'createdAt': '2026-08-01T09:00:00.000Z',
  };

  test('parses the contract §3.3 conversation example', () {
    final c = Conversation.fromJson({
      'id': 'c_1',
      'type': 'direct',
      'participant': sara,
      'lastMessage': {
        'id': 'm_9',
        'clientId': 'c_1b3f',
        'conversationId': 'c_1',
        'sender': sara,
        'body': 'Hi, are you free later?',
        'createdAt': '2026-09-28T14:02:00.000Z',
        'status': 'read',
        'readAt': '2026-09-28T14:02:30.000Z',
      },
      'unreadCount': 2,
      'updatedAt': '2026-09-28T14:02:00.000Z',
    });
    expect(c.participant.email, isNull);
    expect(c.participant.isOnline, isTrue);
    expect(c.lastMessage!.status, MessageStatus.read);
    expect(c.lastMessage!.readAt, DateTime.utc(2026, 9, 28, 14, 2, 30));
    expect(c.unreadCount, 2);
  });

  test('a conversation without messages has a null lastMessage', () {
    final c = Conversation.fromJson({
      'id': 'c_2',
      'type': 'direct',
      'participant': sara,
      'lastMessage': null,
      'unreadCount': 0,
      'updatedAt': '2026-09-28T14:02:00.000Z',
    });
    expect(c.lastMessage, isNull);
  });

  test('deletedAt is optional and marks a message deleted', () {
    final base = {
      'id': 'm1',
      'clientId': 'c1',
      'conversationId': 'c_1',
      'sender': sara,
      'body': '',
      'createdAt': '2026-09-28T14:02:00.000Z',
      'status': 'sent',
      'readAt': null,
    };
    expect(Message.fromJson(base).isDeleted, isFalse);
    expect(Message.fromJson({...base, 'deletedAt': '2026-09-28T14:05:00.000Z'}).isDeleted, isTrue);
  });

  test('optimistic messages are local and pending', () {
    final m = Message.optimistic(clientId: 'abc', conversationId: 'c_1', sender: User.fromJson(sara), body: 'Hello');
    expect(m.isLocal, isTrue);
    expect(m.status, MessageStatus.pending);
  });

  group('format', () {
    final now = DateTime(2026, 9, 28, 18);

    test('initials', () {
      expect(initials('Ahmad Hassan'), 'AH');
      expect(initials('sara'), 'S');
      expect(initials('  '), '?');
    });

    test('list timestamps', () {
      expect(formatListTimestamp(en, DateTime(2026, 9, 27, 10).toUtc(), now: now), 'Yesterday');
      expect(formatListTimestamp(en, DateTime(2026, 3, 1).toUtc(), now: now), 'Mar 1');
      expect(formatListTimestamp(en, DateTime(2025, 3, 1).toUtc(), now: now), 'Mar 1, 2025');
    });

    test('Arabic labels', () {
      expect(presenceLabel(ar, User.fromJson(sara)), 'متصل الآن');
      expect(formatDayDivider(ar, DateTime(2026, 9, 27, 10).toUtc(), now: now), 'أمس');
      expect(RegisterValidators(ar).password('short'), '8 أحرف على الأقل');
    });

    test('presence', () {
      expect(presenceLabel(en, User.fromJson(sara)), 'Online');
      expect(presenceLabel(en, User.fromJson({...sara, 'isOnline': false, 'lastSeenAt': null})), 'Offline');
    });
  });

  group('register validators mirror the contract', () {
    test('username', () {
      expect(v.username('ab'), isNotNull);
      expect(v.username('has space'), isNotNull);
      expect(v.username('Ahmad_1.x'), isNull, reason: 'lowercased before checking');
      expect(v.username('a' * 31), isNotNull);
    });

    test('password is 8–72 chars', () {
      expect(v.password('1234567'), isNotNull);
      expect(v.password('12345678'), isNull);
      expect(v.password('a' * 73), isNotNull);
    });

    test('password length is capped in UTF-8 bytes like the server (bcrypt), not characters', () {
      // 36 Arabic letters = 72 bytes: accepted. 37 = 74 bytes: the server would reject it.
      expect(v.password('ب' * 36), isNull);
      expect(v.password('ب' * 37), en.passwordTooLong);
    });

    test('email and display name', () {
      expect(v.email('nope'), isNotNull);
      expect(v.email('a@b.co'), isNull);
      expect(v.displayName(''), isNotNull);
      expect(v.displayName('a' * 51), isNotNull);
    });
  });
}
