import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'token_storage.dart';

class ServerFrame {
  const ServerFrame(this.type, this.payload);
  final String type;
  final Map<String, dynamic> payload;
}

/// The minimum a transport must do. Keeps [RealtimeClient] testable without a server.
abstract class SocketConnection {
  Future<void> get ready;
  Stream<dynamic> get stream;
  int? get closeCode;
  void send(String data);
  Future<void> close();
}

class WebSocketConnection implements SocketConnection {
  WebSocketConnection(Uri url) : _channel = WebSocketChannel.connect(url);
  final WebSocketChannel _channel;

  @override
  Future<void> get ready => _channel.ready;
  @override
  Stream<dynamic> get stream => _channel.stream;
  @override
  int? get closeCode => _channel.closeCode;
  @override
  void send(String data) => _channel.sink.add(data);
  @override
  Future<void> close() async => _channel.sink.close(1000);
}

enum RealtimeStatus { disconnected, connecting, connected }

/// Raw-WebSocket client for contract §4. It only emits frames; controllers
/// decide what they mean, and REST stays the source of truth (§4.6).
class RealtimeClient extends ChangeNotifier {
  RealtimeClient({
    required this.url,
    required this.tokens,
    required this.refreshTokens,
    SocketConnection Function(Uri url)? connector,
    this.pingInterval = const Duration(seconds: 25),
    Duration Function(int attempt)? backoff,
  }) : _connector = connector ?? WebSocketConnection.new,
       _backoff = backoff ?? defaultBackoff;

  static const _unauthorizedCloseCode = 4401;
  static const _maxMissedPongs = 2;

  final Uri url;
  final TokenStorage tokens;
  final Future<bool> Function() refreshTokens;
  final Duration pingInterval;
  final SocketConnection Function(Uri url) _connector;
  final Duration Function(int attempt) _backoff;

  final _frames = StreamController<ServerFrame>.broadcast();
  Stream<ServerFrame> get frames => _frames.stream;

  RealtimeStatus _status = RealtimeStatus.disconnected;
  RealtimeStatus get status => _status;

  SocketConnection? _connection;
  StreamSubscription<dynamic>? _subscription;
  Timer? _pingTimer;
  Timer? _reconnectTimer;
  int _attempt = 0;
  int _missedPongs = 0;
  bool _shouldRun = false;
  bool _authRejected = false;

  /// 1s → 2s → 4s → 8s → 15s cap, with up to 25% jitter (contract §4.1).
  static Duration defaultBackoff(int attempt) {
    final base = min(1000 * pow(2, attempt).toInt(), 15000);
    return Duration(milliseconds: base + Random().nextInt(base ~/ 4 + 1));
  }

  void connect() {
    if (_shouldRun) return;
    _shouldRun = true;
    unawaited(_open());
  }

  /// Retry immediately, e.g. when the app returns to the foreground.
  void reconnectNow() {
    if (!_shouldRun || _status != RealtimeStatus.disconnected) return;
    _reconnectTimer?.cancel();
    _attempt = 0;
    unawaited(_open());
  }

  void disconnect() {
    _shouldRun = false;
    _reconnectTimer?.cancel();
    _teardown();
    _setStatus(RealtimeStatus.disconnected);
  }

  @override
  void dispose() {
    disconnect();
    unawaited(_frames.close());
    super.dispose();
  }

  Future<void> _open() async {
    if (!_shouldRun || _connection != null) return;
    final stored = await tokens.read();
    if (stored == null || !_shouldRun) {
      _setStatus(RealtimeStatus.disconnected);
      return;
    }
    _setStatus(RealtimeStatus.connecting);
    _authRejected = false;

    final SocketConnection connection;
    try {
      connection = _connector(url);
      _connection = connection;
      await connection.ready;
    } on Object {
      _connection = null;
      _scheduleReconnect();
      return;
    }
    if (!_shouldRun || !identical(_connection, connection)) {
      unawaited(connection.close());
      return;
    }

    _subscription = connection.stream.listen(
      _onData,
      onDone: () => unawaited(_onClosed(connection)),
      onError: (Object _) {},
      cancelOnError: false,
    );
    _send('auth', {'token': stored.accessToken});
    _missedPongs = 0;
    _pingTimer = Timer.periodic(pingInterval, (_) => _ping());
  }

  void _onData(dynamic data) {
    if (data is! String) return;
    final Object? decoded;
    try {
      decoded = jsonDecode(data);
    } on FormatException {
      return;
    }
    if (decoded is! Map<String, dynamic> || decoded['type'] is! String) return;
    final frame = ServerFrame(
      decoded['type'] as String,
      decoded['payload'] is Map<String, dynamic> ? decoded['payload'] as Map<String, dynamic> : const {},
    );

    switch (frame.type) {
      case 'pong':
        _missedPongs = 0;
        return;
      case 'ready':
        _attempt = 0;
        _setStatus(RealtimeStatus.connected);
      case 'error':
        final code = frame.payload['code'];
        if (code == 'UNAUTHENTICATED' || code == 'TOKEN_EXPIRED') _authRejected = true;
    }
    if (!_frames.isClosed) _frames.add(frame);
  }

  void _ping() {
    if (_missedPongs >= _maxMissedPongs) {
      // Dead socket that never reported close. Force it; _onClosed reconnects.
      unawaited(_connection?.close());
      return;
    }
    _missedPongs++;
    _send('ping', const {});
  }

  Future<void> _onClosed(SocketConnection connection) async {
    if (!identical(_connection, connection)) return;
    final rejected = _authRejected || connection.closeCode == _unauthorizedCloseCode;
    _teardown();
    _setStatus(RealtimeStatus.disconnected);
    if (!_shouldRun) return;
    if (rejected) {
      final bool refreshed;
      try {
        refreshed = await refreshTokens();
      } on Object {
        _scheduleReconnect();
        return;
      }
      if (!refreshed) {
        _shouldRun = false;
        return;
      }
    }
    _scheduleReconnect();
  }

  void _scheduleReconnect() {
    if (!_shouldRun) return;
    _setStatus(RealtimeStatus.disconnected);
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(_backoff(_attempt), () => unawaited(_open()));
    _attempt++;
  }

  /// Sends a client frame when connected. Transient frames (typing, read) are
  /// dropped while offline; REST remains the source of truth.
  void send(String type, Map<String, dynamic> payload) {
    if (_status == RealtimeStatus.connected) _send(type, payload);
  }

  void _send(String type, Map<String, dynamic> payload) {
    try {
      _connection?.send(jsonEncode({'type': type, 'payload': payload}));
    } on StateError {
      // The sink closed between the status check and the write; the close
      // handler will reconnect, and REST stays the source of truth.
    }
  }

  void _teardown() {
    _pingTimer?.cancel();
    _pingTimer = null;
    unawaited(_subscription?.cancel());
    _subscription = null;
    final connection = _connection;
    _connection = null;
    if (connection != null) unawaited(connection.close());
  }

  void _setStatus(RealtimeStatus status) {
    if (_status == status) return;
    _status = status;
    notifyListeners();
  }
}
