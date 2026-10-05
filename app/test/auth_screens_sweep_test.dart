// The signed-out screens (Login, Register, Forgot/Reset password) at the sizes, languages,
// text scales and themes the signed-in sweep covers. They are forms, so the failure to watch
// for is a field, label or button that overflows or is pushed out of reach rather than scrolled.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fake_backend.dart';
import 'support/harness.dart';

const _sizes = [Size(360, 640), Size(412, 915), Size(600, 960), Size(1280, 720)];
const _scales = [1.0, 2.0];

// Labels from lib/l10n/app_*.arb.
const _register = {'en': 'Register', 'ar': 'إنشاء حساب', 'de': 'Registrieren'};
const _back = {'en': 'Back', 'ar': 'رجوع', 'de': 'Zurück'};
const _forgot = {'en': 'Forgot password?', 'ar': 'نسيت كلمة المرور؟', 'de': 'Passwort vergessen?'};

void main() {
  for (final size in _sizes) {
    for (final locale in ['en', 'ar', 'de']) {
      for (final scale in _scales) {
        for (final theme in [ThemeMode.light, ThemeMode.dark]) {
          final name = '${size.width.toInt()}x${size.height.toInt()} $locale @${scale}x ${theme.name}';

          testWidgets('$name: Login, Register, Forgot password', (tester) async {
            await pumpApp(tester, FakeBackend(), size: size, locale: locale, themeMode: theme);
            tester.binding.platformDispatcher.textScaleFactorTestValue = scale;
            addTearDown(tester.binding.platformDispatcher.clearTextScaleFactorTestValue);
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull, reason: 'Login');

            Future<void> open(String label, String reason) async {
              final link = find.text(label).first;
              await tester.ensureVisible(link);
              await tester.pumpAndSettle();
              await tester.tap(link);
              await tester.pumpAndSettle();
              expect(tester.takeException(), isNull, reason: reason);
            }

            await open(_register[locale]!, 'Register');
            expect(find.byKey(const Key('register.username')), findsOneWidget);
            await tester.tap(find.byTooltip(_back[locale]!));
            await tester.pumpAndSettle();

            await open(_forgot[locale]!, 'Forgot password');
            expect(find.byKey(const Key('forgot.email')), findsOneWidget);
            await unmount(tester);
          });

          testWidgets('$name: reset screen opened from the emailed link', (tester) async {
            await pumpApp(
              tester,
              FakeBackend(),
              size: size,
              locale: locale,
              themeMode: theme,
              resetToken: FakeBackend.validResetCode,
            );
            tester.binding.platformDispatcher.textScaleFactorTestValue = scale;
            addTearDown(tester.binding.platformDispatcher.clearTextScaleFactorTestValue);
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
            expect(find.byKey(const Key('reset.code')), findsOneWidget);
            expect(find.byKey(const Key('reset.back')), findsOneWidget);
            await unmount(tester);
          });
        }
      }
    }
  }
}
