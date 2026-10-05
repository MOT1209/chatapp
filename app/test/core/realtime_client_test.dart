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

  /// Polls a condition instead of sleeping a fixed duration. A reconnect chains
  /// stream callbacks, awaited futures and a zero-duration timer, so how many
  /// event-loop turns it needs is not predictable; a fixed sleep makes these
  /// tests flaky rather than wrong.
  Future<void> waitUntil(bool Function() condition, {required String reason}) async {
    for (var i = 0; i < 200 && !condition(); i++) {
      await settle();
    }
    expect(condition(), isTrue, reason: reason);
  }

  Future<void> waitForLost(RealtimeClient client) =>
      waitUntil(() => client.phase == ConnectionPhase.lost, reason: 'the client never gave up as "lost"');

  Future<void> waitForConnected(RealtimeClient client) =>
      waitUntil(() => client.status == RealtimeStatus.connected, reason: 'the client never finished its handshake');

  Future<void> waitForIdle(RealtimeClient client) =>
      waitUntil(() => client.phase == ConnectionPhase.idle, reason: 'the client never stopped');

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
    await waitForConnected(client);

    expect(backend.sockets.single.sent.first['type'], 'auth');
    expect(client.status, RealtimeStatus.connected);
    expect(frames, ['ready']);
    client.dispose();
  });

  test('reconnects after the server drops the connection', () async {
    final client = build()..connect();
    await waitForConnected(client);
    backend.sockets.single.serverClose(1006);
    await waitUntil(() => backend.sockets.length == 2, reason: 'no replacement socket was opened');

    expect(client.status, RealtimeStatus.connected);
    client.dispose();
  });

  test('close code 4401 refreshes tokens before reconnecting', () async {
    final client = build()..connect();
    await waitForConnected(client);
    backend.sockets.single.serverClose(4401);
    await waitUntil(() => backend.sockets.length == 2, reason: 'the client did not reconnect after refreshing');

    expect(refreshCalls, 1);
    expect(client.status, RealtimeStatus.connected);
    client.dispose();
  });

  test('stops reconnecting when the refresh is rejected', () async {
    final client = build(refresh: () async => false)..connect();
    await waitForConnected(client);
    backend.sockets.single.serverClose(4401);
    await waitForIdle(client);

    expect(backend.sockets, hasLength(1));
    expect(client.status, RealtimeStatus.disconnected);
    client.dispose();
  });

  test('disconnect closes the socket and does not reconnect', () async {
    final client = build()..connect();
    await waitForConnected(client);
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

  group('phase', () {
    test('connecting until ready, then connected; idle after disconnect', () async {
      final client = build();
      expect(client.phase, ConnectionPhase.idle);
      client.connect();
      expect(client.phase, ConnectionPhase.connecting);
      await waitForConnected(client);
      expect(client.phase, ConnectionPhase.connected);
      client.disconnect();
      expect(client.phase, ConnectionPhase.idle);
      client.dispose();
    });

    test('a drop is "reconnecting"; repeated failures become "lost"; recovery is "connected"', () async {
      final client = build()..connect();
      await waitForConnected(client);
      final phases = <ConnectionPhase>[];
      client.addListener(() => phases.add(client.phase));

      backend.refuseConnections = true;
      backend.sockets.single.serverClose(1006);
      await waitForLost(client);
      expect(phases.first, ConnectionPhase.reconnecting);
      expect(client.phase, ConnectionPhase.lost);

      backend.refuseConnections = false;
      await waitForConnected(client);
      expect(client.phase, ConnectionPhase.connected);
      client.dispose();
    });

    test('"Retry now" abandons a hanging attempt and connects', () async {
      backend.refuseConnections = true;
      final client = build()..connect();
      await waitForLost(client);
      expect(client.phase, ConnectionPhase.lost);

      // The next attempt hangs in the handshake, which keeps the status `connecting`.
      backend
        ..refuseConnections = false
        ..hangConnections = true;
      client.reconnectNow();
      await waitUntil(
        () => backend.sockets.length == 1 && client.status == RealtimeStatus.connecting,
        reason: 'the retry never reached the hanging handshake',
      );
      expect(client.status, RealtimeStatus.connecting);
      final hanging = backend.sockets.single;

      backend.hangConnections = false;
      client.reconnectNow();
      await waitUntil(() => backend.sockets.length == 2, reason: 'the hanging socket was not replaced');
      expect(hanging.open, isFalse);
      await waitForConnected(client);
      expect(client.phase, ConnectionPhase.connected);
      client.dispose();
    });

    test('disconnect while waiting to retry tells listeners it is idle', () async {
      backend.refuseConnections = true;
      final client = build()..connect();
      await waitForLost(client);
      expect(client.phase, ConnectionPhase.lost);
      var notified = false;
      client.addListener(() => notified = true);

      client.disconnect();
      expect(notified, isTrue);
      expect(client.phase, ConnectionPhase.idle);
      client.dispose();
    });

    test('a rejected refresh tells listeners it is idle', () async {
      final client = build(refresh: () async => false)..connect();
      await settle();
      final phases = <ConnectionPhase>[];
      client.addListener(() => phases.add(client.phase));

      backend.sockets.single.serverClose(4401);
      await waitForIdle(client);
      expect(phases.last, ConnectionPhase.idle);
      client.dispose();
    });

    test('missing tokens end in "lost" with a retry, not endless "connecting"', () async {
      await tokens.clear();
      final client = build()..connect();
      await waitForLost(client);
      expect(client.phase, ConnectionPhase.lost);
      expect(backend.sockets, isEmpty);
      client.dispose();
    });

    test('a first connection that keeps failing is "lost", not "reconnecting"', () async {
      backend.refuseConnections = true;
      final client = build()..connect();
      final phases = <ConnectionPhase>{};
      client.addListener(() => phases.add(client.phase));
      await waitForLost(client);
      expect(client.phase, ConnectionPhase.lost);
      expect(phases, isNot(contains(ConnectionPhase.reconnecting)));
      client.dispose();
    });
  });
}
