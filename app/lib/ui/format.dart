import 'package:intl/intl.dart';

import '../l10n/app_localizations.dart';
import '../models/user.dart';

// DateFormat uses Intl.defaultLocale, which the app sets from the active locale.

String formatTime(DateTime utc) => DateFormat.Hm().format(utc.toLocal());

/// Short label for the conversation list: time today, "Yesterday", or a date.
String formatListTimestamp(AppLocalizations l, DateTime utc, {DateTime? now}) {
  final local = utc.toLocal();
  final today = _day(now ?? DateTime.now());
  final day = _day(local);
  if (day == today) return formatTime(utc);
  if (day == today.subtract(const Duration(days: 1))) return l.yesterday;
  if (day.year == today.year) return DateFormat.MMMd().format(local);
  return DateFormat.yMMMd().format(local);
}

String formatDayDivider(AppLocalizations l, DateTime utc, {DateTime? now}) {
  final local = utc.toLocal();
  final today = _day(now ?? DateTime.now());
  final day = _day(local);
  if (day == today) return l.today;
  if (day == today.subtract(const Duration(days: 1))) return l.yesterday;
  return DateFormat.yMMMMd().format(local);
}

String presenceLabel(AppLocalizations l, User user, {DateTime? now}) {
  if (user.isOnline) return l.online;
  final seen = user.lastSeenAt;
  if (seen == null) return l.offline;
  final local = seen.toLocal();
  if (_day(local) == _day(now ?? DateTime.now())) return l.lastSeenAt(formatTime(seen));
  return l.lastSeenOn(formatListTimestamp(l, seen, now: now));
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
