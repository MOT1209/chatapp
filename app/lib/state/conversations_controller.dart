import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api_exception.dart';
import '../core/chat_api.dart';
import '../core/realtime_client.dart';
import '../models/conversation.dart';
import '../models/message.dart';
import '../models/user.dart';

class ConversationsController extends ChangeNotifier {
  ConversationsController({required ChatApi api, required Stream<ServerFrame> frames, required this.currentUserId})
    : _api = api {
    _subscription = frames.listen(_onFrame);
  }

  final ChatApi _api;
  final String currentUserId;
  late final StreamSubscription<ServerFrame> _subscription;
  bool _disposed = false;

  List<Conversation> _items = const [];
  List<Conversation> get items => _items;

  bool _loading = false;
  bool get loading => _loading;

  bool _loaded = false;
  bool get loaded => _loaded;

  ApiException? _error;
  ApiException? get error => _error;

  /// The conversation currently on screen. Its incoming messages don't count as unread.
  String? activeId;

  Conversation? byId(String id) {
    for (final c in _items) {
      if (c.id == id) return c;
    }
    return null;
  }

  Future<void> load() async {
    _loading = true;
    _error = null;
    _notify();
    try {
      _items = await _api.conversations();
      _loaded = true;
    } on ApiException catch (e) {
      _error = e;
    } finally {
      _loading = false;
      _notify();
    }
  }

  /// Starts (or reuses) a direct conversation with [user].
  Future<Conversation> openWith(User user) async {
    final conversation = await _api.openConversation(user.id);
    if (byId(conversation.id) == null) {
      _items = [conversation, ..._items];
    }
    _notify();
    return byId(conversation.id)!;
  }

  void markReadLocally(String conversationId) {
    final c = byId(conversationId);
    if (c == null || c.unreadCount == 0) return;
    _replace(c.copyWith(unreadCount: 0));
  }

  void applyMessage(Message message) {
    final c = byId(message.conversationId);
    if (c == null) {
      // A conversation someone else just started. REST has the full shape.
      unawaited(load());
      return;
    }
    final incoming = message.sender.id != currentUserId && message.conversationId != activeId;
    final updated = c.copyWith(
      lastMessage: message,
      updatedAt: message.createdAt,
      unreadCount: incoming ? c.unreadCount + 1 : c.unreadCount,
    );
    _items = [updated, ..._items.where((x) => x.id != c.id)];
    _notify();
  }

  void _onFrame(ServerFrame frame) {
    switch (frame.type) {
      case 'message:new':
        applyMessage(Message.fromJson(frame.payload['message'] as Map<String, dynamic>));
      case 'presence':
        _applyPresence(frame.payload);
      case 'ready':
        // Reconnected: we may have missed frames, so resync from REST (§4.6).
        if (_loaded) unawaited(load());
    }
  }

  void _applyPresence(Map<String, dynamic> payload) {
    final userId = payload['userId'];
    if (!_items.any((c) => c.participant.id == userId)) return;
    final lastSeen = payload['lastSeenAt'];
    _items = [
      for (final c in _items)
        c.participant.id == userId
            ? c.copyWith(
                participant: c.participant.withPresence(
                  isOnline: payload['isOnline'] as bool? ?? false,
                  lastSeenAt: lastSeen is String ? DateTime.parse(lastSeen).toUtc() : null,
                ),
              )
            : c,
    ];
    _notify();
  }

  void _replace(Conversation updated) {
    _items = [for (final c in _items) c.id == updated.id ? updated : c];
    _notify();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    unawaited(_subscription.cancel());
    super.dispose();
  }
}
