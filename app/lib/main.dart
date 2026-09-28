import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/api_client.dart';
import 'core/chat_api.dart';
import 'core/config.dart';
import 'core/realtime_client.dart';
import 'core/token_storage.dart';
import 'state/theme_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final tokens = SharedPrefsTokenStorage(prefs);
  final client = ApiClient(baseUrl: AppConfig.apiUrl, tokens: tokens);

  runApp(
    ChatApp(
      api: ChatApi(client),
      realtime: RealtimeClient(url: Uri.parse(AppConfig.wsUrl), tokens: tokens, refreshTokens: client.refreshTokens),
      themeController: ThemeController(prefs),
    ),
  );
}
