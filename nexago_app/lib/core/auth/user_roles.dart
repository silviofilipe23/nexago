import 'package:firebase_auth/firebase_auth.dart';

/// Valores em `customClaims['roles']` (array) ou legado `role` (string) — alinhado a `functions/src/auth-roles.ts`.
const String kArenaAppRole = 'arena';
const String kAthleteAppRole = 'athlete';

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

/// Gestor só de arena (sem papel de atleta): landing no painel da arena.
bool userIsArenaOnlyManager(IdTokenResult result) {
  return userHasArenaRole(result) && !userHasAthleteRole(result);
}
