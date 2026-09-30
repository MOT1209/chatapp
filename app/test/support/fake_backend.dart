import 'dart:async';
import 'dart:convert';

import 'package:chat_app/core/realtime_client.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// In-memory implementation of docs/api-contract.md for tests only.
/// The app itself never ships with fake data.
class FakeBackend {
  FakeBackend() {
    httpClient = MockClient(_handle);
  }

  late final MockClient httpClient;
  final requests = <http.Request>[];
  final sockets = <FakeSocket>[];

  final _users = <String, Map<String, dynamic>>{};
  final _passwords = <String, String>{};
  final _tokens = <String, String>{}; // accessToken -> userId
  final _conversations = <String, _Conv>{};
  var _seq = 0;

  /// Makes the next `POST .../messages` fail with a 500.
  bool failNextSend = false;

  /// Emails passed to `POST /auth/forgot-password`, and the one valid reset code.
  final forgotPasswordEmails = <String>[];
  static const validResetCode = 'reset-123';

  Map<String, dynamic> addUser(String username, {String password = 'password123', bool online = false}) {
    final id = 'u_$username';
    _users[id] = {
      'id': id,
      'username': username,
      'email': '$username@example.com',
      'displayName': username[0].toUpperCase() + username.substring(1),
      'avatarUrl': null,
      'isOnline': online,
      'lastSeenAt': null,
      'createdAt': '2026-09-01T10:00:00.000Z',
    };
    _passwords[id] = password;
    return _users[id]!;
  }

  /// Simulates a server-side revocation: every issued token becomes invalid.
  void revokeAllTokens() => _tokens.clear();

  String issueToken(String userId) {
    final token = 'access_${userId}_${_seq++}';
    _tokens[token] = userId;
    return token;
  }

  String addConversation(String a, String b, {List<(String from, String body)> messages = const []}) {
    final id = 'c_${_seq++}';
    final conv = _Conv(id, 'u_$a', 'u_$b');
    _conversations[id] = conv;
    for (final (from, body) in messages) {
      conv.messages.add(_message(conv, 'u_$from', body, 'seed_${_seq++}'));
    }
    return id;
  }

  List<Map<String, dynamic>> messagesIn(String conversationId) => _conversations[conversationId]!.messages;

  /// Simulates another user sending a message: stored and pushed over every open socket.
  Map<String, dynamic> deliverFrom(String username, String conversationId, String body) {
    final conv = _conversations[conversationId]!;
    final message = _message(conv, 'u_$username', body, 'remote_${_seq++}');
    conv.messages.add(message);
    push('message:new', {'message': message});
    return message;
  }

  void push(String type, Map<String, dynamic> payload) {
    for (final s in sockets.where((s) => s.open)) {
      s.serverSend(type, payload);
    }
  }

  /// While true, new WebSocket connections fail (offline, or the server is down).
  bool refuseConnections = false;

  SocketConnection connect(Uri _) {
    if (refuseConnections) throw const SocketRefused();
    final socket = FakeSocket(this);
    sockets.add(socket);
    return socket;
  }

  Map<String, dynamic> _message(_Conv conv, String senderId, String body, String clientId) => {
    'id': 'm_${_seq++}',
    'clientId': clientId,
    'conversationId': conv.id,
    'sender': _users[senderId],
    'body': body,
    'createdAt': DateTime.utc(2026, 9, 28, 12).add(Duration(seconds: _seq)).toIso8601String(),
    'status': 'sent',
    'readAt': null,
    'deletedAt': null,
  };

  Map<String, dynamic> _conversationJson(_Conv c, String me) => {
    'id': c.id,
    'type': 'direct',
    'participant': _users[c.a == me ? c.b : c.a],
    'lastMessage': c.messages.where((m) => m['deletedAt'] == null).lastOrNull,
    'unreadCount': 0,
    'updatedAt': c.messages.isEmpty ? '2026-09-28T10:00:00.000Z' : c.messages.last['createdAt'],
  };

