import 'package:chat_app/models/conversation.dart';
import 'package:chat_app/models/message.dart';
import 'package:chat_app/models/user.dart';
import 'package:chat_app/ui/format.dart';
import 'package:chat_app/ui/screens/register_screen.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
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
      expect(formatListTimestamp(DateTime(2026, 9, 27, 10).toUtc(), now: now), 'Yesterday');
      expect(formatListTimestamp(DateTime(2026, 3, 1).toUtc(), now: now), 'Mar 1');
      expect(formatListTimestamp(DateTime(2025, 3, 1).toUtc(), now: now), 'Mar 1, 2025');
    });

    test('presence', () {
      expect(presenceLabel(User.fromJson(sara)), 'Online');
      expect(presenceLabel(User.fromJson({...sara, 'isOnline': false, 'lastSeenAt': null})), 'Offline');
    });
  });

  group('register validators mirror the contract', () {
    test('username', () {
      expect(RegisterValidators.username('ab'), isNotNull);
      expect(RegisterValidators.username('has space'), isNotNull);
      expect(RegisterValidators.username('Ahmad_1.x'), isNull, reason: 'lowercased before checking');
      expect(RegisterValidators.username('a' * 31), isNotNull);
    });

    test('password is 8–72 chars', () {
      expect(RegisterValidators.password('1234567'), isNotNull);
      expect(RegisterValidators.password('12345678'), isNull);
      expect(RegisterValidators.password('a' * 73), isNotNull);
    });

    test('email and display name', () {
      expect(RegisterValidators.email('nope'), isNotNull);
      expect(RegisterValidators.email('a@b.co'), isNull);
      expect(RegisterValidators.displayName(''), isNotNull);
      expect(RegisterValidators.displayName('a' * 51), isNotNull);
    });
  });
}
