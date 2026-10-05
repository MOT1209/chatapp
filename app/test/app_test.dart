import 'package:chat_app/core/token_storage.dart';
import 'package:chat_app/ui/screens/chat_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fake_backend.dart';
import 'support/harness.dart';

void main() {
  late FakeBackend backend;
  late String conversationId;

  setUp(() {
    backend = FakeBackend();
    backend.addUser('ahmad', password: 'secret-pass');
    backend.addUser('sara', online: true);
    conversationId = backend.addConversation(
      'ahmad',
      'sara',
      messages: [('sara', 'Hello 👋'), ('ahmad', 'How are you?')],
    );
  });

  group('Splash and auth', () {
    testWidgets('without a stored session the splash leads to Login', (tester) async {
      await pumpApp(tester, backend);
      expect(find.text('Welcome back'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Login'), findsOneWidget);
      await unmount(tester);
    });

    testWidgets('a valid stored session goes straight to Home', (tester) async {
      final token = backend.issueToken('u_ahmad');
      await pumpApp(tester, backend, storedTokens: Tokens(token, 'refresh'));
      expect(find.text('Chat App'), findsOneWidget);
      expect(find.text('Sara'), findsOneWidget);
      await unmount(tester);
    });

    testWidgets('login validates empty fields without calling the API', (tester) async {
      await pumpApp(tester, backend);
      await tester.tap(find.widgetWithText(FilledButton, 'Login'));
      await tester.pumpAndSettle();
      expect(find.text('Enter your email or username'), findsOneWidget);
      expect(find.text('Enter your password'), findsOneWidget);
      expect(backend.requests, isEmpty);
      await unmount(tester);
    });

    testWidgets('login maps the backend error code to a localized message', (tester) async {
      await pumpApp(tester, backend);
      await login(tester, 'ahmad', 'wrong-password');
      expect(find.text('Incorrect username or password.'), findsOneWidget);
      expect(find.text('Welcome back'), findsOneWidget);
      await unmount(tester);
    });

    testWidgets('login with username succeeds and opens Home', (tester) async {
      await pumpApp(tester, backend);
      await login(tester, 'ahmad', 'secret-pass');
      expect(find.text('Sara'), findsOneWidget);
      expect(find.text('How are you?', findRichText: true), findsNothing);
      expect(find.text('You: How are you?'), findsOneWidget);
      await unmount(tester);
    });

    testWidgets('register validates, then creates the account and opens Home', (tester) async {
      await pumpApp(tester, backend);
      await tester.tap(find.widgetWithText(TextButton, 'Register'));
      await tester.pumpAndSettle();
      expect(find.text('Create your account'), findsOneWidget);

      await tester.tap(find.widgetWithText(FilledButton, 'Register'));
      await tester.pumpAndSettle();
      expect(find.text('Choose a username'), findsOneWidget);
      expect(find.text('At least 8 characters'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('register.username')), 'omar');
      await tester.enterText(find.byKey(const Key('register.displayName')), 'Omar');
      await tester.enterText(find.byKey(const Key('register.email')), 'omar@example.com');
      await tester.enterText(find.byKey(const Key('register.password')), 'long-password');
      await tester.enterText(find.byKey(const Key('register.confirmPassword')), 'different');
      await tester.tap(find.widgetWithText(FilledButton, 'Register'));
      await tester.pumpAndSettle();
      expect(find.text('Passwords do not match'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('register.confirmPassword')), 'long-password');
      await tester.tap(find.widgetWithText(FilledButton, 'Register'));
      await tester.pumpAndSettle();

      expect(find.text('No conversations yet'), findsOneWidget);
      expect(find.text('Create your account'), findsNothing);
      await unmount(tester);
    });

    testWidgets('register shows a field error from the backend', (tester) async {
      await pumpApp(tester, backend);
      await tester.tap(find.widgetWithText(TextButton, 'Register'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('register.username')), 'sara');
      await tester.enterText(find.byKey(const Key('register.displayName')), 'Sara 2');
      await tester.enterText(find.byKey(const Key('register.email')), 'sara2@example.com');
      await tester.enterText(find.byKey(const Key('register.password')), 'long-password');
      await tester.enterText(find.byKey(const Key('register.confirmPassword')), 'long-password');
      await tester.tap(find.widgetWithText(FilledButton, 'Register'));
      await tester.pumpAndSettle();
      expect(find.text('Username or email is already in use.'), findsOneWidget);
      expect(find.text('This username is already taken.'), findsOneWidget);
      // The server's English text never reaches the UI.
      expect(find.text('Username is already taken.'), findsNothing);
      await unmount(tester);
    });

    testWidgets('forgot password requests a code, then resets with it', (tester) async {
      await pumpApp(tester, backend);
      await tester.tap(find.text('Forgot password?'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('forgot.email')), 'ahmad@example.com');
      await tester.tap(find.widgetWithText(FilledButton, 'Send reset code'));
      await tester.pumpAndSettle();
      expect(backend.forgotPasswordEmails, ['ahmad@example.com']);
      expect(find.textContaining('a reset code is on its way'), findsOneWidget);

      await tester.tap(find.text('I have a reset code'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('reset.code')), 'wrong');
      await tester.enterText(find.byKey(const Key('reset.password')), 'new-password');
      await tester.enterText(find.byKey(const Key('reset.confirm')), 'new-password');
      await tester.tap(find.widgetWithText(FilledButton, 'Set new password'));
      await tester.pumpAndSettle();
      expect(find.text('This reset code is invalid or has expired.'), findsWidgets);
      expect(find.text('Invalid code.'), findsNothing);

      await tester.enterText(find.byKey(const Key('reset.code')), FakeBackend.validResetCode);
      await tester.tap(find.widgetWithText(FilledButton, 'Set new password'));
      await tester.pumpAndSettle();
      expect(find.text('Welcome back'), findsOneWidget);
      expect(find.text('Password updated. You can log in now.'), findsOneWidget);
      await unmount(tester);
    });

    testWidgets('an invalid token mid-session signs the user out', (tester) async {
      await pumpApp(tester, backend, storedTokens: Tokens(backend.issueToken('u_ahmad'), 'r'));
      expect(find.text('Sara'), findsOneWidget);
      backend.revokeAllTokens();
      await tester.drag(find.text('Sara'), const Offset(0, 300));
      await tester.pumpAndSettle();
      expect(find.text('Welcome back'), findsOneWidget);
      await unmount(tester);
    });

    testWidgets('"Keep me signed in" stores the session on the device by default', (tester) async {
      final device = InMemoryTokenStorage();
      await pumpApp(tester, backend, deviceStore: device);
      await login(tester, 'ahmad', 'secret-pass');
      expect(await device.read(), isNotNull);
      await unmount(tester);
    });

    testWidgets('unticking "Keep me signed in" keeps the session in memory only', (tester) async {
      final device = InMemoryTokenStorage();
      await pumpApp(tester, backend, deviceStore: device);
      await tester.tap(find.byKey(const Key('login.remember')));
      await tester.pumpAndSettle();
      await login(tester, 'ahmad', 'secret-pass');
      expect(find.text('No conversations yet'), findsNothing);
      expect(find.text('Sara'), findsOneWidget);
      expect(await device.read(), isNull);
      await unmount(tester);
    });

    testWidgets('logout disconnects the realtime socket', (tester) async {
      await pumpApp(tester, backend);
      await login(tester, 'ahmad', 'secret-pass');
      expect(backend.sockets.last.open, isTrue);
      await tester.tap(find.text('Profile'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(OutlinedButton, 'Logout'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Logout'));
      await tester.pumpAndSettle();
      expect(backend.sockets.last.open, isFalse);
      await unmount(tester);
    });

    testWidgets('logout returns to Login', (tester) async {
      await pumpApp(tester, backend);
      await login(tester, 'ahmad', 'secret-pass');
      await tester.tap(find.text('Profile'));
      await tester.pumpAndSettle();
      expect(find.text('@ahmad'), findsOneWidget);
      await tester.tap(find.widgetWithText(OutlinedButton, 'Logout'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Logout'));
      await tester.pumpAndSettle();
      expect(find.text('Welcome back'), findsOneWidget);
      // The server can only revoke the session after the access token expired if it gets the refresh token.
      final logoutRequest = backend.requests.lastWhere((r) => r.url.path == '/api/auth/logout');
      expect(logoutRequest.body, contains('refreshToken'));
      await unmount(tester);
    });
  });

  group('Chat', () {
    Future<void> openSara(WidgetTester tester, {Size size = phone}) async {
      await pumpApp(tester, backend, size: size, storedTokens: Tokens(backend.issueToken('u_ahmad'), 'r'));
      await tester.tap(find.text('Sara'));
      await tester.pumpAndSettle();
    }

    testWidgets('opening a chat on mobile shows it full screen, back returns to the list', (tester) async {
      await openSara(tester);
      expect(find.byType(ChatScreen), findsOneWidget);
      expect(find.byType(NavigationBar), findsNothing);
      expect(find.text('Hello 👋'), findsOneWidget);
      expect(find.text('How are you?'), findsOneWidget);
      expect(find.text('Online'), findsOneWidget);

      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      expect(find.byType(ChatScreen), findsNothing);
      expect(find.byType(NavigationBar), findsOneWidget);
      await unmount(tester);
    });

    testWidgets('sending a message shows it and posts it with a clientId', (tester) async {
      await openSara(tester);
      await tester.enterText(find.byKey(const Key('chat.input')), '  See you soon  ');
      await tester.pump();
      await tester.tap(find.byKey(const Key('chat.send')));
      await tester.pumpAndSettle();

      expect(find.text('See you soon'), findsOneWidget);
      final stored = backend.messagesIn(conversationId).last;
      expect(stored['body'], 'See you soon');
      expect(stored['clientId'], isNotEmpty);
      expect(find.bySemanticsLabel(RegExp('You, .*, Sent')), findsWidgets);
      await unmount(tester);
    });

    testWidgets('a read receipt from the participant turns my sent tick into "Read"', (tester) async {
      await openSara(tester);
      await tester.enterText(find.byKey(const Key('chat.input')), 'See you soon');
      await tester.pump();
      await tester.tap(find.byKey(const Key('chat.send')));
      await tester.pumpAndSettle();
      expect(find.bySemanticsLabel(RegExp('You, .*, Sent')), findsWidgets);

      final sent = backend.messagesIn(conversationId).last;
      backend.push('read', {
        'conversationId': conversationId,
        'userId': 'u_sara',
        'messageId': sent['id'],
        'readAt': '2026-09-28T13:05:00.000Z',
      });
      await tester.pumpAndSettle();
      expect(find.bySemanticsLabel(RegExp('You, .*, Read')), findsWidgets);
      await unmount(tester);
    });

    testWidgets('a failed send stays visible and can be retried', (tester) async {
      await openSara(tester);
      backend.failNextSend = true;
      await tester.enterText(find.byKey(const Key('chat.input')), 'Flaky network');
      await tester.pump();
      await tester.tap(find.byKey(const Key('chat.send')));
      await tester.pumpAndSettle();
      expect(find.text('Flaky network'), findsOneWidget);
      expect(find.text('Not sent. Tap to retry'), findsOneWidget);

      await tester.tap(find.text('Not sent. Tap to retry'));
      await tester.pumpAndSettle();
      expect(find.text('Not sent. Tap to retry'), findsNothing);
      expect(backend.messagesIn(conversationId).last['body'], 'Flaky network');
      await unmount(tester);
    });

    testWidgets('a realtime message appears in the open chat', (tester) async {
      await openSara(tester);
      backend.deliverFrom('sara', conversationId, 'Are you there?');
      await tester.pumpAndSettle();
      expect(find.text('Are you there?'), findsOneWidget);
      await unmount(tester);
    });

    testWidgets('a realtime message updates the list and unread badge', (tester) async {
      await pumpApp(tester, backend, storedTokens: Tokens(backend.issueToken('u_ahmad'), 'r'));
      backend.deliverFrom('sara', conversationId, 'Ping from Sara');
      await tester.pumpAndSettle();
      expect(find.text('Ping from Sara'), findsOneWidget);
      expect(find.descendant(of: find.byType(Badge), matching: find.text('1')), findsOneWidget);
      await unmount(tester);
    });

    testWidgets('typing from the participant shows in the header and clears itself', (tester) async {
      await openSara(tester);
      backend.push('typing', {'conversationId': conversationId, 'userId': 'u_sara', 'isTyping': true});
      // A bounded pump, not pumpAndSettle: the typing flag self-clears after 3s
      // (contract §4.6), so settling the whole tree would expire it before the
      // first assertion.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      // Named, not a bare "typing…", so it is clear who is typing.
      expect(find.text('Sara is typing…'), findsOneWidget);
      await tester.pump(const Duration(seconds: 4));
      expect(find.text('Sara is typing…'), findsNothing);
      expect(find.text('Online'), findsOneWidget);
      await unmount(tester);
    });

    testWidgets('typing in the composer sends typing frames, then stops on send', (tester) async {
      await openSara(tester);
      await tester.enterText(find.byKey(const Key('chat.input')), 'Hel');
      await tester.pump();
      final socket = backend.sockets.last;
      List<Object?> typingFrames() =>
          socket.sent.where((f) => f['type'] == 'typing').map((f) => (f['payload'] as Map)['isTyping']).toList();
      expect(typingFrames(), [true]);
      await tester.tap(find.byKey(const Key('chat.send')));
      await tester.pumpAndSettle();
      expect(typingFrames(), [true, false]);
      await unmount(tester);
    });

    testWidgets('long-press deletes my own message after confirmation', (tester) async {
      await openSara(tester);
      await tester.longPress(find.text('How are you?'));
      await tester.pumpAndSettle();
      expect(find.text('Delete this message for everyone?'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
      await tester.pumpAndSettle();
      expect(find.text('How are you?'), findsNothing);
      expect(find.text('This message was deleted'), findsWidgets);
      expect(backend.messagesIn(conversationId).last['deletedAt'], isNotNull);
      await unmount(tester);
    });

    testWidgets("other people's messages cannot be deleted", (tester) async {
      await openSara(tester);
      await tester.longPress(find.text('Hello 👋'));
      await tester.pumpAndSettle();
      expect(find.text('Delete this message for everyone?'), findsNothing);
      await unmount(tester);
    });

    testWidgets('a deletion by the other person arrives in realtime', (tester) async {
      await openSara(tester);
      final message = backend.messagesIn(conversationId).first
        ..['body'] = ''
        ..['deletedAt'] = '2026-09-28T13:00:00.000Z';
      backend.push('message:updated', {'message': message});
      await tester.pumpAndSettle();
      expect(find.text('Hello 👋'), findsNothing);
      expect(find.text('This message was deleted'), findsOneWidget);
      await unmount(tester);
    });

    testWidgets('an unread message deleted by its sender clears the badge and preview', (tester) async {
      await pumpApp(tester, backend, storedTokens: Tokens(backend.issueToken('u_ahmad'), 'r'));
      final message = backend.deliverFrom('sara', conversationId, 'Oops, wrong chat');
      await tester.pumpAndSettle();
      expect(find.descendant(of: find.byType(Badge), matching: find.text('1')), findsOneWidget);

      message
        ..['body'] = ''
        ..['deletedAt'] = '2026-09-28T13:00:00.000Z';
      backend.push('message:updated', {'message': message});
      await tester.pumpAndSettle();
      expect(find.byType(Badge), findsNothing);
      expect(find.text('You: How are you?'), findsOneWidget);
      await unmount(tester);
    });

    testWidgets('search finds people and starts a conversation', (tester) async {
      backend.addUser('samir');
      await pumpApp(tester, backend, storedTokens: Tokens(backend.issueToken('u_ahmad'), 'r'));
      await tester.enterText(find.byKey(const Key('home.search')), 'sam');
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pumpAndSettle();
      expect(find.text('@samir'), findsOneWidget);

      await tester.tap(find.text('@samir'));
      await tester.pumpAndSettle();
      expect(find.byType(ChatScreen), findsOneWidget);
      expect(find.text('No messages yet'), findsOneWidget);
      await unmount(tester);
    });
  });

  group('New chat', () {
    testWidgets('the phone FAB focuses search', (tester) async {
      await pumpApp(tester, backend, storedTokens: Tokens(backend.issueToken('u_ahmad'), 'r'));
      await tester.tap(find.byKey(const Key('home.newChat')));
      await tester.pumpAndSettle();
      expect(Focus.of(tester.element(find.byKey(const Key('home.search')))).hasFocus, isTrue);
      await unmount(tester);
    });

    testWidgets('on desktop, the header button and Ctrl+K both focus search', (tester) async {
      await pumpApp(tester, backend, size: desktop, storedTokens: Tokens(backend.issueToken('u_ahmad'), 'r'));
      await tester.tap(find.text('Sara'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('home.newChat')));
      await tester.pumpAndSettle();
      expect(find.byType(ChatScreen), findsNothing);
      expect(Focus.of(tester.element(find.byKey(const Key('home.search')))).hasFocus, isTrue);

      await tester.tap(find.text('Sara'));
      await tester.pumpAndSettle();
      await simulateKeyDownEvent(LogicalKeyboardKey.controlLeft);
      await simulateKeyDownEvent(LogicalKeyboardKey.keyK);
      await simulateKeyUpEvent(LogicalKeyboardKey.keyK);
      await simulateKeyUpEvent(LogicalKeyboardKey.controlLeft);
      await tester.pumpAndSettle();
      expect(find.byType(ChatScreen), findsNothing);
      await unmount(tester);
    });

    testWidgets('on desktop, Escape closes the open chat', (tester) async {
      await pumpApp(tester, backend, size: desktop, storedTokens: Tokens(backend.issueToken('u_ahmad'), 'r'));
      await tester.tap(find.text('Sara'));
      await tester.pumpAndSettle();
      expect(find.byType(ChatScreen), findsOneWidget);
      await simulateKeyDownEvent(LogicalKeyboardKey.escape);
      await simulateKeyUpEvent(LogicalKeyboardKey.escape);
      await tester.pumpAndSettle();
      expect(find.byType(ChatScreen), findsNothing);
      await unmount(tester);
    });
  });

  group('Responsive layout', () {
    Future<void> signedIn(WidgetTester tester, Size size) =>
        pumpApp(tester, backend, size: size, storedTokens: Tokens(backend.issueToken('u_ahmad'), 'r'));

    testWidgets('phone uses bottom navigation', (tester) async {
      await signedIn(tester, phone);
      expect(find.byType(NavigationBar), findsOneWidget);
      expect(find.byType(NavigationRail), findsNothing);
      await unmount(tester);
    });

    testWidgets('tablet shows rail, sidebar and chat area side by side', (tester) async {
      await signedIn(tester, tablet);
      expect(find.byType(NavigationRail), findsOneWidget);
      expect(find.text('Select a conversation'), findsOneWidget);
      await unmount(tester);
    });

    testWidgets('desktop keeps the list visible while a chat is open', (tester) async {
      await signedIn(tester, desktop);
      expect(find.byType(NavigationBar), findsNothing);
      await tester.tap(find.text('Sara'));
      await tester.pumpAndSettle();
      expect(find.byType(ChatScreen), findsOneWidget);
      expect(find.byKey(const Key('home.search')), findsOneWidget);
      expect(find.byTooltip('Back'), findsNothing);
      expect(tester.takeException(), isNull);
      await unmount(tester);
    });
  });

  group('Connection banner', () {
    testWidgets('shows lost, retries on demand, then confirms "Connected" and hides', (tester) async {
      await pumpApp(
        tester,
        backend,
        storedTokens: Tokens(backend.issueToken('u_ahmad'), 'r'),
        backoff: const Duration(seconds: 1),
      );
      await tester.pump(const Duration(seconds: 1));
      expect(find.byKey(const Key('connection.banner')), findsNothing);

      backend.refuseConnections = true;
      backend.sockets.last.serverClose(1006);
      await tester.pump();
      await tester.pump();
      expect(find.text('Reconnecting…'), findsOneWidget);

      for (var i = 0; i < 3; i++) {
        await tester.pump(const Duration(seconds: 1));
      }
      expect(find.text('No connection. Retrying…'), findsOneWidget);

      backend.refuseConnections = false;
      await tester.tap(find.text('Retry now'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 250));
      expect(find.text('Connected'), findsOneWidget);
      // The list is re-fetched from REST after reconnecting.
      expect(find.text('Sara'), findsOneWidget);

      await tester.pump(const Duration(seconds: 2));
      await tester.pump(const Duration(milliseconds: 250));
      expect(find.byKey(const Key('connection.banner')), findsNothing);
      await unmount(tester);
    });

    testWidgets('a full-screen chat on a phone shows the banner too', (tester) async {
      await pumpApp(
        tester,
        backend,
        storedTokens: Tokens(backend.issueToken('u_ahmad'), 'r'),
        backoff: const Duration(seconds: 1),
      );
      await tester.tap(find.text('Sara'));
      await tester.pumpAndSettle();
      backend.refuseConnections = true;
      backend.sockets.last.serverClose(1006);
      await tester.pump();
      await tester.pump();
      expect(find.text('Reconnecting…'), findsOneWidget);
      await unmount(tester);
    });
  });

  group('German', () {
    testWidgets('login and home render in German', (tester) async {
      await pumpApp(tester, backend, locale: 'de');
      expect(find.text('Willkommen zurück'), findsOneWidget);
      await login(tester, 'ahmad', 'wrong-password', button: 'Anmelden');
      expect(find.text('Benutzername oder Passwort ist falsch.'), findsOneWidget);
      await login(tester, 'ahmad', 'secret-pass', button: 'Anmelden');
      expect(find.text('Chats'), findsWidgets);
      expect(find.text('Profil'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await unmount(tester);
    });

    testWidgets('German can be picked from Profile', (tester) async {
      await pumpApp(tester, backend, storedTokens: Tokens(backend.issueToken('u_ahmad'), 'r'));
      await tester.tap(find.text('Profile'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Deutsch'));
      await tester.pumpAndSettle();
      expect(find.text('Abmelden'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await unmount(tester);
    });
  });

  group('Arabic', () {
    testWidgets('login renders right-to-left in Arabic', (tester) async {
      await pumpApp(tester, backend, locale: 'ar');
      expect(find.text('مرحبًا بعودتك'), findsOneWidget);
      expect(Directionality.of(tester.element(find.text('مرحبًا بعودتك'))), TextDirection.rtl);
      await login(tester, 'ahmad', 'secret-pass', button: 'تسجيل الدخول');
      expect(find.text('المحادثات'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await unmount(tester);
    });

    testWidgets('the bubble for my message sits on the left in RTL', (tester) async {
      await pumpApp(tester, backend, locale: 'ar', storedTokens: Tokens(backend.issueToken('u_ahmad'), 'r'));
      await tester.tap(find.text('Sara'));
      await tester.pumpAndSettle();
      final mine = tester.getCenter(find.text('How are you?')).dx;
      final theirs = tester.getCenter(find.text('Hello 👋')).dx;
      expect(mine, lessThan(theirs));
      expect(find.text('متصل الآن'), findsOneWidget);
      await unmount(tester);
    });

    testWidgets('language can be switched from Profile', (tester) async {
      await pumpApp(tester, backend, storedTokens: Tokens(backend.issueToken('u_ahmad'), 'r'));
      await tester.tap(find.text('Profile'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('العربية'));
      await tester.pumpAndSettle();
      expect(find.text('الملف الشخصي'), findsWidgets);
      expect(find.text('تسجيل الخروج'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await unmount(tester);
    });
  });
}
