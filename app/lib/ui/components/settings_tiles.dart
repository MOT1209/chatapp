import 'package:flutter/material.dart';

import '../design/tokens.dart';

/// A titled group of rows. Long-form screens (profile, settings) are built from
/// these so every section has the same heading treatment and the same card
/// treatment.
class SettingsSection extends StatelessWidget {
  const SettingsSection({super.key, required this.title, required this.children, this.icon, this.subtitle});

  final String title;
  final IconData? icon;
  final String? subtitle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.xs, AppSpacing.lg, AppSpacing.xs, AppSpacing.sm),
          child: Semantics(
            header: true,
            child: Row(
              children: [
                if (icon != null) ...[
                  Icon(icon, size: AppSizes.iconSmall, color: theme.colorScheme.primary),
                  const SizedBox(width: AppSpacing.sm),
                ],
                Expanded(
                  child: Text(title, style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.primary)),
                ),
              ],
            ),
          ),
        ),
        if (subtitle != null)
          Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.smd, 0, AppSpacing.smd, AppSpacing.sm),
            child: Text(
              subtitle!,
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ),
        Card(
          child: Column(
            children: [
              for (var i = 0; i < children.length; i++) ...[
                if (i > 0) const Divider(height: 1, indent: AppSpacing.md, endIndent: AppSpacing.md),
                children[i],
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// A row that opens a picker: appearance, language.
class SettingsOptionTile<T> extends StatelessWidget {
  const SettingsOptionTile({
    super.key,
    required this.icon,
    required this.title,
    required this.value,
    required this.options,
    required this.selected,
    required this.labelBuilder,
    required this.onChanged,
  });

  final IconData icon;
  final String title;
  final String value;
  final List<T> options;
  final T selected;
  final String Function(T) labelBuilder;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) => ListTile(
    leading: Icon(icon, size: AppSizes.iconMedium),
    title: Text(title),
    subtitle: Text(value, style: Theme.of(context).textTheme.bodySmall),
    trailing: const Icon(Icons.chevron_right, size: AppSizes.iconMedium),
    onTap: () async {
      final picked = await showModalBottomSheet<T>(
        context: context,
        builder: (context) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final option in options)
                RadioListTile<T>(
                  value: option,
                  // ignore: deprecated_member_use
                  groupValue: option == selected ? selected : null,
                  // ignore: deprecated_member_use
                  onChanged: (value) => Navigator.of(context).pop(value),
                  title: Text(labelBuilder(option)),
                ),
            ],
          ),
        ),
      );
      if (picked != null && picked != selected) onChanged(picked);
    },
  );
}

/// A row that toggles a boolean setting.
class SettingsSwitchTile extends StatelessWidget {
  const SettingsSwitchTile({
    super.key,
    required this.icon,
    required this.title,
    required this.value,
    required this.onChanged,
    this.subtitle,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) => SwitchListTile(
    secondary: Icon(icon, size: AppSizes.iconMedium),
    title: Text(title),
    subtitle: subtitle == null ? null : Text(subtitle!, style: Theme.of(context).textTheme.bodySmall),
    value: value,
    onChanged: onChanged,
  );
}

/// A row that runs an action: log out, edit profile.
class SettingsActionTile extends StatelessWidget {
  const SettingsActionTile({
    super.key,
    required this.icon,
    required this.title,
    required this.onTap,
    this.destructive = false,
    this.subtitle,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = destructive ? theme.colorScheme.error : null;
    return ListTile(
      leading: Icon(icon, size: AppSizes.iconMedium, color: color),
      title: Text(title, style: color == null ? null : TextStyle(color: color)),
      subtitle: subtitle == null ? null : Text(subtitle!, style: theme.textTheme.bodySmall),
      onTap: onTap,
    );
  }
}
