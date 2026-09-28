import 'user.dart';

/// `pending` and `failed` are client-only states (contract §5.4).
enum MessageStatus { pending, sent, read, failed }

class Message {
  const Message({
    required this.id,
    required this.clientId,
    required this.conversationId,
    required this.sender,
    required this.body,
    required this.createdAt,
    required this.status,
    this.readAt,
  });

  factory Message.fromJson(Map<String, dynamic> json) => Message(
    id: json['id'] as String,
    clientId: json['clientId'] as String,
    conversationId: json['conversationId'] as String,
    sender: User.fromJson(json['sender'] as Map<String, dynamic>),
    body: json['body'] as String,
    createdAt: DateTime.parse(json['createdAt'] as String).toUtc(),
    status: json['status'] == 'read' ? MessageStatus.read : MessageStatus.sent,
    readAt: json['readAt'] is String ? DateTime.parse(json['readAt'] as String).toUtc() : null,
  );

  factory Message.optimistic({
    required String clientId,
    required String conversationId,
    required User sender,
    required String body,
  }) => Message(
    id: '$localIdPrefix$clientId',
    clientId: clientId,
    conversationId: conversationId,
    sender: sender,
    body: body,
    createdAt: DateTime.now().toUtc(),
    status: MessageStatus.pending,
  );

  static const localIdPrefix = 'local:';

  final String id;
  final String clientId;
  final String conversationId;
  final User sender;
  final String body;
  final DateTime createdAt;
  final MessageStatus status;
  final DateTime? readAt;

  bool get isLocal => id.startsWith(localIdPrefix);

  Message copyWith({MessageStatus? status, DateTime? readAt}) => Message(
    id: id,
    clientId: clientId,
    conversationId: conversationId,
    sender: sender,
    body: body,
    createdAt: createdAt,
    status: status ?? this.status,
    readAt: readAt ?? this.readAt,
  );
}

class MessagePage {
  const MessagePage(this.messages, this.nextCursor);

  /// Oldest → newest, as returned by the backend.
  final List<Message> messages;
  final String? nextCursor;
}
