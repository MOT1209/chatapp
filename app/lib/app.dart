import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/chat_api.dart';
import 'core/realtime_client.dart';
import 'state/conversations_controller.dart';
import 'state/session_controller.dart';
import 'state/theme_controller.dart';
import 'ui/screens/home_screen.dart';
import 'ui/screens/login_screen.dart';
import 'ui/screens/splash_screen.dart';
import 'ui/theme.dart';

class ChatApp extends StatefulWidget {
  const ChatApp({super.key, required this.api, required this.realtime, required this.themeController});

  final ChatApi api;
  final RealtimeClient realtime;
  final ThemeController themeController;

  @override
  State<ChatApp> createState() => _ChatAppState();
}

class _ChatAppState extends State<ChatApp> {
  final _navigatorKey = GlobalKey<NavigatorState>();
  late final SessionController _session;
  SessionStatus? _lastStatus;

  @override
  void initState() {
    super.initState();
    _session = SessionController(widget.api)..addListener(_onSessionChanged);
    _session.restore();
  }

  /// Signing in or out swaps the root screen; drop anything pushed on top
  /// of the old one (e.g. Register, dialogs) so it can't linger.
  void _onSessionChanged() {
    final status = _session.status;
    if (status != _lastStatus) {
      _lastStatus = status;
      _navigatorKey.currentState?.popUntil((route) => route.isFirst);
      // Done here rather than in a widget's dispose(), where notifying listeners is illegal.
      if (status != SessionStatus.authenticated) widget.realtime.disconnect();
    }
  }

  @override
  void dispose() {
    widget.realtime.disconnect();
    _session
      ..removeListener(_onSessionChanged)
      ..dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<ChatApi>.value(value: widget.api),
        ChangeNotifierProvider<SessionController>.value(value: _session),
        ChangeNotifierProvider<ThemeController>.value(value: widget.themeController),
        ChangeNotifierProvider<RealtimeClient>.value(value: widget.realtime),
      ],
      child: Consumer<ThemeController>(
        builder: (context, theme, _) => MaterialApp(
          navigatorKey: _navigatorKey,
          title: 'Chat App',
          debugShowCheckedModeBanner: false,
          theme: buildTheme(Brightness.light),
          darkTheme: buildTheme(Brightness.dark),
          themeMode: theme.mode,
          home: const _AuthGate(),
        ),
      ),
    );
  }
}

class _AuthGate extends StatelessWidget {
  const _AuthGate();

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    return switch (session.status) {
      SessionStatus.unknown => SplashScreen(error: session.restoreError?.message, onRetry: session.restore),
      SessionStatus.unauthenticated => const LoginScreen(),
      SessionStatus.authenticated => _SignedInScope(key: ValueKey(session.user!.id)),
    };
  }
}

/// Lives exactly as long as the signed-in session: owns the socket and the conversation list.
class _SignedInScope extends StatefulWidget {
  const _SignedInScope({super.key});

  @override
  State<_SignedInScope> createState() => _SignedInScopeState();
}

class _SignedInScopeState extends State<_SignedInScope> {
  late final RealtimeClient _realtime;
  late final ConversationsController _conversations;
  late final AppLifecycleListener _lifecycle;

  @override
  void initState() {
    super.initState();
    _realtime = context.read<RealtimeClient>()..connect();
    _conversations = ConversationsController(
      api: context.read<ChatApi>(),
      frames: _realtime.frames,
      currentUserId: context.read<SessionController>().user!.id,
    )..load();
    _lifecycle = AppLifecycleListener(onResume: _realtime.reconnectNow);
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    _conversations.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ChangeNotifierProvider.value(value: _conversations, child: const HomeScreen());
}
