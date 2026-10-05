/// Extracts the password-reset token from the link the backend emails
/// (`<APP_BASE_URL>/reset-password?token=<token>`, see `backend/src/services/email.service.ts`).
///
/// Returns null for any other URL, or when the token is missing or blank. Accepts the token
/// in the real query string and in a hash-routed fragment (`/#/reset-password?token=…`) so
/// the link keeps working whichever URL strategy the web build uses.
String? resetTokenFromUri(Uri uri) {
  final direct = _tokenIfResetPath(uri.path, uri.queryParameters);
  if (direct != null) return direct;

  final fragment = uri.fragment;
  if (fragment.isEmpty) return null;
  final inner = Uri.tryParse(fragment.startsWith('/') ? fragment : '/$fragment');
  return inner == null ? null : _tokenIfResetPath(inner.path, inner.queryParameters);
}

String? _tokenIfResetPath(String path, Map<String, String> query) {
  final segments = path.split('/').where((s) => s.isNotEmpty);
  // `last` rather than a full-path match so the app can be hosted under a sub-path.
  if (segments.isEmpty || segments.last != 'reset-password') return null;
  final token = query['token']?.trim();
  return (token == null || token.isEmpty) ? null : token;
}
