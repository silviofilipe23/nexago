import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app_mobile_role.dart';
import 'auth_providers.dart';
import 'role_preferences_repository.dart';
import 'user_roles.dart';

final rolePreferencesRepositoryProvider =
    Provider<RolePreferencesRepository>((ref) {
  throw UnimplementedError(
    'rolePreferencesRepositoryProvider must be overridden in main()',
  );
});

/// Papel ativo na sessão atual (null até resolver após login).
final activeMobileRoleProvider =
    NotifierProvider<ActiveMobileRoleNotifier, AppMobileRole?>(
  ActiveMobileRoleNotifier.new,
);

class ActiveMobileRoleNotifier extends Notifier<AppMobileRole?> {
  @override
  AppMobileRole? build() {
    ref.listen<AsyncValue<User?>>(authProvider, (previous, next) {
      if (next.valueOrNull == null) {
        state = null;
      }
    });
    return null;
  }

  void setRole(AppMobileRole role) {
    state = role;
  }

  void clearSessionRole() {
    state = null;
  }

  Future<void> confirmRole({required AppMobileRole role}) async {
    final uid = ref.read(authProvider).valueOrNull?.uid;
    state = role;
    if (uid == null || uid.isEmpty) return;
    await ref.read(rolePreferencesRepositoryProvider).saveRoleChoice(
          uid: uid,
          role: role,
        );
  }

  Future<void> prepareForRoleSwitch() async {
    state = null;
  }
}

/// Papéis disponíveis para o usuário logado (claims do token).
final availableMobileRolesProvider = FutureProvider<List<AppMobileRole>>((ref) async {
  final user = ref.watch(authProvider).valueOrNull;
  if (user == null) return const [];
  final token = await user.getIdTokenResult(true);
  return mobileRolesFromIdToken(token);
});

/// Resolve o papel ativo: sessão, preferência salva ou único papel disponível.
Future<AppMobileRole?> resolveActiveMobileRole(Ref ref) async {
  final user = ref.read(authProvider).valueOrNull;
  if (user == null) return null;

  final sessionRole = ref.read(activeMobileRoleProvider);
  final token = await user.getIdTokenResult(true);
  final available = mobileRolesFromIdToken(token);

  if (available.length == 1) {
    final only = available.first;
    ref.read(activeMobileRoleProvider.notifier).setRole(only);
    return only;
  }

  if (sessionRole != null && available.contains(sessionRole)) {
    return sessionRole;
  }

  final saved = ref.read(rolePreferencesRepositoryProvider).loadRole(user.uid);
  if (saved != null && available.contains(saved)) {
    ref.read(activeMobileRoleProvider.notifier).setRole(saved);
    return saved;
  }

  return null;
}

/// Indica se o usuário precisa passar pela tela de seleção de papel.
Future<bool> needsRoleSelectionFlow(Ref ref) async {
  final user = ref.read(authProvider).valueOrNull;
  if (user == null) return false;

  final token = await user.getIdTokenResult(true);
  final available = mobileRolesFromIdToken(token);
  if (available.length <= 1) return false;

  final active = await resolveActiveMobileRole(ref);
  if (active != null) return false;

  final saved = ref.read(rolePreferencesRepositoryProvider).loadRole(user.uid);
  return userNeedsRoleSelection(
    availableRoles: available,
    savedRole: saved,
  );
}

final hasMultipleMobileRolesProvider = Provider<bool>((ref) {
  final rolesAsync = ref.watch(availableMobileRolesProvider);
  return rolesAsync.maybeWhen(
    data: (roles) => roles.length > 1,
    orElse: () => false,
  );
});
