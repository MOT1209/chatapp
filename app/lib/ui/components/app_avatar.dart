import 'package:flutter/material.dart';

import '../l10n.dart';
import '../../models/user.dart';
import '../design/app_colors.dart';
import '../design/tokens.dart';
import '../format.dart';

/// Avatar sizes used across the app, so a list row, a chat header and a profile
/// header never disagree about how big an avatar is.
enum AvatarSize {
  small(AppSizes.avatarSmall),
  medium(AppSizes.avatarMedium),
  large(AppSizes.avatarLarge);

  const AvatarSize(this.diameter);

  final double diameter;

  double get radius => diameter / 2;
}

/// Round avatar with an optional presence dot.
///
/// The dot is positioned with [PositionedDirectional] so it sits at the
/// end-side corner in Arabic and the start-side corner in English, and its
/// colour comes from [AppPalette] rather than a hardcoded green.
class UserAvatar extends StatelessWidget {
  const UserAvatar({super.key, required this.user, this.size = AvatarSize.medium, this.showPresence = false});

  final User user;
  final AvatarSize size;

  /// Draws the presence dot. Offline participants get a hollow dot; users who
  /// have never been seen get none.
  final bool showPresence;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final palette = AppPalette.of(context);
    final radius = size.radius;
    final url = user.avatarUrl;
    final hasImage = url != null && url.isNotEmpty;

    final avatar = CircleAvatar(
      radius: radius,
      backgroundColor: scheme.primaryContainer,
      foregroundColor: scheme.onPrimaryContainer,
      // Initials sit underneath, so a broken or slow image URL degrades to the
      // initials rather than an empty hole.
      foregroundImage: hasImage ? NetworkImage(url) : null,
      onForegroundImageError: hasImage ? (_, _) {} : null,
      child: Text(
        initials(user.displayName),
        style: TextStyle(fontSize: radius * 0.75, fontWeight: FontWeight.w600),
      ),
    );

    if (!showPresence) {
      return ExcludeSemantics(
        child: Semantics(image: true, label: user.displayName, child: avatar),
      );
    }

    final seen = user.lastSeenAt;
    final presenceColor = user.isOnline
        ? palette.online
        : seen == null
        ? scheme.outline
        : palette.away;
    final presence = user.isOnline
        ? context.l10n.online
        : seen == null
        ? context.l10n.offline
        : presenceLabel(context.l10n, user);

    return Semantics(
      label: user.displayName,
      value: presence,
      excludeSemantics: true,
      child: ExcludeSemantics(
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            avatar,
            PositionedDirectional(
              end: 0,
              bottom: 0,
              child: Container(
                width: radius * 0.5,
                height: radius * 0.5,
                decoration: BoxDecoration(
                  color: user.isOnline ? presenceColor : scheme.surface,
                  shape: BoxShape.circle,
                  border: Border.all(color: user.isOnline ? scheme.surface : presenceColor, width: radius * 0.12),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
