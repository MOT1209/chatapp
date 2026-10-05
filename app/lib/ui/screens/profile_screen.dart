import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../state/session_controller.dart';
import '../../state/settings_controller.dart';
import '../components/app_avatar.dart';
import '../components/app_button.dart';
import '../components/settings_tiles.dart';
import '../components/state_views.dart';
import '../design/tokens.dart';
import '../l10n.dart';

/// Who you are, plus the two things people change about themselves here: their
/// name and photo, and the language the app speaks.
///
/// Appearance and privacy live on the Settings destination instead.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final user = session.user;
    // The app only builds this once a session exists; without a user there is
    // nothing to show, but say so rather than rendering a zero-height box.
    if (user == null) {
      return Scaffold(
        appBar: AppBar(title: Text(context.l10n.profile), automaticallyImplyLeading: false),
        body: EmptyView(icon: Icons.person_off_outlined, title: context.l10n.profileUnavailable),
      );
    }

    final theme = Theme.of(context);
    final settings = context.watch<SettingsController>();
    final l = context.l10n;
    final muted = theme.colorScheme.onSurfaceVariant;
    final currentLanguage = settings.locale?.languageCode ?? 'system';

    return Scaffold(
      appBar: AppBar(title: Text(l.profile), automaticallyImplyLeading: false),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: AppSizes.contentMaxWidth),
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.lg),
            children: [
              Center(
                child: UserAvatar(user: user, size: AvatarSize.large),
              ),
              const SizedBox(height: AppSpacing.md),
              Text(
                user.displayName,
                style: theme.textTheme.headlineSmall,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: AppSpacing.xxs),
              Text(
                '@${user.username}',
                style: theme.textTheme.bodyMedium?.copyWith(color: muted),
                textAlign: TextAlign.center,
                textDirection: TextDirection.ltr,
              ),
              if (user.email != null)
                Text(
                  user.email!,
                  style: theme.textTheme.bodySmall?.copyWith(color: muted),
                  textAlign: TextAlign.center,
                  textDirection: TextDirection.ltr,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              const SizedBox(height: AppSpacing.md),
              Card(
                child: ListTile(
                  leading: const Icon(Icons.edit_outlined),
                  title: Text(l.editProfile),
                  onTap: () => showDialog<void>(context: context, builder: (_) => const EditProfileDialog()),
                ),
              ),
              SettingsSection(
                title: l.language,
                icon: Icons.translate,
                subtitle: l.languageSystemHint,
                children: [
                  Padding(
                    padding: const EdgeInsets.all(AppSpacing.md),
                    // Language names are shown in their own language so they are
                    // always findable, whatever the current locale is.
                    child: Wrap(
                      key: const Key('profile.language'),
                      spacing: AppSpacing.sm,
                      runSpacing: AppSpacing.sm,
                      children: [
                        for (final (code, label) in [
                          ('system', l.languageSystem),
                          ('ar', 'العربية'),
                          ('en', 'English'),
                          ('de', 'Deutsch'),
                        ])
                          ChoiceChip(
                            label: Text(label),
                            selected: currentLanguage == code,
                            onSelected: (_) => settings.setLocale(code == 'system' ? null : Locale(code)),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: theme.colorScheme.error,
                  side: BorderSide(color: theme.colorScheme.error.withValues(alpha: 0.4)),
                ),
                onPressed: () => _confirmLogout(context),
                icon: const Icon(Icons.logout),
                label: Text(l.logout),
              ),
              const SizedBox(height: AppSpacing.lg),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _confirmLogout(BuildContext context) async {
    final session = context.read<SessionController>();
    final l = context.l10n;
    final confirmed = await confirmDialog(
      context,
      title: l.logoutConfirmTitle,
      message: l.logoutConfirmBody,
      confirmLabel: l.logout,
      destructive: true,
    );
    if (confirmed) await session.logout();
  }
}

/// Edits the display name and avatar URL. Validation mirrors the server's
/// (`PUT /api/users/me`), so the form fails the same way the API would.
class EditProfileDialog extends StatefulWidget {
  const EditProfileDialog({super.key});

  @override
  State<EditProfileDialog> createState() => _EditProfileDialogState();
}

class _EditProfileDialogState extends State<EditProfileDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _displayName;
  late final TextEditingController _avatarUrl;
  bool _saving = false;
  String? _error;
  Map<String, String> _fieldErrors = const {};

  @override
  void initState() {
    super.initState();
    final user = context.read<SessionController>().user!;
    _displayName = TextEditingController(text: user.displayName);
    _avatarUrl = TextEditingController(text: user.avatarUrl ?? '');
  }

  @override
  void dispose() {
    _displayName.dispose();
    _avatarUrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _error = null;
      _fieldErrors = const {};
    });
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    final navigator = Navigator.of(context);
    try {
      await context.read<SessionController>().updateProfile(
        displayName: _displayName.text.trim(),
        avatarUrl: _avatarUrl.text.trim(),
      );
      navigator.pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = errorMessage(context.l10n, e);
        _fieldErrors = fieldErrors(context.l10n, e);
      });
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AlertDialog(
      title: Text(l.editProfile),
      content: SizedBox(
        width: AppSizes.authMaxWidth,
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_error != null) ...[ErrorBanner(message: _error!), const SizedBox(height: AppSpacing.md)],
              TextFormField(
                controller: _displayName,
                enabled: !_saving,
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(labelText: l.displayName, errorText: _fieldErrors['displayName']),
                validator: (v) {
                  final value = v?.trim() ?? '';
                  if (value.isEmpty) return l.displayNameRequired;
                  if (value.length > 50) return l.atMost50;
                  return null;
                },
              ),
              const SizedBox(height: AppSpacing.md),
              TextFormField(
                controller: _avatarUrl,
                enabled: !_saving,
                keyboardType: TextInputType.url,
                textDirection: TextDirection.ltr,
                decoration: InputDecoration(
                  labelText: l.profileImageUrl,
                  helperText: l.profileImageHint,
                  errorText: _fieldErrors['avatarUrl'],
                ),
                validator: (v) {
                  final value = v?.trim() ?? '';
                  if (value.isEmpty) return null;
                  if (value.length > 2048) return l.urlTooLong;
                  final uri = Uri.tryParse(value);
                  final valid = uri != null && (uri.scheme == 'http' || uri.scheme == 'https') && uri.host.isNotEmpty;
                  return valid ? null : l.enterValidUrl;
                },
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: _saving ? null : () => Navigator.pop(context), child: Text(l.cancel)),
        LoadingButton(label: l.save, isLoading: _saving, expand: false, onPressed: _save),
      ],
    );
  }
}
