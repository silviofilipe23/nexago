import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import 'arena_role.dart';

/// `true` se o usuário logado tem o papel `arena` nas custom claims (`roles` ou `role`).
///
/// Usa [User.getIdTokenResult] com refresh para refletir claims recém-atribuídas.
final arenaPanelAccessProvider = FutureProvider<bool>((ref) async {
  final user = ref.watch(authProvider).valueOrNull;
  if (user == null) return false;
  final token = await user.getIdTokenResult(true);
  return userHasArenaRole(token);
});
