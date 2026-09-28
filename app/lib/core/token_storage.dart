import 'package:shared_preferences/shared_preferences.dart';

class Tokens {
  const Tokens(this.accessToken, this.refreshToken);
  final String accessToken;
  final String refreshToken;
}

abstract class TokenStorage {
  Future<Tokens?> read();
  Future<void> write(Tokens tokens);
  Future<void> clear();
}

/// Contract §1 stores tokens in plain local storage for Alpha. On web this is
/// XSS-readable; move to platform secure storage before a public release.
class SharedPrefsTokenStorage implements TokenStorage {
  SharedPrefsTokenStorage(this._prefs);

  final SharedPreferences _prefs;
  static const _accessKey = 'auth.accessToken';
  static const _refreshKey = 'auth.refreshToken';

  @override
  Future<Tokens?> read() async {
    final access = _prefs.getString(_accessKey);
    final refresh = _prefs.getString(_refreshKey);
    if (access == null || refresh == null) return null;
    return Tokens(access, refresh);
  }

  @override
  Future<void> write(Tokens tokens) async {
    await _prefs.setString(_accessKey, tokens.accessToken);
    await _prefs.setString(_refreshKey, tokens.refreshToken);
  }

  @override
  Future<void> clear() async {
    await _prefs.remove(_accessKey);
    await _prefs.remove(_refreshKey);
  }
}

class InMemoryTokenStorage implements TokenStorage {
  InMemoryTokenStorage([this._tokens]);
  Tokens? _tokens;

  @override
  Future<Tokens?> read() async => _tokens;

  @override
  Future<void> write(Tokens tokens) async => _tokens = tokens;

  @override
  Future<void> clear() async => _tokens = null;
}