  Future<http.Response> _handle(http.Request request) async {
    requests.add(request);
    final path = request.url.path;
    final body = request.body.isEmpty ? <String, dynamic>{} : jsonDecode(request.body) as Map<String, dynamic>;

    if (request.method == 'POST' && path == '/api/auth/login') {
      final identifier = body['identifier'] as String;
      final user = _users.values.where((u) => u['username'] == identifier || u['email'] == identifier).firstOrNull;
      if (user == null || _passwords[user['id']] != body['password']) {
        return _error(401, 'INVALID_CREDENTIALS', 'Incorrect username or password.');
      }
      return _session(200, user);
    }
    if (request.method == 'POST' && path == '/api/auth/register') {
      if (_users.values.any((u) => u['username'] == body['username'])) {
        return _error(
          409,
          'CONFLICT',
          'Username is already taken.',
          fields: {'username': 'Username is already taken.'},
        );
      }
      final user = addUser(body['username'] as String, password: body['password'] as String);
      user['displayName'] = body['displayName'];
      user['email'] = body['email'];
      return _session(201, user);
    }

    if (request.method == 'POST' && path == '/api/auth/forgot-password') {
      forgotPasswordEmails.add(body['email'] as String);
      return _json(202, {});
    }
    if (request.method == 'POST' && path == '/api/auth/reset-password') {
      if (body['token'] != validResetCode) {
        return _error(400, 'VALIDATION_ERROR', 'Reset code is invalid or expired.', fields: {'token': 'Invalid code.'});
      }
      return http.Response('', 204);
    }

    final me = _tokens[request.headers['Authorization']?.replaceFirst('Bearer ', '')];
    if (me == null) return _error(401, 'UNAUTHENTICATED', 'Sign in required.');

    if (request.method == 'POST' && path == '/api/auth/logout') return http.Response('', 204);
    if (request.method == 'GET' && path == '/api/users/me') return _json(200, _users[me]);
    if (request.method == 'GET' && path == '/api/users/search') {
      final q = request.url.queryParameters['q']!.toLowerCase();
      final users = _users.values
          .where((u) => u['id'] != me && (u['username'] as String).contains(q))
          .map((u) => Map.of(u)..remove('email'))
          .toList();
      return _json(200, {'users': users});
    }
    if (request.method == 'GET' && path == '/api/conversations') {
      final list = _conversations.values
          .where((c) => c.a == me || c.b == me)
          .map((c) => _conversationJson(c, me))
          .toList();
      return _json(200, {'conversations': list});
    }
    if (request.method == 'POST' && path == '/api/conversations') {
      final other = body['participantId'] as String;
      final existing = _conversations.values
          .where((c) => (c.a == me && c.b == other) || (c.a == other && c.b == me))
          .firstOrNull;
      final newId = 'c_${_seq++}';
      final conv = existing ?? (_conversations[newId] = _Conv(newId, me, other));
      return _json(200, _conversationJson(conv, me));
    }

    final deleteMatch = RegExp(r'^/api/conversations/([^/]+)/messages/([^/]+)$').firstMatch(path);
    if (request.method == 'DELETE' && deleteMatch != null) {
      final messages = _conversations[deleteMatch.group(1)]?.messages ?? const [];
      final message = messages.where((m) => m['id'] == deleteMatch.group(2)).firstOrNull;
      if (message == null) return _error(404, 'NOT_FOUND', 'Not found.');
      if ((message['sender'] as Map)['id'] != me) return _error(403, 'FORBIDDEN', 'Not your message.');
      message
        ..['body'] = ''
        ..['deletedAt'] = DateTime.utc(2026, 9, 28, 13).toIso8601String();
      push('message:updated', {'message': message});
      return http.Response('', 204);
    }

    final match = RegExp(r'^/api/conversations/([^/]+)/(messages|read)$').firstMatch(path);
    final conv = match == null ? null : _conversations[match.group(1)];
    if (conv == null) return _error(404, 'NOT_FOUND', 'Not found.');

    if (match!.group(2) == 'read') return http.Response('', 204);
    if (request.method == 'GET') return _json(200, {'messages': conv.messages, 'nextCursor': null});

    if (failNextSend) {
      failNextSend = false;
      return _error(500, 'SERVER_ERROR', 'Boom.');
    }
    final message = _message(conv, me, (body['body'] as String).trim(), body['clientId'] as String);
    conv.messages.add(message);
    return _json(201, message);
  }

  http.Response _session(int status, Map<String, dynamic> user) => _json(status, {
    'user': user,
    'accessToken': issueToken(user['id'] as String),
    'refreshToken': 'refresh_${user['id']}',
  });

  http.Response _json(int status, Object? body) =>
      http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json; charset=utf-8'});

  http.Response _error(int status, String code, String message, {Map<String, String>? fields}) => _json(status, {
    'error': {'code': code, 'message': message, 'fields': ?fields},
  });
}

class _Conv {
  _Conv(this.id, this.a, this.b);
  final String id;
  final String a;
  final String b;
  final messages = <Map<String, dynamic>>[];
}

class SocketRefused implements Exception {
  const SocketRefused();
}

class FakeSocket implements SocketConnection {
  FakeSocket(this._backend);

  final FakeBackend _backend;
  final _incoming = StreamController<dynamic>();
  final sent = <Map<String, dynamic>>[];
  bool open = true;

  @override
  int? closeCode;

  @override
  Future<void> get ready async {}

  @override
  Stream<dynamic> get stream => _incoming.stream;

  @override
  void send(String data) {
    final frame = jsonDecode(data) as Map<String, dynamic>;
    sent.add(frame);
    final payload = frame['payload'] as Map<String, dynamic>;
    switch (frame['type']) {
      case 'auth':
        final userId = _backend._tokens[payload['token']];
        if (userId == null) {
          serverClose(4401);
        } else {
          serverSend('ready', {'userId': userId});
        }
      case 'ping':
        serverSend('pong', {});
    }
  }

  void serverSend(String type, Map<String, dynamic> payload) {
    if (open) _incoming.add(jsonEncode({'type': type, 'payload': payload}));
  }

  void serverClose(int code) {
    closeCode = code;
    unawaited(close());
  }

  @override
  Future<void> close() async {
    if (!open) return;
    open = false;
    await _incoming.close();
  }
}
