import 'package:flutter/material.dart';

import '../../models/user.dart';
import '../format.dart';

class UserAvatar extends StatelessWidget {
  const UserAvatar({super.key, required this.user, this.radius = 22, this.showPresence = false});

  final User user;
  final double radius;
  final bool showPresence;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final url = user.avatarUrl;
    final avatar = CircleAvatar(
      radius: radius,
      backgroundColor: scheme.primaryContainer,
      foregroundColor: scheme.onPrimaryContainer,
      // The initials stay underneath, so a broken image URL degrades gracefully.
      foregroundImage: url == null || url.isEmpty ? null : NetworkImage(url),
      onForegroundImageError: url == null || url.isEmpty ? null : (_, _) {},
      child: Text(
        initials(user.displayName),
        style: TextStyle(fontSize: radius * 0.75, fontWeight: FontWeight.w600),
      ),
    );
    if (!showPresence || !user.isOnline) return ExcludeSemantics(child: avatar);
    return ExcludeSemantics(
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          avatar,
          Positioned(
            right: 0,
            bottom: 0,
            child: Container(
              width: radius * 0.55,
              height: radius * 0.55,
              decoration: BoxDecoration(
                color: Colors.green.shade500,
                shape: BoxShape.circle,
                border: Border.all(color: scheme.surface, width: 2),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
