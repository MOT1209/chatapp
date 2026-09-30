import 'package:chat_app/core/api_exception.dart';
import 'package:chat_app/ui/l10n.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

ApiException _error(int status, String code, {Map<String, String> fields = const {}}) =>
    ApiException(statusCode: status, code: code, message: 'Raw server text $code', fields: fields);

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

    test('other flagged fields get a generic hint instead of English server text', () {
      final e = _error(400, 'VALIDATION_ERROR', fields: {'password': 'Password must be at most 72 bytes.'});
      expect(fieldErrors(ar, e), {'password': ar.fieldInvalid});
    });
  });
}
