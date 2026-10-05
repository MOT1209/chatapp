// Section 16 ("Responsive Design") and 20 ("Accessibility") of the brief: no
// overflow, clipping or broken layout at phone, tablet or desktop sizes, in
// either language, at normal and larger text scale.
import 'package:chat_app/ui/screens/chat_screen.dart';
import 'package:chat_app/ui/screens/profile_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fake_backend.dart';
import 'support/harness.dart';

const _sizes = [
  Size(360, 640), // small/old Android phone
  Size(360, 800), // smallest common Android phone
  Size(390, 844),
  Size(412, 915),
  Size(600, 960), // tablet, narrow edge of the tablet layout
  Size(768, 1024),
  Size(900, 1200),
  Size(1023, 768), // one pixel below the desktop breakpoint
  Size(1024, 768), // desktop breakpoint
  Size(1280, 720),
  Size(1366, 768),
  Size(1440, 900),
  Size(1920, 1080),
];

// Labels the sweep taps; they come from lib/l10n/app_*.arb.
const _login = {'en': 'Login', 'ar': 'تسجيل الدخول', 'de': 'Anmelden'};
const _back = {'en': 'Back', 'ar': 'رجوع', 'de': 'Zurück'};
const _profile = {'en': 'Profile', 'ar': 'الملف الشخصي', 'de': 'Profil'};

// 2.0 is the largest text size iOS and Android offer in accessibility settings.
const _scales = [1.0, 1.5, 2.0];

void main() {
  late FakeBackend backend;

  setUp(() {
    backend = FakeBackend();
    backend.addUser('ahmad', password: 'secret-pass');
    // A long name and a long last message are the likeliest overflow triggers.
    backend.addUser('fatima-al-zahra-abdulrahman', online: true);
    backend.addConversation(
      'ahmad',
      'fatima-al-zahra-abdulrahman',
      messages: [
        ('fatima-al-zahra-abdulrahman', 'This is a fairly long message to check wrapping and bubble sizing works.'),
        ('ahmad', 'A reply.'),
      ],
    );
  });

  for (final size in _sizes) {
    for (final locale in ['en', 'ar', 'de']) {
      for (final textScale in _scales) {
        // Dark mode is a different set of colours, not a different layout, so it is swept at the
        // extremes of size and text scale rather than across the whole matrix.
        final themes = [
          ThemeMode.light,
          if (size.width == 360 && size.height == 640 || size.width == 412 || size.width == 768 || size.width == 1280)
            ThemeMode.dark,
        ];
        for (final themeMode in themes) {
          testWidgets(
            '${size.width.toInt()}x${size.height.toInt()} $locale @${textScale}x ${themeMode.name}: Login, Home, Chat, Profile',
            (tester) async {
              tester.view.devicePixelRatio = 1;
              await pumpApp(tester, backend, size: size, locale: locale, themeMode: themeMode);
              tester.binding.platformDispatcher.textScaleFactorTestValue = textScale;
              addTearDown(tester.binding.platformDispatcher.clearTextScaleFactorTestValue);
              await tester.pumpAndSettle();
              expect(tester.takeException(), isNull, reason: 'Login');

              await login(tester, 'ahmad', 'secret-pass', button: _login[locale]!);
              expect(tester.takeException(), isNull, reason: 'Home (after login)');

              // Compact layouts show Chat full-screen; wider ones show it beside the list.
              // FakeBackend.addUser title-cases the first letter for displayName.
              final conversationTile = find.text('Fatima-al-zahra-abdulrahman');
              if (tester.any(conversationTile)) {
                await tester.tap(conversationTile);
                await tester.pumpAndSettle();
              }
              expect(tester.takeException(), isNull, reason: 'Chat');
              expect(find.byType(ChatScreen), findsOneWidget);

              // On a compact layout Chat is full-screen with only a back button; go
              // back so the Profile tab/destination is reachable, as on wider layouts.
              final backButton = find.byTooltip(_back[locale]!);
              if (tester.any(backButton)) {
                await tester.tap(backButton);
                await tester.pumpAndSettle();
              }

              final profileLabel = find.text(_profile[locale]!);
              if (tester.any(profileLabel)) {
                await tester.tap(profileLabel.first);
                await tester.pumpAndSettle();
              }
              expect(tester.takeException(), isNull, reason: 'Profile');
              expect(find.byType(ProfileScreen), findsOneWidget);

              await unmount(tester);
            },
          );
        }
      }
    }
  }
}
