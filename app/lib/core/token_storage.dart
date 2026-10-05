import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class Tokens {
  const Tokens(this.accessToken, this.refreshToken);
  final String accessToken;
  final String refreshToken;
}

/// A web client holds **only** the access token, in `localStorage`.
///
/// The refresh token is deliberately *not* persisted: it now lives in an `HttpOnly`
/// cookie that JavaScript cannot read, so there is nothing here for an injected
/// script to exfiltrate. `refreshToken` stays on the class because native platforms
/// store both tokens in the OS credential store — see [SecureTokenStorage].
abstract class TokenStorage {
  Future<Tokens?> read();
  Future<void> write(Tokens tokens);
  Future<void> clear();

  /// False on web, where the refresh token is a cookie rather than a stored value.
  /// The client uses this to decide whether a refresh call can carry a token body.
  bool get persistsRefreshToken;
}

/// Base for every native-side store, so each one does not restate that it handles
/// the refresh token itself. [WebTokenStorage] deliberately does not extend this.
abstract class _PersistRefreshTokenStorage implements TokenStorage {
  const _PersistRefreshTokenStorage();

  @override
  bool get persistsRefreshToken => true;
}

/// The OS credential store: Keychain (iOS, macOS), Keystore-backed encryption
/// (Android), DPAPI (Windows), libsecret (Linux).
///
/// macOS uses the legacy keychain: the data-protection keychain needs the
/// Keychain Sharing entitlement and a provisioning profile, without which an
/// unsigned build only launches on the Mac that built it.
class SecureTokenStorage extends _PersistRefreshTokenStorage {
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

/// Web only. `localStorage` is readable by any script on the origin, so this store
/// keeps nothing long-lived: [read] returns null as soon as the refresh token is
/// absent, and the client recovers the session from the cookie instead (see
/// `ApiClient.restoreSession`).
///
/// A v0.0.1/v0.0.2 build left both tokens in here. Reading that legacy copy is
/// intentionally not supported — [clearLegacyWebTokens] deletes it so an old
/// long-lived secret cannot sit in `localStorage` forever.
class WebTokenStorage implements TokenStorage {
  WebTokenStorage(this._prefs);

  final SharedPreferences _prefs;
  static const _accessKey = 'auth.accessToken';
  static const _legacyRefreshKey = 'auth.refreshToken';

  @override
  bool get persistsRefreshToken => false;

  @override
  Future<Tokens?> read() async {
    final access = _prefs.getString(_accessKey);
    if (access == null || access.isEmpty) return null;
    // The refresh token is a cookie the server owns; an empty placeholder keeps
    // call sites from having to special-case "web".
    return Tokens(access, '');
  }

  @override
  Future<void> write(Tokens tokens) async {
    await _prefs.setString(_accessKey, tokens.accessToken);
    // Never persist the refresh token on web, whatever the caller passes in.
    await _prefs.remove(_legacyRefreshKey);
  }

  @override
  Future<void> clear() async {
    await _prefs.remove(_accessKey);
    await _prefs.remove(_legacyRefreshKey);
  }
}

/// Removes a refresh token left in `localStorage` by an older build. Without this
/// the old token stays readable by any XSS on the origin indefinitely, which is
/// exactly the exposure the cookie migration removes.
Future<void> clearLegacyWebTokens(SharedPreferences prefs) async {
  await prefs.remove(WebTokenStorage._legacyRefreshKey);
}

class InMemoryTokenStorage extends _PersistRefreshTokenStorage {
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
class RememberingTokenStorage extends _PersistRefreshTokenStorage {
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
  const accessKey = 'auth.accessToken';
  const legacyRefreshKey = 'auth.refreshToken';
  final access = prefs.getString(accessKey);
  final refresh = prefs.getString(legacyRefreshKey);
  if (access != null && refresh != null) {
    try {
      await secure.write(Tokens(access, refresh));
    } on Object {
      // The user signs in again.
    }
  }
  await prefs.remove(accessKey);
  await prefs.remove(legacyRefreshKey);
}
