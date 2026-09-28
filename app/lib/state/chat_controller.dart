import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';

import '../core/api_exception.dart';
import '../core/chat_api.dart';
import '../core/realtime_client.dart';
import '../models/conversation.dart';
import '../models/message.dart';
import '../models/user.dart';

/// State for one open conversation. Implements the send flow from contract §5.2:
/// optimistic insert keyed by `clientId`, reconcile on success, keep and flag on failure.
class ChatController extends ChangeNotifier {
  ChatController({
    required ChatApi api,
    required Stream<ServerFrame> frames,
    required this.me,
    required Conversation conversation,
    this.onMessage,
    this.onMessageUpdated,
    this.onRead,
    this.sendFrame,
    Uuid uuid = const Uuid(),
  }) : _api = api,
       _uuid = uuid,
       conversationId = conversation.id,
       _participant = conversation.participant {
    _subscription = frames.listen(_onFrame);
  }

  final ChatApi _api;
  final Uuid _uuid;
  final User me;
  final String conversationId;

  /// Mirrors every message into the conversation list (last message preview, ordering).
  final void Function(Message message)? onMessage;

  /// Mirrors in-place changes (deletion) without reordering the conversation list.
  final void Function(Message message)? onMessageUpdated;

  /// Called after the conversation is marked read, so the list can clear its badge.
  final void Function(String conversationId)? onRead;

  /// Sends a transient realtime frame (typing). Null disables typing signals.
  final void Function(String type, Map<String, dynamic> payload)? sendFrame;

  static const _typingThrottle = Duration(seconds: 2);
  static const _typingIdle = Duration(seconds: 2);
  static const _remoteTypingTtl = Duration(seconds: 3);

  bool _typingSent = false;
  DateTime? _typingSentAt;
  Timer? _typingIdleTimer;

  bool _participantTyping = false;
  bool get participantTyping => _participantTyping;
  Timer? _remoteTypingTimer;

  late final StreamSubscription<ServerFrame> _subscription;
  bool _disposed = false;

  User _participant;
  User get participant => _participant;

  /// Oldest → newest.
  List<Message> _messages = const [];
  List<Message> get messages => _messages;

  bool _loading = false;
  bool get loading => _loading;

  bool _loadingMore = false;
  bool get loadingMore => _loadingMore;

  ApiException? _error;
  ApiException? get error => _error;

  String? _nextCursor;
  bool get hasMore => _nextCursor != null;

  String? _lastReadSent;

  Future<void> load() async {
    _loading = true;
    _error = null;
    _notify();
    try {
      final page = await _api.messages(conversationId);
      _messages = _merge(page.messages);
      _nextCursor = page.nextCursor;
      _markRead();
    } on ApiException catch (e) {
      _error = e;
    } finally {
      _loading = false;
      _notify();
    }
  }

  Future<void> loadMore() async {
    final cursor = _nextCursor;
    if (cursor == null || _loadingMore) return;
    _loadingMore = true;
    _notify();
    try {
      final page = await _api.messages(conversationId, cursor: cursor);
      _messages = _merge(page.messages);
      _nextCursor = page.nextCursor;
    } on ApiException {
      // Older history is non-critical; the user can scroll up again to retry.
    } finally {
      _loadingMore = false;
      _notify();
    }
  }

  /// Contract §4.3: at most one `typing: true` per 2s, and a final `false` after 2s idle.
  void onComposing(bool hasText) {
    if (sendFrame == null) return;
    if (!hasText) {
      _stopTyping();
      return;
    }
    final now = DateTime.now();
    if (!_typingSent || now.difference(_typingSentAt!) >= _typingThrottle) {
      sendFrame!('typing', {'conversationId': conversationId, 'isTyping': true});
      _typingSent = true;
      _typingSentAt = now;
    }
    _typingIdleTimer?.cancel();
    _typingIdleTimer = Timer(_typingIdle, _stopTyping);
  }

  void _stopTyping() {
    _typingIdleTimer?.cancel();
    if (!_typingSent) return;
    _typingSent = false;
    sendFrame?.call('typing', {'conversationId': conversationId, 'isTyping': false});
  }

  /// Contract §3.4.1. Throws [ApiException] so the UI can explain a refusal.
  Future<void> delete(Message message) async {
    if (message.isLocal || message.isDeleted || message.sender.id != me.id) return;
    await _api.deleteMessage(conversationId, message.id);
    final deleted = Message(
      id: message.id,
      clientId: message.clientId,
      conversationId: message.conversationId,
      sender: message.sender,
      body: '',
      createdAt: message.createdAt,
      status: message.status,
      readAt: message.readAt,
      deletedAt: DateTime.now().toUtc(),
    );
    _upsert(deleted, force: true);
    onMessageUpdated?.call(deleted);
  }

  Future<void> send(String text) async {
    final body = text.trim();
    if (body.isEmpty) return;
    _stopTyping();
    final optimistic = Message.optimistic(clientId: _uuid.v4(), conversationId: conversationId, sender: me, body: body);
    _upsert(optimistic);
    await _deliver(optimistic);
  }

