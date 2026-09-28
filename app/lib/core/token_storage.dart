import 'package:flutter_secure_storage/flutter_secure_storage.dart';
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

/// Keychain (iOS) / Keystore-backed encrypted storage (Android).
class SecureTokenStorage implements TokenStorage {
  SecureTokenStorage([FlutterSecureStorage? storage]) : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _accessKey = 'auth.accessToken';
  static const _refreshKey = 'auth.refreshToken';

  @override
  Future<Tokens?> read() async {
    final access = await _storage.read(key: _accessKey);
    final refresh = await _storage.read(key: _refreshKey);
    if (access == null || refresh == null) return null;
    return Tokens(access, refresh);
  }

  @override
  Future<void> write(Tokens tokens) async {
    await _storage.write(key: _accessKey, value: tokens.accessToken);
    await _storage.write(key: _refreshKey, value: tokens.refreshToken);
  }

  @override
  Future<void> clear() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
  }
}

/// Used on web and desktop. On web this is `localStorage` and readable by any
/// XSS; on desktop it is a plain file in the user's profile.
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
