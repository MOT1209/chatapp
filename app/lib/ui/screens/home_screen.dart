import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/conversation.dart';
import '../../state/conversations_controller.dart';
import '../responsive.dart';
import '../widgets/state_views.dart';
import 'chat_screen.dart';
import 'conversation_list.dart';
import 'profile_screen.dart';

/// Compact: list → full-screen chat, with bottom navigation.
/// Medium/expanded: navigation rail | conversation sidebar | chat area.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;
  String? _selectedId;

  void _select(Conversation? conversation) => setState(() => _selectedId = conversation?.id);

  static const _destinations = [
    (icon: Icons.chat_bubble_outline, selected: Icons.chat_bubble, label: 'Chats'),
    (icon: Icons.person_outline, selected: Icons.person, label: 'Profile'),
  ];

  @override
  Widget build(BuildContext context) {
    final conversations = context.watch<ConversationsController>();
    final selected = _selectedId == null ? null : conversations.byId(_selectedId!);
    final size = screenSizeOf(context);

    final list = ConversationList(selectedId: selected?.id, onSelect: _select);
    Widget chat(VoidCallback? onBack) =>
        ChatScreen(key: ValueKey(selected!.id), conversation: selected, onBack: onBack);

    if (size == ScreenSize.compact) {
      if (_tab == 0 && selected != null) {
        return PopScope(
          canPop: false,
          onPopInvokedWithResult: (didPop, _) {
            if (!didPop) _select(null);
          },
          child: chat(() => _select(null)),
        );
      }
      return Scaffold(
        body: SafeArea(bottom: false, child: _tab == 0 ? list : const ProfileScreen()),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: (i) => setState(() => _tab = i),
          destinations: [
            for (final d in _destinations)
              NavigationDestination(icon: Icon(d.icon), selectedIcon: Icon(d.selected), label: d.label),
          ],
        ),
      );
    }

    final sidebarWidth = size == ScreenSize.expanded ? 360.0 : 300.0;
    return Scaffold(
      body: SafeArea(
        child: Row(
          children: [
            NavigationRail(
              selectedIndex: _tab,
              onDestinationSelected: (i) => setState(() => _tab = i),
              labelType: NavigationRailLabelType.all,
              destinations: [
                for (final d in _destinations)
                  NavigationRailDestination(icon: Icon(d.icon), selectedIcon: Icon(d.selected), label: Text(d.label)),
              ],
            ),
            const VerticalDivider(width: 1),
            if (_tab == 0) ...[
              SizedBox(width: sidebarWidth, child: list),
              const VerticalDivider(width: 1),
              Expanded(
                child: selected == null
                    ? const EmptyView(
                        icon: Icons.forum_outlined,
                        title: 'Select a conversation',
                        message: 'Choose a chat from the list, or search for someone to start a new one.',
                      )
                    : chat(null),
              ),
            ] else
              const Expanded(child: ProfileScreen()),
          ],
        ),
      ),
    );
  }
}
