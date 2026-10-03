import 'package:chat_app/core/api_exception.dart';
import 'package:chat_app/ui/l10n.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

ApiException _error(int status, String code, {Map<String, String> fields = const {}, Duration? retryAfter}) =>
    ApiException(
      statusCode: status,
      code: code,
      message: 'Raw server text $code',
      fields: fields,
      retryAfter: retryAfter,
    );

void main() {
  final en = lookupAppLocalizations(const Locale('en'));
  final ar = lookupAppLocalizations(const Locale('ar'));
  final de = lookupAppLocalizations(const Locale('de'));

  group('errorMessage', () {
    test('maps every contract error code to a localized message', () {
      expect(errorMessage(en, ApiException.network()), en.networkError);
      expect(errorMessage(en, _error(401, 'INVALID_CREDENTIALS')), en.errorInvalidCredentials);
      expect(errorMessage(en, _error(429, 'RATE_LIMITED')), en.errorRateLimited);
      expect(errorMessage(en, _error(409, 'CONFLICT')), en.errorConflict);
      expect(errorMessage(en, _error(404, 'NOT_FOUND')), en.errorNotFound);
      expect(errorMessage(en, _error(403, 'FORBIDDEN')), en.errorForbidden);
      expect(errorMessage(en, _error(400, 'VALIDATION_ERROR')), en.errorValidation);
      expect(errorMessage(en, _error(401, 'UNAUTHENTICATED')), en.errorSessionExpired);
      expect(errorMessage(en, _error(401, 'TOKEN_EXPIRED')), en.errorSessionExpired);
      expect(errorMessage(en, _error(500, 'SERVER_ERROR')), en.somethingWentWrongRetry);
    });

    test('a proxy 502/503/504 means the server is unavailable', () {
      for (final status in [502, 503, 504]) {
        expect(errorMessage(en, _error(status, 'SERVER_ERROR')), en.errorServerUnavailable);
      }
    });

    test('an invalid reset token gets its own message', () {
      final e = _error(400, 'VALIDATION_ERROR', fields: {'token': 'This reset link is invalid or has expired.'});
      expect(errorMessage(en, e), en.errorResetCodeInvalid);
    });

    test('unknown codes fall back to a generic message, never the raw server text', () {
      final e = _error(418, 'SOMETHING_NEW');
      for (final l in [en, ar, de]) {
        expect(errorMessage(l, e), l.somethingWentWrongRetry);
        expect(errorMessage(l, e), isNot(contains('Raw server text')));
      }
    });

    test('a rate limit says how long to wait when the server sent Retry-After', () {
      String msg(AppLocalizations l, int seconds) =>
          errorMessage(l, _error(429, 'RATE_LIMITED', retryAfter: Duration(seconds: seconds)));
      expect(msg(en, 1), 'Too many attempts. Try again in 1 second.');
      expect(msg(en, 30), 'Too many attempts. Try again in 30 seconds.');
      expect(msg(en, 90), 'Too many attempts. Try again in 90 seconds.');
      // Longer waits round up to whole minutes.
      expect(msg(en, 91), 'Too many attempts. Try again in 2 minutes.');
      expect(msg(en, 900), 'Too many attempts. Try again in 15 minutes.');
      expect(msg(de, 60), 'Zu viele Versuche. Versuche es in 60 Sekunden erneut.');
      expect(msg(ar, 2), 'محاولات كثيرة جدًا. حاول مرة أخرى بعد ثانيتين.');
      expect(msg(ar, 5), 'محاولات كثيرة جدًا. حاول مرة أخرى بعد 5 ثوانٍ.');
      // Without (or with a useless) Retry-After, the generic message stays.
      expect(errorMessage(en, _error(429, 'RATE_LIMITED')), en.errorRateLimited);
      expect(msg(en, 0), en.errorRateLimited);
    });

    test('messages follow the UI language', () {
      final e = _error(401, 'INVALID_CREDENTIALS');
      expect(errorMessage(ar, e), 'اسم المستخدم أو كلمة المرور غير صحيحة.');
      expect(errorMessage(de, e), 'Benutzername oder Passwort ist falsch.');
    });
  });

  group('fieldErrors', () {
    test('localizes known conflict fields', () {
      final e = _error(409, 'CONFLICT', fields: {'username': 'x', 'email': 'y'});
      expect(fieldErrors(de, e), {'username': de.usernameTaken, 'email': de.emailTaken});
    });

    test('known validation fields get their rule, mirroring the backend validators', () {
      final e = _error(
        400,
        'VALIDATION_ERROR',
        fields: {
          'username': 'x',
          'email': 'x',
          'password': 'Password must be at most 72 bytes.',
          'newPassword': 'x',
          'displayName': 'x',
          'avatarUrl': 'x',
          'identifier': 'x',
        },
      );
      expect(fieldErrors(ar, e), {
        'username': ar.usernameInvalid,
        'email': ar.emailInvalid,
        'password': ar.passwordInvalid,
        'newPassword': ar.passwordInvalid,
        'displayName': ar.displayNameInvalid,
        'avatarUrl': ar.enterValidUrl,
        'identifier': ar.enterEmailOrUsername,
      });
    });

    test('other flagged fields get a generic hint instead of English server text', () {
      final e = _error(400, 'VALIDATION_ERROR', fields: {'limit': 'Number must be at most 50.'});
      expect(fieldErrors(ar, e), {'limit': ar.fieldInvalid});
    });
  });
}
