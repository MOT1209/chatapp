import 'message.dart';
import 'user.dart';

class Conversation {
  const Conversation({
    required this.id,
    required this.participant,
    required this.unreadCount,
    required this.updatedAt,
    this.lastMessage,
  });

  factory Conversation.fromJson(Map<String, dynamic> json) => Conversation(
    id: json['id'] as String,
    participant: User.fromJson(json['participant'] as Map<String, dynamic>),
    lastMessage: json['lastMessage'] == null ? null : Message.fromJson(json['lastMessage'] as Map<String, dynamic>),
    unreadCount: (json['unreadCount'] as num?)?.toInt() ?? 0,
    updatedAt: DateTime.parse(json['updatedAt'] as String).toUtc(),
  );

  final String id;

  /// The other user. Never the current user (contract §2.2).
  final User participant;
  final Message? lastMessage;
  final int unreadCount;
  final DateTime updatedAt;

  Conversation copyWith({User? participant, Message? lastMessage, int? unreadCount, DateTime? updatedAt}) =>
      Conversation(
        id: id,
        participant: participant ?? this.participant,
        lastMessage: lastMessage ?? this.lastMessage,
        unreadCount: unreadCount ?? this.unreadCount,
        updatedAt: updatedAt ?? this.updatedAt,
      );
}
