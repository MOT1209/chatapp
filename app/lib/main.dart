import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/api_client.dart';
import 'core/chat_api.dart';
import 'core/config.dart';
import 'core/realtime_client.dart';
import 'core/reset_link.dart';
import 'core/token_storage.dart';
import 'state/settings_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final settings = SettingsController(prefs);
  final TokenStorage persistent;
  if (kIsWeb) {
    // No OS credential store in the browser. Only the short-lived access token is
    // kept in localStorage; the refresh token stays in an HttpOnly cookie the
    // server sets, so XSS cannot read it (docs/api-contract.md §3.1).
    persistent = WebTokenStorage(prefs);
    await clearLegacyWebTokens(prefs);
  } else {
    persistent = SecureTokenStorage();
    await migrateLegacyTokens(prefs, persistent);
  }
  final tokens = RememberingTokenStorage(persistent, remember: () => settings.rememberSession);
  final client = ApiClient(baseUrl: AppConfig.apiUrl, tokens: tokens);

  runApp(
    ChatApp(
      api: ChatApi(client),
      realtime: RealtimeClient(url: Uri.parse(AppConfig.wsUrl), tokens: tokens, refreshTokens: client.refreshTokens),
      settings: settings,
      // Only the web build is ever opened from an emailed link; on other platforms
      // `Uri.base` is a file URI and yields null.
      initialResetToken: resetTokenFromUri(Uri.base),
    ),
  );
}
