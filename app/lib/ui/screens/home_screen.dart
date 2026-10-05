import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../models/conversation.dart';
import '../../state/conversations_controller.dart';
import '../l10n.dart';
import '../responsive.dart';
import '../widgets/state_views.dart';
import 'chat_screen.dart';
import 'conversation_list.dart';
import 'profile_screen.dart';

/// Compact: list → full-screen chat, with bottom navigation and a "New chat" button.
/// Medium (below [kTwoPaneMinWidth]): navigation rail, then the list or the open chat, one at a time.
/// Wide: navigation rail | conversation sidebar | chat area.
/// Keyboard: Ctrl/⌘+K focuses search, Esc closes the open chat.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;
  String? _selectedId;
  final _searchFocus = FocusNode(debugLabel: 'search');

  @override
  void dispose() {
    _searchFocus.dispose();
    super.dispose();
  }

  void _select(Conversation? conversation) => setState(() => _selectedId = conversation?.id);

  /// "New chat" starts from people search; the list already handles open-or-create.
  void _newChat() {
    setState(() {
      _tab = 0;
      _selectedId = null;
    });
    // After the rebuild, when the search field is mounted again.
    WidgetsBinding.instance.addPostFrameCallback((_) => _searchFocus.requestFocus());
  }

  Widget _withShortcuts(Widget child) => CallbackShortcuts(
    bindings: {
      const SingleActivator(LogicalKeyboardKey.keyK, control: true): _newChat,
      const SingleActivator(LogicalKeyboardKey.keyK, meta: true): _newChat,
      const SingleActivator(LogicalKeyboardKey.escape): () {
        if (_selectedId != null) _select(null);
      },
    },
    // Keeps shortcuts working when nothing inside has focus yet.
    child: Focus(autofocus: true, child: child),
  );

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final conversations = context.watch<ConversationsController>();
    final selected = _selectedId == null ? null : conversations.byId(_selectedId!);
    final size = screenSizeOf(context);
    final destinations = [
      (icon: Icons.chat_bubble_outline, selected: Icons.chat_bubble, label: l.chats),
      (icon: Icons.person_outline, selected: Icons.person, label: l.profile),
    ];

    final list = ConversationList(
      selectedId: selected?.id,
      onSelect: _select,
      searchFocus: _searchFocus,
      onNewChat: size == ScreenSize.compact ? null : _newChat,
    );
    Widget chat(VoidCallback? onBack) =>
        ChatScreen(key: ValueKey(selected!.id), conversation: selected, onBack: onBack);

    if (size == ScreenSize.compact) {
      if (_tab == 0 && selected != null) {
        return _withShortcuts(
          PopScope(
            canPop: false,
            onPopInvokedWithResult: (didPop, _) {
              if (!didPop) _select(null);
            },
            child: chat(() => _select(null)),
          ),
        );
      }
      return _withShortcuts(
        Scaffold(
          body: SafeArea(bottom: false, child: _tab == 0 ? list : const ProfileScreen()),
          floatingActionButton: _tab == 0
              ? FloatingActionButton(
                  key: const Key('home.newChat'),
                  tooltip: l.newChat,
                  onPressed: _newChat,
                  child: const Icon(Icons.edit_square),
                )
              : null,
          bottomNavigationBar: NavigationBar(
            selectedIndex: _tab,
            onDestinationSelected: (i) => setState(() => _tab = i),
            destinations: [
              for (final d in destinations)
                NavigationDestination(icon: Icon(d.icon), selectedIcon: Icon(d.selected), label: d.label),
            ],
          ),
        ),
      );
    }

    final sidebarWidth = size == ScreenSize.expanded ? 360.0 : 300.0;
    final twoPane = useTwoPane(context);
    return _withShortcuts(
      Scaffold(
        body: SafeArea(
          child: Row(
            children: [
              NavigationRail(
                selectedIndex: _tab,
                onDestinationSelected: (i) => setState(() => _tab = i),
                labelType: NavigationRailLabelType.all,
                destinations: [
                  for (final d in destinations)
                    NavigationRailDestination(icon: Icon(d.icon), selectedIcon: Icon(d.selected), label: Text(d.label)),
                ],
              ),
              const VerticalDivider(width: 1),
              if (_tab == 0 && twoPane) ...[
                SizedBox(width: sidebarWidth, child: list),
                const VerticalDivider(width: 1),
                Expanded(
                  child: selected == null
                      ? EmptyView(
                          icon: Icons.forum_outlined,
                          title: l.selectConversation,
                          message: l.selectConversationHint,
                        )
                      : chat(null),
                ),
              ] else if (_tab == 0) ...[
                // One pane next to the rail: the list, or the open chat with a way back.
                Expanded(
                  child: selected == null
                      ? list
                      : PopScope(
                          canPop: false,
                          onPopInvokedWithResult: (didPop, _) {
                            if (!didPop) _select(null);
                          },
                          child: chat(() => _select(null)),
                        ),
                ),
              ] else
                const Expanded(child: ProfileScreen()),
            ],
          ),
        ),
      ),
    );
  }
}
