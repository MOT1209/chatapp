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

  setUp(() async {
    backend = FakeBackend();
    me = User.fromJson(backend.addUser('ahmad'));
    sara = User.fromJson(backend.addUser('sara'));
    conversationId = backend.addConversation('ahmad', 'sara', messages: [('sara', 'Hi')]);
    frames = StreamController<ServerFrame>.broadcast();
    readCalls.clear();

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
}
