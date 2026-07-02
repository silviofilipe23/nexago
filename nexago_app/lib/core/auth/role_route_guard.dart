import '../../core/router/routes.dart';
import '../../features/arena/domain/arena_route_guard.dart';
import 'app_mobile_role.dart';

bool isRoleSelectionPath(String path) => path == AppRoutes.roleSelection;

bool isOrganizerExperiencePath(String path) {
  return path == AppRoutes.organizerHome || path.startsWith('/organizer/');
}

/// Rotas de operação de um torneio específico — liberadas também para staff
/// (gestor/mesário) sem o papel organizer. Exclui criação de torneio.
bool isOrganizerStaffOperablePath(String path) {
  return path.startsWith('/organizer/tournaments/') &&
      !path.startsWith('/organizer/tournaments/new');
}

/// Rotas do fluxo atleta (shell, perfil, competir, reservas como jogador).
bool isAthleteExperiencePath(String path) {
  if (path == AppRoutes.discover ||
      path == AppRoutes.home ||
      path == '/' ||
      path == AppRoutes.myBookings ||
      path == AppRoutes.bookingSuccess) {
    return true;
  }
  if (path.startsWith('/athlete/')) return true;
  if (path.startsWith('/competir/')) return true;
  if (path.startsWith('/torneios')) return true;
  if (path.startsWith('/ligas/')) return true;
  if (path.startsWith('/torneios-convite/')) return true;
  if (path.startsWith('/convite/')) return true;
  if (path.startsWith('/arena/') && !isArenaManagerPanelPath(path)) {
    return true;
  }
  return false;
}

/// Redireciona quando o usuário acessa rota incompatível com o papel ativo.
String? redirectForActiveRole({
  required String path,
  required AppMobileRole? activeRole,
  required List<AppMobileRole> availableRoles,
  required bool needsRoleSelection,
  bool canOperateStaffTournaments = false,
}) {
  if (needsRoleSelection) {
    if (!isRoleSelectionPath(path) &&
        path != AppRoutes.login &&
        path != AppRoutes.register &&
        path != AppRoutes.forgotPassword &&
        !path.startsWith('/convite/')) {
      return AppRoutes.roleSelection;
    }
    return null;
  }

  if (activeRole == null) return null;

  if (isRoleSelectionPath(path)) {
    return activeRole.homeRoute;
  }

  if (isAthleteExperiencePath(path) && activeRole != AppMobileRole.athlete) {
    return activeRole.homeRoute;
  }

  if (isArenaManagerPanelPath(path) && activeRole != AppMobileRole.arena) {
    return activeRole.homeRoute;
  }

  if (isOrganizerExperiencePath(path) &&
      activeRole != AppMobileRole.organizer) {
    if (canOperateStaffTournaments && isOrganizerStaffOperablePath(path)) {
      return null;
    }
    return activeRole.homeRoute;
  }

  if ((path == AppRoutes.home || path == '/') &&
      activeRole != AppMobileRole.athlete) {
    return activeRole.homeRoute;
  }

  if (path == AppRoutes.discover && activeRole != AppMobileRole.athlete) {
    return activeRole.homeRoute;
  }

  if (availableRoles.length <= 1 && isRoleSelectionPath(path)) {
    return activeRole.homeRoute;
  }

  return null;
}
