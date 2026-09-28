import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'api_exception.dart';
import 'token_storage.dart';

/// JSON over HTTP against the `/api` prefix, with the refresh flow from
/// contract §5.1: one silent refresh on `TOKEN_EXPIRED`, shared by concurrent
/// callers, then a single retry.
class ApiClient {
  ApiClient({
    required String baseUrl,
    required this.tokens,
    http.Client? httpClient,
    this.timeout = const Duration(seconds: 15),
  }) : _baseUrl = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl,
       _http = httpClient ?? http.Client();

  final String _baseUrl;
  final http.Client _http;
  final TokenStorage tokens;
  final Duration timeout;

  /// Called once when the refresh token is rejected and the user must sign in again.
  void Function()? onSessionExpired;

  Future<bool>? _refreshing;

  Future<dynamic> get(String path, {Map<String, String>? query}) => _request('GET', path, query: query);

  Future<dynamic> post(String path, {Object? body, bool auth = true}) => _request('POST', path, body: body, auth: auth);

  Future<dynamic> patch(String path, {Object? body}) => _request('PATCH', path, body: body);

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
      if (stored != null) {
        request.headers['Authorization'] = 'Bearer ${stored.accessToken}';
      }
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
    throw error;
  }

  /// Returns true when new tokens were stored. Concurrent callers share one call.
  Future<bool> refreshTokens() => _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);

  Future<bool> _doRefresh() async {
    final stored = await tokens.read();
    if (stored == null) return false;
    try {
      final json =
          await _request('POST', '/auth/refresh', body: {'refreshToken': stored.refreshToken}, auth: false)
              as Map<String, dynamic>;
      await tokens.write(Tokens(json['accessToken'] as String, json['refreshToken'] as String));
      return true;
    } on ApiException catch (e) {
      // A network blip is not a rejected session; keep the tokens and let the caller surface it.
      if (e.isNetwork) rethrow;
      await tokens.clear();
      onSessionExpired?.call();
      return false;
    }
  }
}
