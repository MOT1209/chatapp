import 'package:flutter/widgets.dart';

import '../core/api_exception.dart';
import '../l10n/app_localizations.dart';

export '../l10n/app_localizations.dart';

extension L10nContext on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this);
}

/// Maps an [ApiException] to a localized, non-technical message by its contract
/// error code (§1.2). Server `message` text is English and never shown directly.
String errorMessage(AppLocalizations l, ApiException e) => switch (e.code) {
  ApiException.networkError => l.networkError,
  'INVALID_CREDENTIALS' => l.errorInvalidCredentials,
  'RATE_LIMITED' => _rateLimited(l, e.retryAfter),
  'CONFLICT' => l.errorConflict,
  'NOT_FOUND' => l.errorNotFound,
  'FORBIDDEN' => l.errorForbidden,
  'VALIDATION_ERROR' when e.fields.containsKey('token') => l.errorResetCodeInvalid,
  'VALIDATION_ERROR' => l.errorValidation,
  'UNAUTHENTICATED' || 'TOKEN_EXPIRED' => l.errorSessionExpired,
  // 502/503/504 come from a proxy in front of a sleeping or restarting server.
  _ when e.statusCode >= 502 && e.statusCode <= 504 => l.errorServerUnavailable,
  _ => l.somethingWentWrongRetry,
};

/// Says how long to wait when the server sent `Retry-After` (contract §1.3).
String _rateLimited(AppLocalizations l, Duration? wait) {
  if (wait == null || wait <= Duration.zero) return l.errorRateLimited;
  final seconds = wait.inSeconds;
  return seconds <= 90 ? l.errorRateLimitedSeconds(seconds) : l.errorRateLimitedMinutes((seconds / 60).ceil());
}

/// Localized per-field hints for a form. Known server field errors get the rule
/// for that field (mirroring the backend validators); any other field the server
/// flagged gets a generic "check this field".
Map<String, String> fieldErrors(AppLocalizations l, ApiException e) => {
  for (final field in e.fields.keys)
    field: switch ((e.code, field)) {
      ('CONFLICT', 'username') => l.usernameTaken,
      ('CONFLICT', 'email') => l.emailTaken,
      (_, 'token') => l.errorResetCodeInvalid,
      ('VALIDATION_ERROR', 'username') => l.usernameInvalid,
      ('VALIDATION_ERROR', 'email') => l.emailInvalid,
      ('VALIDATION_ERROR', 'password' || 'newPassword') => l.passwordInvalid,
      ('VALIDATION_ERROR', 'displayName') => l.displayNameInvalid,
      ('VALIDATION_ERROR', 'avatarUrl') => l.enterValidUrl,
      ('VALIDATION_ERROR', 'identifier') => l.enterEmailOrUsername,
      _ => l.fieldInvalid,
    },
};
