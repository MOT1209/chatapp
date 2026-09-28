import 'dart:convert';

import 'package:chat_app/core/api_client.dart';
import 'package:chat_app/core/api_exception.dart';
import 'package:chat_app/core/token_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(int status, Object body, {Map<String, String> headers = const {}}) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json', ...headers});

http.Response _error(int status, String code, String message, {Map<String, String>? fields}) => _json(status, {
  'error': {'code': code, 'message': message, 'fields': ?fields},
});

void main() {
  test('parses the contract error envelope, including fields and Retry-After', () async {
    final client = ApiClient(
      baseUrl: 'http://x',
      tokens: InMemoryTokenStorage(),
      httpClient: MockClient(
        (_) async => http.Response(
          jsonEncode({
            'error': {
              'code': 'VALIDATION_ERROR',
              'message': 'Invalid input.',
              'fields': {'username': 'Too short.'},
            },
          }),
          429,
          headers: {'retry-after': '30'},
        ),
      ),
    );
    await expectLater(
      client.post('/auth/register', body: {}, auth: false),
      throwsA(
        isA<ApiException>()
            .having((e) => e.code, 'code', 'VALIDATION_ERROR')
            .having((e) => e.message, 'message', 'Invalid input.')
            .having((e) => e.fields['username'], 'field', 'Too short.')
            .having((e) => e.retryAfter, 'retryAfter', const Duration(seconds: 30)),
      ),
    );
  });

  test('network failures become NETWORK_ERROR', () async {
    final client = ApiClient(
      baseUrl: 'http://x',
      tokens: InMemoryTokenStorage(),
      httpClient: MockClient((_) async => throw http.ClientException('offline')),
    );
    await expectLater(
      client.get('/users/me'),
      throwsA(isA<ApiException>().having((e) => e.isNetwork, 'isNetwork', isTrue)),
    );
  });

  test('prefixes /api and sends the bearer token', () async {
    late http.BaseRequest seen;
    final client = ApiClient(
      baseUrl: 'http://x/',
      tokens: InMemoryTokenStorage(const Tokens('a1', 'r1')),
      httpClient: MockClient((r) async {
        seen = r;
        return _json(200, {'ok': true});
      }),
    );
    await client.get('/users/search', query: {'q': 'sa'});
    expect(seen.url.toString(), 'http://x/api/users/search?q=sa');
    expect(seen.headers['Authorization'], 'Bearer a1');
  });

  test('TOKEN_EXPIRED triggers one shared refresh, then each request retries once', () async {
    var refreshCalls = 0;
    final tokens = InMemoryTokenStorage(const Tokens('old', 'r1'));
    final client = ApiClient(
      baseUrl: 'http://x',
      tokens: tokens,
      httpClient: MockClient((r) async {
        if (r.url.path == '/api/auth/refresh') {
          refreshCalls++;
          expect(jsonDecode(r.body), {'refreshToken': 'r1'});
          return _json(200, {'accessToken': 'new', 'refreshToken': 'r2'});
        }
        if (r.headers['Authorization'] == 'Bearer old') {
          return _error(401, 'TOKEN_EXPIRED', 'Expired.');
        }
        return _json(200, {'path': r.url.path});
      }),
    );

    final results = await Future.wait([client.get('/a'), client.get('/b'), client.get('/c')]);
    expect(results.map((r) => (r as Map)['path']), ['/api/a', '/api/b', '/api/c']);
    expect(refreshCalls, 1);
    expect((await tokens.read())!.refreshToken, 'r2');
  });

  test('a rejected refresh clears tokens and reports the session as expired', () async {
    final tokens = InMemoryTokenStorage(const Tokens('old', 'r1'));
    var expired = 0;
    final client = ApiClient(
      baseUrl: 'http://x',
      tokens: tokens,
      httpClient: MockClient(
        (r) async => r.url.path == '/api/auth/refresh'
            ? _error(401, 'UNAUTHENTICATED', 'Revoked.')
            : _error(401, 'TOKEN_EXPIRED', 'Expired.'),
      ),
    )..onSessionExpired = () => expired++;

    await expectLater(client.get('/users/me'), throwsA(isA<ApiException>()));
    expect(expired, 1);
    expect(await tokens.read(), isNull);
  });

  test('UNAUTHENTICATED on a protected call ends the session', () async {
    final tokens = InMemoryTokenStorage(const Tokens('bad', 'r1'));
    var expired = 0;
    final client = ApiClient(
      baseUrl: 'http://x',
      tokens: tokens,
      httpClient: MockClient((_) async => _error(401, 'UNAUTHENTICATED', 'Invalid token.')),
    )..onSessionExpired = () => expired++;

    await expectLater(client.get('/conversations'), throwsA(isA<ApiException>()));
    expect(expired, 1);
    expect(await tokens.read(), isNull);
  });

  test('UNAUTHENTICATED from login (unauthenticated call) does not expire anything', () async {
    var expired = 0;
    final client = ApiClient(
      baseUrl: 'http://x',
      tokens: InMemoryTokenStorage(),
      httpClient: MockClient((_) async => _error(401, 'UNAUTHENTICATED', 'Nope.')),
    )..onSessionExpired = () => expired++;
    await expectLater(client.post('/auth/login', body: {}, auth: false), throwsA(isA<ApiException>()));
    expect(expired, 0);
  });
}
