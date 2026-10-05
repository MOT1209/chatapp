import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'api_exception.dart';
import 'http_client_factory.dart';
import 'token_storage.dart';

/// JSON over HTTP against the `/api` prefix, with the refresh flow from
/// contract §5.1: one silent refresh on `TOKEN_EXPIRED`, shared by concurrent
/// callers, then a single retry.
///
/// On web the refresh token is an `HttpOnly` cookie rather than a stored value, so
/// refresh/logout carry no token in the body and instead echo a CSRF token back in a
/// header. Native clients keep the JSON body and are unaffected — the mode is decided
/// by [TokenStorage.persistsRefreshToken], not by a platform check, so tests exercise
/// the same branches.
class ApiClient {
  ApiClient({
    required String baseUrl,
    required this.tokens,
    http.Client? httpClient,
    this.timeout = const Duration(seconds: 15),
  }) : _baseUrl = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl,
       _http = httpClient ?? createApiHttpClient();

  final String _baseUrl;
  final http.Client _http;
  final TokenStorage tokens;
  final Duration timeout;

  /// True when the refresh token is a server-side cookie this client never sees.
  bool get _usesRefreshCookie => !tokens.persistsRefreshToken;

  /// Echoed back on the cookie-authenticated auth calls. Memory-only: it is
  /// meaningless without the cookie, and the server can re-issue it on demand.
  String? _csrfToken;

  /// Called once when the refresh token is rejected and the user must sign in again.
  void Function()? onSessionExpired;

  Future<bool>? _refreshing;

  Future<dynamic> get(String path, {Map<String, String>? query}) => _request('GET', path, query: query);

  Future<dynamic> post(String path, {Object? body, bool auth = true}) => _request('POST', path, body: body, auth: auth);

  Future<dynamic> patch(String path, {Object? body}) => _request('PATCH', path, body: body);

  Future<dynamic> delete(String path) => _request('DELETE', path);

  /// Stores the tokens from a login/register/refresh response, along with the CSRF
  /// token that goes with them.
  ///
  /// On web the refresh token from the body is dropped: the cookie is authoritative,
  /// and keeping a copy in `localStorage` would reintroduce the exposure the cookie
  /// exists to remove.
  Future<void> adoptAuthResponse(Map<String, dynamic> json) async {
    final access = json['accessToken'];
    if (access is! String) return;
    final refresh = json['refreshToken'];
    await tokens.write(Tokens(access, _usesRefreshCookie ? '' : (refresh is String ? refresh : '')));
    final csrf = json['csrfToken'];
    _csrfToken = csrf is String && csrf.isNotEmpty ? csrf : null;
  }

  /// Rebuilds a web session after a page reload, where `localStorage` kept the access
  /// token but the refresh cookie and the in-memory CSRF token have to be re-adopted.
  ///
  /// Returns false when there is no live session, which is the normal case for a
  /// signed-out visitor and must not surface as an error.
  Future<bool> restoreSession() async {
    if (!_usesRefreshCookie) return (await tokens.read()) != null;

    final Map<String, dynamic> payload;
    try {
      final res = await _request('GET', '/auth/csrf', auth: false);
      if (res is! Map<String, dynamic>) return false;
      payload = res;
    } on ApiException {
      return false;
    }

    final csrf = payload['csrfToken'];
    if (csrf is! String || csrf.isEmpty) return false;
    _csrfToken = csrf;
    return refreshTokens();
  }

  Future<dynamic> _request(
    String method,
    String path, {
    Object? body,
    Map<String, String>? query,
    bool auth = true,
    bool isRetry = false,
  }) async {
    final uri = Uri.parse('$_baseUrl/api$path').replace(queryParameters: query?.isEmpty ?? true ? null : query);
    final request = http.Request(method, uri)..headers['Accept'] = 'application/json';
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    if (auth) {
      final stored = await tokens.read();
      if (stored != null && stored.accessToken.isNotEmpty) {
        request.headers['Authorization'] = 'Bearer ${stored.accessToken}';
      }
    }
    final csrf = _csrfToken;
    if (csrf != null && _isCookieAuthenticated(path)) {
      request.headers['X-CSRF-Token'] = csrf;
    }
    if (_usesRefreshCookie) {
      // Tells the server this is a browser, so it leaves the refresh token out of the
      // JSON body instead of handing it to whatever script is running on the page.
      // Native never sends it and keeps receiving the token in the body.
      request.headers['X-Client-Platform'] = 'web';
    }

    final http.Response response;
    try {
      response = await http.Response.fromStream(await _http.send(request).timeout(timeout));
    } on http.ClientException {
      throw ApiException.network();
    } on TimeoutException {
      throw ApiException.network();
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) return null;
      return jsonDecode(utf8.decode(response.bodyBytes));
    }

    final error = ApiException.fromResponse(
      response.statusCode,
      utf8.decode(response.bodyBytes, allowMalformed: true),
      retryAfterHeader: response.headers['retry-after'],
    );
    if (auth && !isRetry && error.code == 'TOKEN_EXPIRED' && await refreshTokens()) {
      return _request(method, path, body: body, query: query, auth: auth, isRetry: true);
    }
    // The token itself is invalid (not merely expired), so the session cannot recover.
    if (auth && error.code == 'UNAUTHENTICATED' && path != '/auth/logout') {
      await tokens.clear();
      onSessionExpired?.call();
    }
    throw error;
  }

  /// The only two calls whose authority is the cookie, so the only two that need CSRF.
  static bool _isCookieAuthenticated(String path) => path == '/auth/refresh' || path == '/auth/logout';

  /// Returns true when new tokens were stored. Concurrent callers share one call.
  Future<bool> refreshTokens() => _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);

  Future<bool> _doRefresh() async {
    final stored = await tokens.read();
    // A cookie session keeps nothing locally, so an empty store is no reason to
    // give up \u2014 the cookie is the credential. Native has nothing to present.
    if (!_usesRefreshCookie && (stored == null || stored.refreshToken.isEmpty)) return false;

    try {
      final json =
          await _request(
                'POST',
                '/auth/refresh',
                // Web sends no body at all: the cookie travels automatically and the CSRF
                // header is what proves this really is the app talking.
                body: _usesRefreshCookie ? null : {'refreshToken': stored?.refreshToken ?? ''},
                auth: false,
              )
              as Map<String, dynamic>;
      await adoptAuthResponse(json);
      return true;
    } on ApiException catch (e) {
      // A network blip is not a rejected session; keep the tokens and let the caller surface it.
      if (e.isNetwork) rethrow;
      await tokens.clear();
      _csrfToken = null;
      onSessionExpired?.call();
      return false;
    }
  }

  /// Signs out. Sends the CSRF header so the server actually revokes the cookie's
  /// session, but always clears local state — a failed request must never leave the
  /// user apparently still signed in.
  Future<void> logout() async {
    try {
      // Native has to present the refresh token or the server cannot revoke
      // anything; web sends nothing because the cookie carries the session and
      // the CSRF header proves the call came from this app.
      final stored = _usesRefreshCookie ? null : await tokens.read();
      final refreshToken = stored?.refreshToken ?? '';
      await _request(
        'POST',
        '/auth/logout',
        body: _usesRefreshCookie || refreshToken.isEmpty ? null : {'refreshToken': refreshToken},
      );
    } on ApiException {
      // Nothing to do: the local session is being dropped regardless.
    } finally {
      _csrfToken = null;
      await tokens.clear();
    }
  }
}
