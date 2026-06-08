import 'package:firebase_auth/firebase_auth.dart';

import 'app_mobile_role.dart';

/// Valores em `customClaims['roles']` (array) ou legado `role` (string) — alinhado a `functions/src/auth-roles.ts`.
const String kArenaAppRole = 'arena';
const String kAthleteAppRole = 'athlete';
const String kOrganizerAppRole = 'organizer';

/// Extrai papéis do token.
List<String> appRolesFromIdToken(IdTokenResult result) {
  final claims = result.claims;
  if (claims == null) return [];
  final roles = claims['roles'];
  if (roles is List) {
    return roles.whereType<String>().toList();
  }
  final legacy = claims['role'];
  if (legacy is String && legacy.isNotEmpty) {
    return [legacy];
  }
  return [];
}

bool userHasArenaRole(IdTokenResult result) {
  return appRolesFromIdToken(result).contains(kArenaAppRole);
}

bool userHasAthleteRole(IdTokenResult result) {
  return appRolesFromIdToken(result).contains(kAthleteAppRole);
}

bool userHasOrganizerRole(IdTokenResult result) {
  return appRolesFromIdToken(result).contains(kOrganizerAppRole);
}

/// Papéis mobile a partir do token (`admin` é ignorado).
List<AppMobileRole> mobileRolesFromIdToken(IdTokenResult result) {
  final claims = appRolesFromIdToken(result);
  final roles = <AppMobileRole>[];
  for (final claim in claims) {
    final role = AppMobileRole.fromClaim(claim);
    if (role != null && !roles.contains(role)) {
      roles.add(role);
    }
  }
  if (roles.isEmpty) {
    roles.add(AppMobileRole.athlete);
  }
  return roles;
}

/// Exige tela de seleção quando há múltiplos papéis e não há preferência válida.
bool userNeedsRoleSelection({
  required List<AppMobileRole> availableRoles,
  AppMobileRole? savedRole,
  required bool rememberChoice,
}) {
  if (availableRoles.length <= 1) return false;
  if (rememberChoice &&
      savedRole != null &&
      availableRoles.contains(savedRole)) {
    return false;
  }
  return true;
}

String defaultHomeForRole(AppMobileRole role) => role.homeRoute;

/// Gestor só de arena (sem papel de atleta): landing no painel da arena.
bool userIsArenaOnlyManager(IdTokenResult result) {
  return userHasArenaRole(result) && !userHasAthleteRole(result);
}
