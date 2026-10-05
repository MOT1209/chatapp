import 'package:chat_app/app.dart';
import 'package:chat_app/core/api_client.dart';
import 'package:chat_app/core/chat_api.dart';
import 'package:chat_app/core/realtime_client.dart';
import 'package:chat_app/core/token_storage.dart';
import 'package:chat_app/state/settings_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_backend.dart';

const phone = Size(390, 844);
const tablet = Size(820, 1180);
const desktop = Size(1280, 800);

Future<void> pumpApp(
  WidgetTester tester,
  FakeBackend backend, {
  Size size = phone,
  Tokens? storedTokens,
  String locale = 'en',
  Duration backoff = Duration.zero,
  InMemoryTokenStorage? deviceStore,
  String? resetToken,
  ThemeMode themeMode = ThemeMode.light,
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size;
  addTearDown(tester.view.reset);

  SharedPreferences.setMockInitialValues({'ui.locale': locale, 'ui.themeMode': themeMode.name});
  final prefs = await SharedPreferences.getInstance();
  final settings = SettingsController(prefs);
  // Same wiring as main.dart; [deviceStore] stands in for the OS credential store.
  final tokens = RememberingTokenStorage(
    deviceStore ?? InMemoryTokenStorage(storedTokens),
    remember: () => settings.rememberSession,
  );
  final client = ApiClient(baseUrl: 'http://test', tokens: tokens, httpClient: backend.httpClient);

  await tester.pumpWidget(
    ChatApp(
      api: ChatApi(client),
      realtime: RealtimeClient(
        url: Uri.parse('ws://test/ws'),
        tokens: tokens,
        refreshTokens: client.refreshTokens,
        connector: backend.connect,
        backoff: (_) => backoff,
      ),
      settings: settings,
      initialResetToken: resetToken,
    ),
  );
  await tester.pumpAndSettle();
}

/// Unmounts the app so sockets and timers are torn down before the test ends.
Future<void> unmount(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump();
}

Future<void> login(WidgetTester tester, String identifier, String password, {String button = 'Login'}) async {
  await tester.enterText(find.byKey(const Key('login.identifier')), identifier);
  await tester.enterText(find.byKey(const Key('login.password')), password);
  final submit = find.widgetWithText(FilledButton, button);
  // At large text sizes the form is taller than a short window and scrolls; a user would
  // scroll to the button, so the test must too instead of tapping blind below the fold.
  await tester.ensureVisible(submit);
  await tester.pumpAndSettle();
  await tester.tap(submit);
  await tester.pumpAndSettle();
}
