import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/chat_api.dart';
import '../../models/conversation.dart';
import '../../models/user.dart';
import '../../state/conversations_controller.dart';
import '../../state/people_search_controller.dart';
import '../components/app_button.dart';
import '../components/people_search.dart';
import '../design/tokens.dart';
import '../l10n.dart';

/// Find people to start a chat with.
///
/// There is no contacts list on the server, so this is a people *search*
/// (`GET /api/users/search`, minimum two characters) rather than an address book.
/// Picking someone opens or creates a direct conversation and hands it to the
/// shell, which is what actually swaps the view to that chat.
class ContactsScreen extends StatefulWidget {
  const ContactsScreen({super.key, required this.onOpenChat});

  final ValueChanged<Conversation> onOpenChat;

  @override
  State<ContactsScreen> createState() => _ContactsScreenState();
}

class _ContactsScreenState extends State<ContactsScreen> {
  late final PeopleSearchController _search = PeopleSearchController(context.read<ChatApi>());

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _startChat(User user) async {
    final conversations = context.read<ConversationsController>();
    final l = context.l10n;
    try {
      final conversation = await conversations.openWith(user);
      if (!mounted) return;
      _search.clear();
      widget.onOpenChat(conversation);
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, errorMessage(l, e), kind: SnackKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final theme = Theme.of(context);
    final showHeader = MediaQuery.sizeOf(context).width >= 600;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showHeader)
          Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.md, AppSpacing.md, AppSpacing.md, AppSpacing.sm),
            child: Semantics(header: true, child: Text(l.contacts, style: theme.textTheme.titleLarge)),
          ),
        Padding(
          padding: EdgeInsetsDirectional.fromSTEB(
            AppSpacing.md,
            showHeader ? 0 : AppSpacing.md,
            AppSpacing.md,
            AppSpacing.sm,
          ),
          child: PeopleSearchField(controller: _search, fieldKey: const Key('contacts.search')),
        ),
        Expanded(
          child: ListenableBuilder(
            listenable: _search,
            // PeopleSearchResults already renders the idle, searching, failed and
            // no-match states; below two characters it shows the "type a name"
            // guidance instead of firing a request the server would reject.
            builder: (context, _) => PeopleSearchResults(controller: _search, onSelected: _startChat),
          ),
        ),
      ],
    );
  }
}
