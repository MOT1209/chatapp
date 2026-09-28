import 'dart:async';

import 'package:chat_app/core/api_client.dart';
import 'package:chat_app/core/chat_api.dart';
import 'package:chat_app/core/realtime_client.dart';
import 'package:chat_app/core/token_storage.dart';
import 'package:chat_app/models/conversation.dart';
import 'package:chat_app/models/message.dart';
import 'package:chat_app/models/user.dart';
import 'package:chat_app/state/chat_controller.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_backend.dart';

void main() {
  late FakeBackend backend;
  late StreamController<ServerFrame> frames;
  late ChatController chat;
  late String conversationId;
  late User me;
  late User sara;
  final readCalls = <String>[];
  final sentFrames = <Map<String, dynamic>>[];
  final updated = <Message>[];

  setUp(() async {
    backend = FakeBackend();
    me = User.fromJson(backend.addUser('ahmad'));
    sara = User.fromJson(backend.addUser('sara'));
    conversationId = backend.addConversation('ahmad', 'sara', messages: [('sara', 'Hi')]);
    frames = StreamController<ServerFrame>.broadcast();
    readCalls.clear();
    sentFrames.clear();
    updated.clear();

    final api = ChatApi(
      ApiClient(
        baseUrl: 'http://test',
        tokens: InMemoryTokenStorage(Tokens(backend.issueToken(me.id), 'r')),
        httpClient: backend.httpClient,
      ),
    );
    chat = ChatController(
      api: api,
      frames: frames.stream,
      me: me,
      conversation: Conversation(id: conversationId, participant: sara, unreadCount: 1, updatedAt: DateTime.utc(2026)),
      onRead: readCalls.add,
      onMessageUpdated: updated.add,
      sendFrame: (type, payload) => sentFrames.add({'type': type, ...payload}),
    );
    await chat.load();
  });

  tearDown(() async {
    chat.dispose();
    await frames.close();
  });

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  test('loading marks the conversation read up to the newest incoming message', () async {
    await settle();
    expect(chat.messages.map((m) => m.body), ['Hi']);
    expect(readCalls, [conversationId]);
    expect(backend.requests.where((r) => r.url.path.endsWith('/read')).single.body, contains(chat.messages.last.id));
  });

  test('send is optimistic, then reconciled by clientId', () async {
    final future = chat.send('  Hello  ');
    expect(chat.messages.last.body, 'Hello');
    expect(chat.messages.last.status, MessageStatus.pending);
    expect(chat.messages.last.isLocal, isTrue);

    await future;
    expect(chat.messages, hasLength(2));
    expect(chat.messages.last.status, MessageStatus.sent);
    expect(chat.messages.last.isLocal, isFalse);
  });

  test('whitespace-only messages are not sent', () async {
    await chat.send('   ');
    expect(chat.messages, hasLength(1));
  });

  test('failed sends are kept and can be retried with the same clientId', () async {
    backend.failNextSend = true;
    await chat.send('Retry me');
    final failed = chat.messages.last;
    expect(failed.status, MessageStatus.failed);

    await chat.retry(failed);
    expect(chat.messages, hasLength(2));
    expect(chat.messages.last.status, MessageStatus.sent);
    expect(chat.messages.last.clientId, failed.clientId);
  });

  test('a realtime echo of my own message does not duplicate it', () async {
    await chat.send('Once');
    final saved = backend.messagesIn(conversationId).last;
    frames.add(ServerFrame('message:new', {'message': saved}));
    await settle();
    expect(chat.messages.where((m) => m.body == 'Once'), hasLength(1));
  });

  test('incoming messages for other conversations are ignored', () async {
    final other = backend.addConversation('ahmad', 'sara');
    final message = backend.deliverFrom('sara', other, 'elsewhere');
    frames.add(ServerFrame('message:new', {'message': message}));
    await settle();
    expect(chat.messages.map((m) => m.body), isNot(contains('elsewhere')));
  });

  test('a read receipt from the participant marks my messages read', () async {
    await chat.send('Seen?');
    final mine = chat.messages.last;
    frames.add(
      ServerFrame('read', {
        'conversationId': conversationId,
        'userId': sara.id,
        'messageId': mine.id,
        'readAt': '2026-09-28T14:03:40.000Z',
      }),
    );
    await settle();
    expect(chat.messages.last.status, MessageStatus.read);
  });

  test('presence updates the participant', () async {
    frames.add(const ServerFrame('presence', {'userId': 'u_sara', 'isOnline': true, 'lastSeenAt': null}));
    await settle();
    expect(chat.participant.isOnline, isTrue);
  });

  group('typing', () {
    test('throttles "true" and sends one "false" when the composer empties', () {
      chat
        ..onComposing(true)
        ..onComposing(true)
        ..onComposing(true);
      expect(sentFrames.map((f) => f['isTyping']), [true]);
      chat.onComposing(false);
      expect(sentFrames.map((f) => f['isTyping']), [true, false]);
      expect(sentFrames.every((f) => f['type'] == 'typing' && f['conversationId'] == conversationId), isTrue);
    });

    test('sending a message stops typing', () async {
      chat.onComposing(true);
      await chat.send('hi');
      expect(sentFrames.map((f) => f['isTyping']), [true, false]);
    });

    test("the participant's typing clears on their next message", () async {
      frames.add(ServerFrame('typing', {'conversationId': conversationId, 'userId': sara.id, 'isTyping': true}));
      await settle();
      expect(chat.participantTyping, isTrue);
      frames.add(ServerFrame('message:new', {'message': backend.deliverFrom('sara', conversationId, 'Done')}));
      await settle();
      expect(chat.participantTyping, isFalse);
    });

    test('typing in another conversation is ignored', () async {
      frames.add(const ServerFrame('typing', {'conversationId': 'other', 'userId': 'u_sara', 'isTyping': true}));
      await settle();
      expect(chat.participantTyping, isFalse);
    });
  });

  group('delete', () {
    test('deletes my message and reports the in-place update', () async {
      await chat.send('Oops');
      final mine = chat.messages.last;
      await chat.delete(mine);
      expect(chat.messages.last.isDeleted, isTrue);
      expect(chat.messages.last.body, isEmpty);
      expect(updated.single.id, mine.id);
      expect(backend.messagesIn(conversationId).last['deletedAt'], isNotNull);
    });

    test("never deletes someone else's message", () async {
      await chat.delete(chat.messages.first);
      expect(chat.messages.first.isDeleted, isFalse);
      expect(backend.requests.where((r) => r.method == 'DELETE'), isEmpty);
    });

    test('a deletion update is applied even over a read message', () async {
      await chat.send('Seen then deleted');
      final mine = chat.messages.last;
      frames.add(ServerFrame('read', {'conversationId': conversationId, 'userId': sara.id, 'messageId': mine.id}));
      await settle();
      final json = backend.messagesIn(conversationId).last
        ..['body'] = ''
        ..['deletedAt'] = '2026-09-28T13:00:00.000Z';
      frames.add(ServerFrame('message:updated', {'message': json}));
      await settle();
      expect(chat.messages.last.isDeleted, isTrue);
    });
  });
}
