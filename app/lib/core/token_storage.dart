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

/// The OS credential store: Keychain (iOS, macOS), Keystore-backed encryption
/// (Android), DPAPI (Windows), libsecret (Linux).
///
/// macOS uses the legacy keychain: the data-protection keychain needs the
/// Keychain Sharing entitlement and a provisioning profile, without which an
/// unsigned build only launches on the Mac that built it.
class SecureTokenStorage implements TokenStorage {
  SecureTokenStorage([FlutterSecureStorage? storage])
    : _storage = storage ?? const FlutterSecureStorage(mOptions: MacOsOptions(usesDataProtectionKeychain: false));

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

/// Used on web only, where it is `localStorage` and readable by any XSS (see
/// docs/ui-plan.md). On native platforms it is only read once, to migrate
/// tokens stored in plaintext by v0.0.1 (see [migrateLegacyTokens]).
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

/// Keeps the session in memory, and in [persistent] only while [remember]
/// ("Keep me signed in") is true at the time tokens are written.
///
/// A persistent store that fails (e.g. Linux without a running keyring) degrades
/// to memory only, never to plaintext: the user simply signs in again next launch.
class RememberingTokenStorage implements TokenStorage {
  RememberingTokenStorage(this.persistent, {required bool Function() remember}) : _remember = remember;

  final TokenStorage persistent;
  final bool Function() _remember;
  Tokens? _memory;
  bool _loaded = false;

  @override
  Future<Tokens?> read() async {
    if (!_loaded) {
      _loaded = true;
      try {
        _memory ??= await persistent.read();
      } on Object {
        // Unreadable store: behave as signed out.
      }
    }
    return _memory;
  }

  @override
  Future<void> write(Tokens tokens) async {
    _memory = tokens;
    _loaded = true;
    if (_remember()) {
      try {
        await persistent.write(tokens);
        return;
      } on Object {
        // Fall through: don't leave a stale session behind in the store.
      }
    }
    await _clearPersistent();
  }

  @override
  Future<void> clear() async {
    _memory = null;
    _loaded = true;
    await _clearPersistent();
  }

  Future<void> _clearPersistent() async {
    try {
      await persistent.clear();
    } on Object {
      // Nothing more we can do; memory is already cleared.
    }
  }
}

/// v0.0.1 stored tokens in plaintext shared preferences on desktop. Move them
/// into [secure] and always delete the plaintext copy, even if the move fails
/// (that only costs one sign-in).
Future<void> migrateLegacyTokens(SharedPreferences prefs, TokenStorage secure) async {
  final legacy = SharedPrefsTokenStorage(prefs);
  final tokens = await legacy.read();
  if (tokens == null) return;
  try {
    await secure.write(tokens);
  } on Object {
    // The user signs in again.
  }
  await legacy.clear();
}
