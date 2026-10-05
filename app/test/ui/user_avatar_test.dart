import 'package:chat_app/models/user.dart';
import 'package:chat_app/ui/widgets/user_avatar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

User _user({required bool online}) => User.fromJson({
  'id': 'u1',
  'username': 'sara',
  'displayName': 'Sara',
  'avatarUrl': null,
  'isOnline': online,
  'lastSeenAt': null,
});

Future<void> _pump(WidgetTester tester, TextDirection direction, User user) => tester.pumpWidget(
  MaterialApp(
    home: Directionality(
      textDirection: direction,
      child: Center(child: UserAvatar(user: user, radius: 40, showPresence: true)),
    ),
  ),
);

void main() {
  testWidgets('the presence dot sits at the trailing corner: right in LTR, left in RTL', (tester) async {
    await _pump(tester, TextDirection.ltr, _user(online: true));
    final avatarLtr = tester.getRect(find.byType(CircleAvatar));
    final dotLtr = tester.getRect(find.byKey(const Key('avatar.presence')));
    expect(dotLtr.right, closeTo(avatarLtr.right, 1));
    expect(dotLtr.bottom, closeTo(avatarLtr.bottom, 1));

    await _pump(tester, TextDirection.rtl, _user(online: true));
    final avatarRtl = tester.getRect(find.byType(CircleAvatar));
    final dotRtl = tester.getRect(find.byKey(const Key('avatar.presence')));
    expect(dotRtl.left, closeTo(avatarRtl.left, 1));
    expect(dotRtl.bottom, closeTo(avatarRtl.bottom, 1));
  });

  testWidgets('no dot for an offline user', (tester) async {
    await _pump(tester, TextDirection.ltr, _user(online: false));
    expect(find.byKey(const Key('avatar.presence')), findsNothing);
  });
}
