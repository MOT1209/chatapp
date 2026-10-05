import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../models/conversation.dart';
import '../../state/conversations_controller.dart';
import '../components/state_views.dart';
import '../l10n.dart';
import '../responsive.dart';
import 'chat_screen.dart';
import 'contacts_screen.dart';
import 'conversation_list.dart';
import 'profile_screen.dart';
import 'settings_screen.dart';

/// Compact: list → full-screen chat, with bottom navigation and a "New chat" button.
/// Medium/expanded: navigation rail | content area. Chats shows the conversation sidebar beside the chat
/// from [kTwoPaneMinWidth] up; below it (narrow tablets) the list and the open chat take turns, as on phones.
/// The other destinations take the full width.
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

  /// Opening a chat from Contacts (or a search result) always lands on Chats,
  /// because that is the destination that has the chat pane to show it in.
  void _openChat(Conversation conversation) => setState(() {
    _tab = 0;
    _selectedId = conversation.id;
  });

  void _selectTab(int index) => setState(() {
    _tab = index;
    // Leaving Chats should not leave a chat open behind a hidden sidebar.
    if (index != 0) _selectedId = null;
  });

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
      (icon: Icons.person_search_outlined, selected: Icons.person_search, label: l.contacts),
      (icon: Icons.person_outline, selected: Icons.person, label: l.profile),
      (icon: Icons.settings_outlined, selected: Icons.settings, label: l.settings),
    ];

    final list = ConversationList(
      selectedId: selected?.id,
      onSelect: _select,
      searchFocus: _searchFocus,
      onNewChat: size == ScreenSize.compact ? null : _newChat,
    );
    Widget chat(VoidCallback? onBack) =>
        ChatScreen(key: ValueKey(selected!.id), conversation: selected, onBack: onBack);

    /// Chats on wide layouts: the conversation sidebar beside the chat pane.
    Widget chatsWithSidebar() {
      if (!useTwoPane(context)) {
        // Narrow tablet: a list beside a chat would leave the chat ~218 px wide at 600 px.
        // Show one at a time, with a way back, like the phone layout.
        return selected == null
            ? list
            : PopScope(
                canPop: false,
                onPopInvokedWithResult: (didPop, _) {
                  if (!didPop) _select(null);
                },
                child: chat(() => _select(null)),
              );
      }
      return Row(
        children: [
          SizedBox(width: size == ScreenSize.expanded ? 360.0 : 300.0, child: list),
          const VerticalDivider(width: 1),
          Expanded(
            child: selected == null
                ? EmptyView(icon: Icons.forum_outlined, title: l.selectConversation, message: l.selectConversationHint)
                : chat(null),
          ),
        ],
      );
    }

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
          body: SafeArea(bottom: false, child: _compactBody(list)),
          floatingActionButton: _tab == 0
              ? FloatingActionButton(
                  key: const Key('home.newChat'),
                  tooltip: l.newChat,
                  onPressed: _newChat,
                  child: const Icon(Icons.edit_square),
                )
              : null,
          bottomNavigationBar: NavigationBar(
            key: const Key('home.navigation'),
            selectedIndex: _tab,
            onDestinationSelected: _selectTab,
            destinations: [
              for (final d in destinations)
                NavigationDestination(icon: Icon(d.icon), selectedIcon: Icon(d.selected), label: d.label),
            ],
          ),
        ),
      );
    }

    return _withShortcuts(
      Scaffold(
        body: SafeArea(
          child: Row(
            children: [
              NavigationRail(
                selectedIndex: _tab,
                onDestinationSelected: _selectTab,
                labelType: NavigationRailLabelType.all,
                destinations: [
                  for (final d in destinations)
                    NavigationRailDestination(icon: Icon(d.icon), selectedIcon: Icon(d.selected), label: Text(d.label)),
                ],
              ),
              const VerticalDivider(width: 1),
              Expanded(
                child: _tab == 0
                    ? chatsWithSidebar()
                    : switch (_tab) {
                        1 => ContactsScreen(onOpenChat: _openChat),
                        2 => const ProfileScreen(),
                        _ => const SettingsScreen(),
                      },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _compactBody(Widget list) => switch (_tab) {
    0 => list,
    1 => ContactsScreen(onOpenChat: _openChat),
    2 => const ProfileScreen(),
    _ => const SettingsScreen(),
  };
}
