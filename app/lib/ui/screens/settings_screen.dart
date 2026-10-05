import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/session_controller.dart';
import '../../state/settings_controller.dart';
import '../components/app_button.dart';
import '../components/settings_tiles.dart';
import '../design/tokens.dart';
import '../l10n.dart';

/// Preferences that are not about who you are.
///
/// Scope is deliberately limited to what the app really does today: appearance,
/// privacy, the account actions that already exist, and an about row. There is
/// no notifications or security section here because nothing backs them yet.
class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<SettingsController>();
    final session = context.watch<SessionController>();
    final l = context.l10n;

    return Scaffold(
      appBar: AppBar(title: Text(l.settings), automaticallyImplyLeading: false),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: AppSizes.contentMaxWidth),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, AppSpacing.lg),
            children: [
              SettingsSection(
                title: l.appearance,
                icon: Icons.palette_outlined,
                children: [
                  Padding(
                    padding: const EdgeInsets.all(AppSpacing.md),
                    child: SegmentedButton<ThemeMode>(
                      showSelectedIcon: false,
                      segments: [
                        ButtonSegment(
                          value: ThemeMode.system,
                          label: Text(l.themeSystem),
                          icon: const Icon(Icons.brightness_auto, size: AppSizes.iconSmall),
                        ),
                        ButtonSegment(
                          value: ThemeMode.light,
                          label: Text(l.themeLight),
                          icon: const Icon(Icons.light_mode, size: AppSizes.iconSmall),
                        ),
                        ButtonSegment(
                          value: ThemeMode.dark,
                          label: Text(l.themeDark),
                          icon: const Icon(Icons.dark_mode, size: AppSizes.iconSmall),
                        ),
                      ],
                      selected: {settings.themeMode},
                      onSelectionChanged: (selection) => settings.setThemeMode(selection.first),
                    ),
                  ),
                ],
              ),
              SettingsSection(
                title: l.privacy,
                icon: Icons.lock_outline,
                children: [
                  SettingsSwitchTile(
                    icon: Icons.phonelink_lock_outlined,
                    title: l.keepMeSignedIn,
                    subtitle: l.keepMeSignedInHint,
                    value: settings.rememberSession,
                    onChanged: settings.setRememberSession,
                  ),
                ],
              ),
              SettingsSection(
                title: l.account,
                icon: Icons.person_outline,
                children: [
                  SettingsActionTile(
                    icon: Icons.alternate_email,
                    title: l.username,
                    subtitle: session.user?.username,
                    onTap: () => showAppSnackBar(context, l.usernameIsPermanent),
                  ),
                ],
              ),
              SettingsSection(
                title: l.about,
                icon: Icons.info_outline,
                children: [
                  SettingsActionTile(
                    icon: Icons.info_outline,
                    title: l.appVersion,
                    subtitle: '1.0.0',
                    onTap: () => showAboutDialog(
                      context: context,
                      applicationName: l.appTitle,
                      applicationVersion: '1.0.0',
                      applicationLegalese: l.appTitle,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
