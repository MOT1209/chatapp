import 'package:flutter/foundation.dart';

import '../core/api_exception.dart';
import '../core/chat_api.dart';
import '../models/user.dart';

enum SessionStatus { unknown, authenticated, unauthenticated }

class SessionController extends ChangeNotifier {
  SessionController(this._api) {
    _api.client.onSessionExpired = _expire;
  }

  final ChatApi _api;

  SessionStatus _status = SessionStatus.unknown;
  SessionStatus get status => _status;

  User? _user;
  User? get user => _user;

  /// Set when restoring the session failed for a reason other than a bad token.
  ApiException? _restoreError;
  ApiException? get restoreError => _restoreError;

  /// Contract §5.1: validate any stored token with `GET /users/me` on boot.
  Future<void> restore() async {
    _restoreError = null;
    _status = SessionStatus.unknown;
    notifyListeners();
    if (!await _api.hasStoredSession()) {
      _setUser(null);
      return;
    }
    try {
      _setUser(await _api.me());
    } on ApiException catch (e) {
      if (e.statusCode == 401) {
        await _api.logout();
        _setUser(null);
      } else {
        _restoreError = e;
        notifyListeners();
      }
    }
  }

  Future<void> login(String identifier, String password) async =>
      _setUser(await _api.login(identifier: identifier, password: password));

  Future<void> register({
    required String username,
    required String email,
    required String password,
    required String displayName,
  }) async =>
      _setUser(await _api.register(username: username, email: email, password: password, displayName: displayName));

  Future<void> updateProfile({String? displayName, String? avatarUrl}) async =>
      _setUser(await _api.updateMe(displayName: displayName, avatarUrl: avatarUrl));

  Future<void> logout() async {
    await _api.logout();
    _setUser(null);
  }

  void _expire() => _setUser(null);

  void _setUser(User? user) {
    _user = user;
    _status = user == null ? SessionStatus.unauthenticated : SessionStatus.authenticated;
    notifyListeners();
  }
}
