import 'package:chat_app/core/realtime_client.dart';
import 'package:chat_app/core/token_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fake_backend.dart';

void main() {
  late FakeBackend backend;
  late InMemoryTokenStorage tokens;
  var refreshCalls = 0;

  RealtimeClient build({Future<bool> Function()? refresh}) => RealtimeClient(
    url: Uri.parse('ws://test/ws'),
    tokens: tokens,
    refreshTokens:
        refresh ??
        () async {
          refreshCalls++;
          return true;
        },
    connector: backend.connect,
    backoff: (_) => Duration.zero,
  );

  Future<void> settle() => Future<void>.delayed(const Duration(milliseconds: 10));

  setUp(() {
    backend = FakeBackend()..addUser('ahmad');
    tokens = InMemoryTokenStorage(Tokens(backend.issueToken('u_ahmad'), 'r'));
    refreshCalls = 0;
  });

  test('authenticates with an auth frame first, then reports connected on ready', () async {
    final client = build();
    final frames = <String>[];
    client.frames.listen((f) => frames.add(f.type));

    client.connect();
    await settle();

    expect(backend.sockets.single.sent.first['type'], 'auth');
    expect(client.status, RealtimeStatus.connected);
    expect(frames, ['ready']);
    client.dispose();
  });

  test('reconnects after the server drops the connection', () async {
    final client = build()..connect();
    await settle();
    backend.sockets.single.serverClose(1006);
    await settle();

    expect(backend.sockets, hasLength(2));
    expect(client.status, RealtimeStatus.connected);
    client.dispose();
  });

  test('close code 4401 refreshes tokens before reconnecting', () async {
    final client = build()..connect();
    await settle();
    backend.sockets.single.serverClose(4401);
    await settle();

    expect(refreshCalls, 1);
    expect(backend.sockets, hasLength(2));
    client.dispose();
  });

  test('stops reconnecting when the refresh is rejected', () async {
    final client = build(refresh: () async => false)..connect();
    await settle();
    backend.sockets.single.serverClose(4401);
    await settle();

    expect(backend.sockets, hasLength(1));
    expect(client.status, RealtimeStatus.disconnected);
    client.dispose();
  });

  test('disconnect closes the socket and does not reconnect', () async {
    final client = build()..connect();
    await settle();
    client.disconnect();
    await settle();

    expect(backend.sockets.single.open, isFalse);
    expect(backend.sockets, hasLength(1));
    client.dispose();
  });

  test('backoff grows 1s → 15s cap with bounded jitter', () {
    for (final (attempt, base) in [(0, 1000), (1, 2000), (3, 8000), (4, 15000), (9, 15000)]) {
      final ms = RealtimeClient.defaultBackoff(attempt).inMilliseconds;
      expect(ms, inInclusiveRange(base, base * 1.25 + 1));
    }
  });
}