  Future<void> retry(Message failed) async {
    if (failed.status != MessageStatus.failed) return;
    final pending = failed.copyWith(status: MessageStatus.pending);
    _upsert(pending, force: true);
    await _deliver(pending);
  }

  Future<void> _deliver(Message optimistic) async {
    try {
      final saved = await _api.sendMessage(conversationId, clientId: optimistic.clientId, body: optimistic.body);
      _upsert(saved);
      onMessage?.call(saved);
    } on ApiException {
      // Never drop a failed message silently (§5.2).
      _upsert(optimistic.copyWith(status: MessageStatus.failed), force: true);
    }
  }

  void _onFrame(ServerFrame frame) {
    final p = frame.payload;
    switch (frame.type) {
      case 'message:new' || 'message:updated':
        final message = Message.fromJson(p['message'] as Map<String, dynamic>);
        if (message.conversationId != conversationId) return;
        _upsert(message);
        if (frame.type == 'message:new' && message.sender.id != me.id) {
          _setParticipantTyping(false);
          _markRead();
        }
      case 'typing':
        if (p['conversationId'] != conversationId || p['userId'] != _participant.id) return;
        _setParticipantTyping(p['isTyping'] == true);
      case 'read':
        if (p['conversationId'] != conversationId || p['userId'] == me.id) return;
        _applyReadReceipt(p['messageId'] as String?, p['readAt'] as String?);
      case 'presence':
        if (p['userId'] != _participant.id) return;
        final lastSeen = p['lastSeenAt'];
        _participant = _participant.withPresence(
          isOnline: p['isOnline'] as bool? ?? false,
          lastSeenAt: lastSeen is String ? DateTime.parse(lastSeen).toUtc() : null,
        );
        _notify();
      case 'ready':
        // Reconnected: pull the newest page to cover anything missed while offline.
        if (!_loading) unawaited(_refreshNewest());
    }
  }

  void _setParticipantTyping(bool typing) {
    _remoteTypingTimer?.cancel();
    // Typing is never cached and clears itself if the "stop" frame is lost (§4.6).
    if (typing) _remoteTypingTimer = Timer(_remoteTypingTtl, () => _setParticipantTyping(false));
    if (_participantTyping == typing) return;
    _participantTyping = typing;
    _notify();
  }

  Future<void> _refreshNewest() async {
    try {
      final page = await _api.messages(conversationId);
      _messages = _merge(page.messages);
      _markRead();
      _notify();
    } on ApiException {
      // The existing list stays usable; the next reconnect tries again.
    }
  }

  void _applyReadReceipt(String? messageId, String? readAtRaw) {
    final readAt = readAtRaw == null ? DateTime.now().toUtc() : DateTime.parse(readAtRaw).toUtc();
    final target = messageId == null ? null : _messages.where((m) => m.id == messageId).firstOrNull;
    final cutoff = target?.createdAt;
    _messages = [
      for (final m in _messages)
        m.sender.id == me.id && m.status == MessageStatus.sent && (cutoff == null || !m.createdAt.isAfter(cutoff))
            ? m.copyWith(status: MessageStatus.read, readAt: readAt)
            : m,
    ];
    _notify();
  }

  /// Contract §5.3: mark read up to the newest server message from the other user.
  void _markRead() {
    final newest = _messages.reversed.where((m) => !m.isLocal && m.sender.id != me.id).firstOrNull;
    if (newest == null || newest.id == _lastReadSent) return;
    _lastReadSent = newest.id;
    onRead?.call(conversationId);
    unawaited(_api.markRead(conversationId, newest.id).catchError((Object _) {}));
  }

  /// Inserts or replaces by `id` or `clientId`. Server state never regresses a
  /// newer local state unless [force] is set (used for failed/retry transitions).
  void _upsert(Message message, {bool force = false}) {
    final index = _messages.indexWhere((m) => m.id == message.id || m.clientId == message.clientId);
    if (index == -1) {
      _messages = _sorted([..._messages, message]);
    } else {
      final existing = _messages[index];
      if (!force &&
          !message.isDeleted &&
          existing.status == MessageStatus.read &&
          message.status == MessageStatus.sent) {
        return;
      }
      _messages = [..._messages]..[index] = message;
      // The server's `createdAt` replaces the optimistic one and may change the order.
      if (existing.isLocal && !message.isLocal) _messages = _sorted(_messages);
    }
    _notify();
  }

  /// Merges a page into the current list; unsent local messages are kept.
  List<Message> _merge(List<Message> incoming) {
    final byKey = <String, Message>{for (final m in _messages) m.clientId: m};
    for (final m in incoming) {
      byKey[m.clientId] = m;
    }
    return _sorted(byKey.values.toList());
  }

  List<Message> _sorted(List<Message> list) => list..sort((a, b) => a.createdAt.compareTo(b.createdAt));

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _stopTyping();
    _remoteTypingTimer?.cancel();
    _disposed = true;
    unawaited(_subscription.cancel());
    super.dispose();
  }
}
