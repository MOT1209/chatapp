import 'package:intl/intl.dart';

import '../models/user.dart';

String formatTime(DateTime utc) => DateFormat.Hm().format(utc.toLocal());

/// Short label for the conversation list: time today, "Yesterday", or a date.
String formatListTimestamp(DateTime utc, {DateTime? now}) {
  final local = utc.toLocal();
  final today = _day(now ?? DateTime.now());
  final day = _day(local);
  if (day == today) return formatTime(utc);
  if (day == today.subtract(const Duration(days: 1))) return 'Yesterday';
  if (day.year == today.year) return DateFormat.MMMd().format(local);
  return DateFormat.yMMMd().format(local);
}

String formatDayDivider(DateTime utc, {DateTime? now}) {
  final local = utc.toLocal();
  final today = _day(now ?? DateTime.now());
  final day = _day(local);
  if (day == today) return 'Today';
  if (day == today.subtract(const Duration(days: 1))) return 'Yesterday';
  return DateFormat.yMMMMd().format(local);
}

String presenceLabel(User user, {DateTime? now}) {
  if (user.isOnline) return 'Online';
  final seen = user.lastSeenAt;
  if (seen == null) return 'Offline';
  final label = formatListTimestamp(seen, now: now);
  return label.contains(':') ? 'Last seen at $label' : 'Last seen $label';
}

String initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  final first = _firstChar(parts.first);
  final second = parts.length > 1 ? _firstChar(parts.last) : '';
  return (first + second).toUpperCase();
}

bool isSameDay(DateTime a, DateTime b) => _day(a.toLocal()) == _day(b.toLocal());

DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);

String _firstChar(String s) => String.fromCharCode(s.runes.first);
