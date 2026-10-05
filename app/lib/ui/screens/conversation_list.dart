import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/chat_api.dart';
import '../../models/conversation.dart';
import '../../models/user.dart';
import '../../state/conversations_controller.dart';
import '../../state/people_search_controller.dart';
import '../components/app_button.dart';
import '../components/connection_banner.dart';
import '../components/conversation_tile.dart';
import '../components/people_search.dart';
import '../components/section_header.dart';
import '../components/state_views.dart';
import '../design/tokens.dart';
import '../l10n.dart';

/// The conversation sidebar: existing chats, plus people you can start one with.
///
/// Once a query is long enough for the people endpoint both lists are searched;
/// below that only the loaded chats are filtered, because the server rejects
/// shorter queries. People come from `GET /api/users/search`.
class ConversationList extends StatefulWidget {
  const ConversationList({
    super.key,
    required this.selectedId,
    required this.onSelect,
    this.searchFocus,
    this.onNewChat,
  });

  final String? selectedId;
  final ValueChanged<Conversation> onSelect;

  /// Lets Home focus search for "New chat" and Ctrl/⌘+K.
  final FocusNode? searchFocus;

  /// Shows a "New chat" button in the header (wide layouts; phones use a FAB).
  final VoidCallback? onNewChat;

  @override
  State<ConversationList> createState() => _ConversationListState();
}

class _ConversationListState extends State<ConversationList> {
  late final PeopleSearchController _people = PeopleSearchController(context.read<ChatApi>());

  @override
  void dispose() {
    _people.dispose();
    super.dispose();
  }

  Future<void> _startChat(User user) async {
    final controller = context.read<ConversationsController>();
    final l = context.l10n;
    try {
      final conversation = await controller.openWith(user);
      if (!mounted) return;
      _people.clear();
      widget.onSelect(conversation);
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, errorMessage(l, e), kind: SnackKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.md, AppSpacing.md, AppSpacing.sm, AppSpacing.sm),
          child: Row(
            children: [
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    l.appTitle,
                    style: theme.textTheme.titleLarge,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
              if (widget.onNewChat != null)
                IconButton(
                  key: const Key('home.newChat'),
                  tooltip: l.newChat,
                  onPressed: widget.onNewChat,
                  icon: const Icon(Icons.edit_square),
                ),
            ],
          ),
        ),
        const ConnectionBanner(),
        Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.md, 0, AppSpacing.md, AppSpacing.sm),
          child: PeopleSearchField(
            controller: _people,
            fieldKey: const Key('home.search'),
            focusNode: widget.searchFocus,
          ),
        ),
        Expanded(
          child: ListenableBuilder(
            listenable: Listenable.merge([context.watch<ConversationsController>(), _people]),
            builder: (context, _) => _body(context),
          ),
        ),
      ],
    );
  }

  Widget _body(BuildContext context) {
    final l = context.l10n;
    final controller = context.watch<ConversationsController>();
    final searchingPeople = _people.queryIsSearchable;
    final query = _people.query.toLowerCase();

    if (!controller.loaded) {
      if (controller.error != null) {
        return ErrorView(message: errorMessage(l, controller.error!), onRetry: controller.load);
      }
      return const SkeletonList();
    }

    final chats = searchingPeople
        ? controller.items
              .where(
                (c) =>
                    c.participant.displayName.toLowerCase().contains(query) ||
                    c.participant.username.toLowerCase().contains(query),
              )
              .toList()
        : controller.items;

    if (chats.isEmpty && !searchingPeople) {
      return EmptyView(icon: Icons.chat_bubble_outline, title: l.noConversations, message: l.searchPeopleHint);
    }

    return RefreshIndicator(
      onRefresh: controller.load,
      child: ListView(
        // Clears the FAB so the last row is never hidden behind it.
        padding: const EdgeInsets.only(bottom: AppSpacing.xxxl),
        children: [
          // No "Chats" section header here: the navigation destination beside
          // this list already carries that label, and a second copy reads as a
          // duplicate to anyone using a screen reader.
          for (final c in chats)
            ConversationTile(
              conversation: c,
              currentUserId: controller.currentUserId,
              selected: c.id == widget.selectedId,
              onTap: () => widget.onSelect(c),
            ),
          if (searchingPeople) ...[
            SectionHeader(l.peopleSection),
            PeopleSearchInline(controller: _people, onSelected: _startChat),
          ],
        ],
      ),
    );
  }
}
