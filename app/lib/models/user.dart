class User {
  const User({
    required this.id,
    required this.username,
    required this.displayName,
    required this.createdAt,
    this.email,
    this.avatarUrl,
    this.isOnline = false,
    this.lastSeenAt,
  });

  factory User.fromJson(Map<String, dynamic> json) => User(
    id: json['id'] as String,
    username: json['username'] as String,
    displayName: json['displayName'] as String,
    // Search results deliberately omit email (contract §3.2).
    email: json['email'] as String?,
    avatarUrl: json['avatarUrl'] as String?,
    isOnline: json['isOnline'] as bool? ?? false,
    lastSeenAt: _parseDate(json['lastSeenAt']),
    createdAt: _parseDate(json['createdAt']) ?? DateTime.now().toUtc(),
  );

  final String id;
  final String username;
  final String displayName;
  final String? email;
  final String? avatarUrl;
  final bool isOnline;
  final DateTime? lastSeenAt;
  final DateTime createdAt;

  User withPresence({required bool isOnline, DateTime? lastSeenAt}) => User(
    id: id,
    username: username,
    displayName: displayName,
    email: email,
    avatarUrl: avatarUrl,
    isOnline: isOnline,
    lastSeenAt: lastSeenAt ?? this.lastSeenAt,
    createdAt: createdAt,
  );
}

DateTime? _parseDate(Object? value) => value is String ? DateTime.parse(value).toUtc() : null;
