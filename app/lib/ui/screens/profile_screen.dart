import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../state/session_controller.dart';
import '../../state/settings_controller.dart';
import '../l10n.dart';
import '../widgets/state_views.dart';
import '../widgets/user_avatar.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final user = session.user;
    if (user == null) return const SizedBox.shrink();
    final theme = Theme.of(context);
    final settings = context.watch<SettingsController>();
    final l = context.l10n;
    final muted = theme.colorScheme.onSurfaceVariant;

    return Scaffold(
      appBar: AppBar(title: Text(l.profile), automaticallyImplyLeading: false),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              Center(child: UserAvatar(user: user, radius: 48)),
              const SizedBox(height: 16),
              Text(user.displayName, style: theme.textTheme.headlineSmall, textAlign: TextAlign.center),
              Text(
                '@${user.username}',
                style: theme.textTheme.bodyLarge?.copyWith(color: muted),
                textAlign: TextAlign.center,
                textDirection: TextDirection.ltr,
              ),
              if (user.email != null)
                Text(
                  user.email!,
                  style: theme.textTheme.bodyMedium?.copyWith(color: muted),
                  textAlign: TextAlign.center,
                  textDirection: TextDirection.ltr,
                ),
              const SizedBox(height: 24),
              Card(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    ListTile(
                      leading: const Icon(Icons.edit_outlined),
                      title: Text(l.editProfile),
                      onTap: () => showDialog<void>(context: context, builder: (_) => const _EditProfileDialog()),
                    ),
                    const Divider(height: 1),
                    _Setting(
                      label: l.appearance,
                      child: SegmentedButton<ThemeMode>(
                        showSelectedIcon: false,
                        segments: [
                          ButtonSegment(
                            value: ThemeMode.system,
                            label: Text(l.themeSystem),
                            icon: const Icon(Icons.brightness_auto),
                          ),
                          ButtonSegment(
                            value: ThemeMode.light,
                            label: Text(l.themeLight),
                            icon: const Icon(Icons.light_mode),
                          ),
                          ButtonSegment(
                            value: ThemeMode.dark,
                            label: Text(l.themeDark),
                            icon: const Icon(Icons.dark_mode),
                          ),
                        ],
                        selected: {settings.themeMode},
                        onSelectionChanged: (s) => settings.setThemeMode(s.first),
                      ),
                    ),
                    const Divider(height: 1),
                    _Setting(
                      label: l.language,
                      child: SegmentedButton<String>(
                        key: const Key('profile.language'),
                        showSelectedIcon: false,
                        // Language names are shown in their own language so they're always findable.
                        segments: [
                          ButtonSegment(value: 'system', label: Text(l.languageSystem)),
                          const ButtonSegment(value: 'ar', label: Text('العربية')),
                          const ButtonSegment(value: 'en', label: Text('English')),
                        ],
                        selected: {settings.locale?.languageCode ?? 'system'},
                        onSelectionChanged: (s) => settings.setLocale(s.first == 'system' ? null : Locale(s.first)),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: theme.colorScheme.error,
                  minimumSize: const Size.fromHeight(48),
                ),
                onPressed: () => _confirmLogout(context),
                icon: const Icon(Icons.logout),
                label: Text(l.logout),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _confirmLogout(BuildContext context) async {
    final session = context.read<SessionController>();
    final l = context.l10n;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l.logoutConfirmTitle),
        content: Text(l.logoutConfirmBody),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l.cancel)),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(l.logout)),
        ],
      ),
    );
    if (confirmed ?? false) await session.logout();
  }
}

class _Setting extends StatelessWidget {
  const _Setting({required this.label, required this.child});
  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        SizedBox(width: double.infinity, child: child),
      ],
    ),
  );
}

class _EditProfileDialog extends StatefulWidget {
  const _EditProfileDialog();

  @override
  State<_EditProfileDialog> createState() => _EditProfileDialogState();
}

class _EditProfileDialogState extends State<_EditProfileDialog> {
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
        _fieldErrors = e.fields;
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
        width: 400,
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_error != null) ...[ErrorBanner(message: _error!), const SizedBox(height: 16)],
              TextFormField(
                controller: _displayName,
                enabled: !_saving,
                decoration: InputDecoration(labelText: l.displayName, errorText: _fieldErrors['displayName']),
                validator: (v) {
                  final value = v?.trim() ?? '';
                  if (value.isEmpty) return l.displayNameRequired;
                  if (value.length > 50) return l.atMost50;
                  return null;
                },
              ),
              const SizedBox(height: 16),
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
                  final uri = Uri.tryParse(value);
                  final valid = uri != null && (uri.scheme == 'http' || uri.scheme == 'https') && uri.host.isNotEmpty;
                  if (!valid) return l.enterValidUrl;
                  if (value.length > 2048) return l.urlTooLong;
                  return null;
                },
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: _saving ? null : () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(
          onPressed: _saving ? null : _save,
          child: _saving
              ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : Text(l.save),
        ),
      ],
    );
  }
}
