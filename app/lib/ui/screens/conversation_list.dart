import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/chat_api.dart';
import '../../models/conversation.dart';
import '../../models/user.dart';
import '../../state/conversations_controller.dart';
import '../format.dart';
import '../l10n.dart';
import '../widgets/connection_banner.dart';
import '../widgets/state_views.dart';
import '../widgets/user_avatar.dart';

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
  static const _minQueryLength = 2;
  static const _debounce = Duration(milliseconds: 300);

  final _search = TextEditingController();
  Timer? _debounceTimer;
  String _query = '';
  List<User>? _people;
  bool _searching = false;
  String? _searchError;
  int _searchSeq = 0;

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onQueryChanged(String value) {
    final query = value.trim();
    setState(() => _query = query);
    _debounceTimer?.cancel();
    if (query.length < _minQueryLength) {
      setState(() {
        _people = null;
        _searching = false;
        _searchError = null;
      });
      return;
    }
    setState(() => _searching = true);
    _debounceTimer = Timer(_debounce, () => _runSearch(query));
  }

  Future<void> _runSearch(String query) async {
    final seq = ++_searchSeq;
    try {
      final people = await context.read<ChatApi>().searchUsers(query);
      if (!mounted || seq != _searchSeq) return;
      setState(() {
        _people = people;
        _searchError = null;
      });
    } on ApiException catch (e) {
      if (!mounted || seq != _searchSeq) return;
      setState(() => _searchError = errorMessage(context.l10n, e));
    } finally {
      if (mounted && seq == _searchSeq) setState(() => _searching = false);
    }
  }

  void _clearSearch() {
    _search.clear();
    _onQueryChanged('');
  }

  Future<void> _startChat(User user) async {
    final controller = context.read<ConversationsController>();
    final messenger = ScaffoldMessenger.of(context);
    final l = context.l10n;
    try {
      final conversation = await controller.openWith(user);
      if (!mounted) return;
      _clearSearch();
      widget.onSelect(conversation);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(errorMessage(l, e))));
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
          padding: const EdgeInsetsDirectional.fromSTEB(16, 16, 16, 8),
          child: Row(
            children: [
              Expanded(
                child: Semantics(header: true, child: Text(l.appTitle, style: theme.textTheme.titleLarge)),
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
          padding: const EdgeInsetsDirectional.fromSTEB(16, 0, 16, 8),
          child: TextField(
            key: const Key('home.search'),
            controller: _search,
            focusNode: widget.searchFocus,
            onChanged: _onQueryChanged,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: l.search,
              prefixIcon: const Icon(Icons.search),
              isDense: true,
              suffixIcon: _query.isEmpty
                  ? null
                  : IconButton(tooltip: l.clearSearch, icon: const Icon(Icons.close), onPressed: _clearSearch),
            ),
          ),
        ),
        Expanded(child: _body(context)),
      ],
    );
  }

  Widget _body(BuildContext context) {
    final l = context.l10n;
    final controller = context.watch<ConversationsController>();
    if (!controller.loaded) {
      if (controller.error != null) {
        return ErrorView(message: errorMessage(l, controller.error!), onRetry: controller.load);
      }
      return LoadingView(label: l.loadingConversations);
    }

    final q = _query.toLowerCase();
    final chats = q.isEmpty
        ? controller.items
        : controller.items
              .where(
                (c) =>
                    c.participant.displayName.toLowerCase().contains(q) ||
                    c.participant.username.toLowerCase().contains(q),
              )
              .toList();

    Widget tile(Conversation c) => _ConversationTile(
      conversation: c,
      currentUserId: controller.currentUserId,
      selected: c.id == widget.selectedId,
      onTap: () => widget.onSelect(c),
    );

    if (_query.length < _minQueryLength) {
      if (chats.isEmpty) {
        return EmptyView(
          icon: Icons.chat_outlined,
          title: q.isEmpty ? l.noConversations : l.noMatchingChats,
          message: l.searchPeopleHint,
        );
      }
      return RefreshIndicator(
        onRefresh: controller.load,
        child: ListView.builder(itemCount: chats.length, itemBuilder: (_, i) => tile(chats[i])),
      );
    }

    return ListView(
      children: [
        if (chats.isNotEmpty) ...[_SectionHeader(l.chats), for (final c in chats) tile(c)],
        _SectionHeader(l.peopleSection),
        if (_searching)
          Padding(
            padding: const EdgeInsets.all(24),
            child: LoadingView(label: l.searching),
          )
        else if (_searchError != null)
          ListTile(
            leading: Icon(Icons.error_outline, color: Theme.of(context).colorScheme.error),
            title: Text(_searchError!),
            trailing: TextButton(onPressed: () => _runSearch(_query), child: Text(l.retry)),
          )
        else if (_people?.isEmpty ?? true)
          ListTile(title: Text(l.noPeopleFound))
        else
          for (final user in _people!)
            ListTile(
              leading: UserAvatar(user: user, showPresence: true),
              title: Text(user.displayName),
              subtitle: Text('@${user.username}', textDirection: TextDirection.ltr),
              trailing: const Icon(Icons.chat_outlined),
              onTap: () => _startChat(user),
            ),
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.label);
  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsetsDirectional.fromSTEB(16, 12, 16, 4),
    child: Semantics(
      header: true,
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelLarge?.copyWith(color: Theme.of(context).colorScheme.primary),
      ),
    ),
  );
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({
    required this.conversation,
    required this.currentUserId,
    required this.selected,
    required this.onTap,
  });

  final Conversation conversation;
  final String currentUserId;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l = context.l10n;
    final last = conversation.lastMessage;
    final unread = conversation.unreadCount;
    final body = last == null ? null : (last.isDeleted ? l.messageDeleted : last.body);
    final preview = switch (last) {
      null => l.noMessagesYet,
      _ when last.sender.id == currentUserId => l.youPrefix(body!),
      _ => body!,
    };
    return ListTile(
      selected: selected,
      selectedTileColor: theme.colorScheme.secondaryContainer.withValues(alpha: 0.5),
      leading: UserAvatar(user: conversation.participant, showPresence: true),
      title: Text(conversation.participant.displayName, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text(
        preview,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontWeight: unread > 0 ? FontWeight.w600 : null,
          fontStyle: last?.isDeleted ?? false ? FontStyle.italic : null,
        ),
      ),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(formatListTimestamp(l, last?.createdAt ?? conversation.updatedAt), style: theme.textTheme.labelSmall),
          if (unread > 0) ...[
            const SizedBox(height: 4),
            Semantics(
              label: l.unreadCount(unread),
              excludeSemantics: true,
              child: Badge(label: Text(unread > 99 ? '99+' : '$unread')),
            ),
          ],
        ],
      ),
      onTap: onTap,
    );
  }
}
