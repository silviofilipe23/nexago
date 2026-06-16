import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/athlete/domain/athlete_profile_providers.dart';
import '../../features/auth/domain/post_login_bootstrap.dart';
import '../auth/auth_providers.dart';
import '../auth/active_role_providers.dart';

/// Notifica o [GoRouter] quando o estado de auth muda (redirect de novo).
final goRouterRefreshNotifierProvider = Provider<GoRouterRefreshNotifier>((ref) {
  final notifier = GoRouterRefreshNotifier();
  ref.listen<AsyncValue<User?>>(
    authProvider,
    (previous, next) => notifier.notifyAuthChanged(),
  );
  ref.listen(
    athleteProfileProvider,
    (previous, next) => notifier.notifyAuthChanged(),
  );
  ref.listen(activeMobileRoleProvider, (previous, next) {
    notifier.notifyAuthChanged();
  });
  ref.listen(roleSwitchPendingProvider, (previous, next) {
    notifier.notifyAuthChanged();
  });
  ref.listen(sessionBootstrapProvider, (previous, next) {
    notifier.notifyAuthChanged();
  });
  return notifier;
});

class GoRouterRefreshNotifier extends ChangeNotifier {
  void notifyAuthChanged() => notifyListeners();
}
