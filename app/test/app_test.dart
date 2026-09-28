import 'package:chat_app/core/token_storage.dart';
import 'package:chat_app/ui/screens/chat_screen.dart';
import 'package:flutter/material.dart';
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

    testWidgets('login shows the backend error verbatim', (tester) async {
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
      expect(find.text('Username is already taken.'), findsNWidgets(2));
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
      expect(find.bySemanticsLabel(RegExp('You, .*, sent')), findsWidgets);
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
}
