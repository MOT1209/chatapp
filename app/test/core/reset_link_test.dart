import 'package:chat_app/core/reset_link.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('resetTokenFromUri', () {
    test('reads the token from the emailed link', () {
      expect(resetTokenFromUri(Uri.parse('https://chat.example.com/reset-password?token=abc123')), 'abc123');
    });

    test('decodes a percent-encoded token', () {
      expect(resetTokenFromUri(Uri.parse('https://x.io/reset-password?token=a%2Bb%3D')), 'a+b=');
    });

    test('tolerates a trailing slash and a hosting sub-path', () {
      expect(resetTokenFromUri(Uri.parse('https://x.io/reset-password/?token=t1')), 't1');
      expect(resetTokenFromUri(Uri.parse('https://x.io/chat/app/reset-password?token=t2')), 't2');
    });

    test('also works when the web build uses hash routing', () {
      expect(resetTokenFromUri(Uri.parse('https://x.io/#/reset-password?token=t3')), 't3');
      expect(resetTokenFromUri(Uri.parse('https://x.io/#reset-password?token=t4')), 't4');
    });

    test('ignores other pages, even with a token parameter', () {
      expect(resetTokenFromUri(Uri.parse('https://x.io/?token=abc')), isNull);
      expect(resetTokenFromUri(Uri.parse('https://x.io/login?token=abc')), isNull);
      expect(resetTokenFromUri(Uri.parse('https://x.io/not-reset-password?token=abc')), isNull);
    });

    test('ignores a missing, empty or blank token', () {
      expect(resetTokenFromUri(Uri.parse('https://x.io/reset-password')), isNull);
      expect(resetTokenFromUri(Uri.parse('https://x.io/reset-password?token=')), isNull);
      expect(resetTokenFromUri(Uri.parse('https://x.io/reset-password?token=%20%20')), isNull);
    });

    test('a native file URI (Uri.base outside the browser) yields nothing', () {
      expect(resetTokenFromUri(Uri.parse('file:///home/user/app/')), isNull);
    });
  });
}
