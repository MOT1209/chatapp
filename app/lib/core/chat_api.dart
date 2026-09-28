import '../models/conversation.dart';
import '../models/message.dart';
import '../models/user.dart';
import 'api_client.dart';
import 'token_storage.dart';

/// One method per endpoint in docs/api-contract.md §3. Nothing here is invented.
class ChatApi {
  ChatApi(this.client);

  final ApiClient client;
  TokenStorage get _tokens => client.tokens;

  Future<User> login({required String identifier, required String password}) async {
    final json =
        await client.post('/auth/login', body: {'identifier': identifier, 'password': password}, auth: false)
            as Map<String, dynamic>;
    return _storeSession(json);
  }

  Future<User> register({
    required String username,
    required String email,
    required String password,
    required String displayName,
  }) async {
    final json =
        await client.post(
              '/auth/register',
              body: {'username': username, 'email': email, 'password': password, 'displayName': displayName},
              auth: false,
            )
            as Map<String, dynamic>;
    return _storeSession(json);
  }

  /// Contract §3.1: a failed logout request must not block logout on the client.
  Future<void> logout() async {
    try {
      await client.post('/auth/logout');
    } on Exception {
      // Tokens are cleared below regardless.
    }
    await _tokens.clear();
  }

  Future<bool> hasStoredSession() async => await _tokens.read() != null;

  Future<User> me() async => User.fromJson(await client.get('/users/me') as Map<String, dynamic>);

  /// Pass `avatarUrl: ''` to clear the avatar.
  Future<User> updateMe({String? displayName, String? avatarUrl}) async {
    final body = <String, dynamic>{
      'displayName': ?displayName,
      if (avatarUrl != null) 'avatarUrl': avatarUrl.isEmpty ? null : avatarUrl,
    };
    return User.fromJson(await client.patch('/users/me', body: body) as Map<String, dynamic>);
  }

  Future<List<User>> searchUsers(String query, {int limit = 20}) async {
    final json = await client.get('/users/search', query: {'q': query, 'limit': '$limit'}) as Map<String, dynamic>;
    return (json['users'] as List<dynamic>).map((u) => User.fromJson(u as Map<String, dynamic>)).toList();
  }

  Future<List<Conversation>> conversations() async {
    final json = await client.get('/conversations') as Map<String, dynamic>;
    return (json['conversations'] as List<dynamic>)
        .map((c) => Conversation.fromJson(c as Map<String, dynamic>))
        .toList();
  }

  /// Idempotent on the backend: returns the existing conversation if there is one.
  Future<Conversation> openConversation(String participantId) async => Conversation.fromJson(
    await client.post('/conversations', body: {'participantId': participantId}) as Map<String, dynamic>,
  );

  Future<MessagePage> messages(String conversationId, {String? cursor, int limit = 30}) async {
    final json =
        await client.get('/conversations/$conversationId/messages', query: {'limit': '$limit', 'cursor': ?cursor})
            as Map<String, dynamic>;
    return MessagePage(
      (json['messages'] as List<dynamic>).map((m) => Message.fromJson(m as Map<String, dynamic>)).toList(),
      json['nextCursor'] as String?,
    );
  }

  Future<Message> sendMessage(String conversationId, {required String clientId, required String body}) async =>
      Message.fromJson(
        await client.post('/conversations/$conversationId/messages', body: {'clientId': clientId, 'body': body})
            as Map<String, dynamic>,
      );

  Future<void> markRead(String conversationId, String messageId) async {
    await client.post('/conversations/$conversationId/read', body: {'messageId': messageId});
  }

  /// Contract §3.4.1. Only the sender may delete; the server broadcasts `message:updated`.
  Future<void> deleteMessage(String conversationId, String messageId) async {
    await client.delete('/conversations/$conversationId/messages/$messageId');
  }

  Future<void> forgotPassword(String email) async {
    await client.post('/auth/forgot-password', body: {'email': email}, auth: false);
  }

  Future<void> resetPassword({required String token, required String newPassword}) async {
    await client.post('/auth/reset-password', body: {'token': token, 'newPassword': newPassword}, auth: false);
  }

  Future<User> _storeSession(Map<String, dynamic> json) async {
    await _tokens.write(Tokens(json['accessToken'] as String, json['refreshToken'] as String));
    return User.fromJson(json['user'] as Map<String, dynamic>);
  }
}
