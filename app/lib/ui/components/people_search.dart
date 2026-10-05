import 'package:flutter/material.dart';

import '../l10n.dart';
import '../../models/user.dart';
import '../../state/people_search_controller.dart';
import '../design/tokens.dart';
import 'app_avatar.dart';
import 'state_views.dart';

/// Search box for people. Submits immediately on Enter instead of waiting out
/// the debounce, and offers a clear button once there is text.
class PeopleSearchField extends StatefulWidget {
  const PeopleSearchField({
    super.key,
    required this.controller,
    this.fieldKey,
    this.focusNode,
    this.autofocus = false,
    this.hint,
  });

  final PeopleSearchController controller;
  final Key? fieldKey;
  final FocusNode? focusNode;
  final bool autofocus;
  final String? hint;

  @override
  State<PeopleSearchField> createState() => _PeopleSearchFieldState();
}

class _PeopleSearchFieldState extends State<PeopleSearchField> {
  late final TextEditingController _text = TextEditingController(text: widget.controller.query);

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  void _clear() {
    widget.controller.clear();
    _text.clear();
  }

  @override
  Widget build(BuildContext context) => TextField(
    key: widget.fieldKey,
    controller: _text,
    focusNode: widget.focusNode,
    autofocus: widget.autofocus,
    textInputAction: TextInputAction.search,
    onChanged: widget.controller.updateQuery,
    onSubmitted: (_) => widget.controller.search(),
    decoration: InputDecoration(
      hintText: widget.hint ?? context.l10n.search,
      prefixIcon: const Icon(Icons.search),
      suffixIcon: widget.controller.query.isEmpty
          ? null
          : IconButton(tooltip: context.l10n.clearSearch, icon: const Icon(Icons.close), onPressed: _clear),
    ),
  );
}

/// One person you can start a chat with.
class PersonTile extends StatelessWidget {
  const PersonTile({super.key, required this.user, required this.onTap});

  final User user;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ListTile(
    leading: UserAvatar(user: user, size: AvatarSize.large, showPresence: true),
    title: Text(user.displayName, maxLines: 1, overflow: TextOverflow.ellipsis),
    // Usernames are always Latin script, so keep the run LTR inside an Arabic
    // layout instead of letting the bidi algorithm flip the leading "@".
    subtitle: Text(
      '@${user.username}',
      textDirection: TextDirection.ltr,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: Theme.of(context).textTheme.bodySmall,
    ),
    trailing: const Icon(Icons.chat_bubble_outline, size: AppSizes.iconMedium),
    onTap: onTap,
  );
}

/// Every state of a people lookup as a full panel: idle, searching, failed,
/// nothing matched, or a list of people.
///
/// Idle explains that a name is needed rather than showing an empty box,
/// because the endpoint rejects queries shorter than two characters.
class PeopleSearchResults extends StatelessWidget {
  const PeopleSearchResults({super.key, required this.controller, required this.onSelected});

  final PeopleSearchController controller;
  final ValueChanged<User> onSelected;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;

    if (!controller.queryIsSearchable) {
      return EmptyView(icon: Icons.person_search_outlined, title: l.startNewChatTitle, message: l.searchPeopleHint);
    }
    if (controller.searching && !controller.hasSearched) {
      return const Padding(padding: EdgeInsets.all(AppSpacing.lg), child: LoadingView());
    }
    if (controller.error != null) {
      return ErrorView(message: errorMessage(l, controller.error!), onRetry: controller.search);
    }
    if (controller.people.isEmpty) {
      return EmptyView(icon: Icons.person_off_outlined, title: l.noPeopleFound, message: l.noPeopleFoundHint);
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      itemCount: controller.people.length,
      itemBuilder: (context, index) {
        final user = controller.people[index];
        return PersonTile(user: user, onTap: () => onSelected(user));
      },
    );
  }
}

/// The same states as [PeopleSearchResults], but compact enough to sit inside a
/// list that also contains other sections. Avoids nesting a scrollable inside a
/// scrollable, which makes both hard to use.
class PeopleSearchInline extends StatelessWidget {
  const PeopleSearchInline({super.key, required this.controller, required this.onSelected});

  final PeopleSearchController controller;
  final ValueChanged<User> onSelected;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final theme = Theme.of(context);

    if (controller.searching && !controller.hasSearched) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: AppSpacing.lg),
        child: LoadingView(label: null),
      );
    }
    if (controller.error != null) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
        child: Row(
          children: [
            Icon(Icons.error_outline, size: AppSizes.iconMedium, color: theme.colorScheme.error),
            const SizedBox(width: AppSpacing.smd),
            Expanded(
              child: Text(
                errorMessage(l, controller.error!),
                style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.error),
              ),
            ),
            TextButton(onPressed: controller.search, child: Text(l.retry)),
          ],
        ),
      );
    }
    if (controller.people.isEmpty) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, AppSpacing.md),
        child: Text(
          l.noPeopleFoundHint,
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
      );
    }

    return Column(
      children: [for (final user in controller.people) PersonTile(user: user, onTap: () => onSelected(user))],
    );
  }
}
