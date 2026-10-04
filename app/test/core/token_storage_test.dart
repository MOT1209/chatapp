import 'package:chat_app/core/token_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A credential store that is unavailable, like Linux without a keyring.
class _BrokenStorage implements TokenStorage {
  @override
  bool get persistsRefreshToken => throw StateError('no keyring');
  @override
  Future<Tokens?> read() => throw StateError('no keyring');
  @override
  Future<void> write(Tokens tokens) => throw StateError('no keyring');
  @override
  Future<void> clear() => throw StateError('no keyring');
}

void main() {
  const tokens = Tokens('access', 'refresh');

  group('RememberingTokenStorage', () {
    test('"keep me signed in" on: tokens reach the device store', () async {
      final device = InMemoryTokenStorage();
      final storage = RememberingTokenStorage(device, remember: () => true);
      await storage.write(tokens);
      expect((await device.read())?.refreshToken, 'refresh');
      expect((await storage.read())?.accessToken, 'access');
    });

    test('"keep me signed in" off: memory only, and an older stored session is removed', () async {
      final device = InMemoryTokenStorage(const Tokens('old', 'old'));
      final storage = RememberingTokenStorage(device, remember: () => false);
      await storage.write(tokens);
      expect(await device.read(), isNull);
      expect((await storage.read())?.accessToken, 'access');
    });

    test('restores a stored session on launch', () async {
      final storage = RememberingTokenStorage(InMemoryTokenStorage(tokens), remember: () => true);
      expect((await storage.read())?.accessToken, 'access');
    });

    test('clear signs out everywhere', () async {
      final device = InMemoryTokenStorage(tokens);
      final storage = RememberingTokenStorage(device, remember: () => true);
      await storage.clear();
      expect(await storage.read(), isNull);
      expect(await device.read(), isNull);
    });

    test('a broken credential store degrades to memory only, never throws', () async {
      final storage = RememberingTokenStorage(_BrokenStorage(), remember: () => true);
      expect(await storage.read(), isNull);
      await storage.write(tokens);
      expect((await storage.read())?.accessToken, 'access');
      await storage.clear();
      expect(await storage.read(), isNull);
    });
  });

  group('migrateLegacyTokens', () {
    test('moves v0.0.1 plaintext tokens into the secure store and deletes them', () async {
      SharedPreferences.setMockInitialValues({'auth.accessToken': 'a', 'auth.refreshToken': 'r'});
      final prefs = await SharedPreferences.getInstance();
      final secure = InMemoryTokenStorage();
      await migrateLegacyTokens(prefs, secure);
      expect((await secure.read())?.refreshToken, 'r');
      expect(prefs.getString('auth.accessToken'), isNull);
      expect(prefs.getString('auth.refreshToken'), isNull);
    });

    test('deletes the plaintext copy even when the secure store fails', () async {
      SharedPreferences.setMockInitialValues({'auth.accessToken': 'a', 'auth.refreshToken': 'r'});
      final prefs = await SharedPreferences.getInstance();
      await migrateLegacyTokens(prefs, _BrokenStorage());
      expect(prefs.getString('auth.refreshToken'), isNull);
    });

    test('does nothing without legacy tokens', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final secure = InMemoryTokenStorage(tokens);
      await migrateLegacyTokens(prefs, secure);
      expect((await secure.read())?.accessToken, 'access');
    });
  });
}
