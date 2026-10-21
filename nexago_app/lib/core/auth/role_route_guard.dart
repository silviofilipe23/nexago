import '../../core/router/routes.dart';
import '../../features/arena/domain/arena_route_guard.dart';
import 'app_mobile_role.dart';

bool isRoleSelectionPath(String path) => path == AppRoutes.roleSelection;

/// Home do modo Professor.
bool isProfessorExperiencePath(String path) {
  return path == AppRoutes.professorHome ||
      path.startsWith('${AppRoutes.professorHome}/');
}

/// Telas do professor que abrem em QUALQUER papel: vínculos (Minhas arenas,
/// detalhe — "Minhas arenas" fica nos ajustes do atleta antes do primeiro
/// vínculo, quando ainda não há a claim) e chamada. O push `professor_link_*`
/// abre o vínculo sem trocar de papel. Quem autoriza é o vínculo no servidor.
bool isProfessorSharedPath(String path) {
  return path.startsWith('/athlete/professor/');
}

/// No modo Professor seguem abertas as telas de arena do atleta (página
/// pública e fluxo de reserva): é por elas que o professor reserva quadra.
bool isProfessorAllowedArenaPath(String path) {
  return path.startsWith('/arena/') && !isArenaManagerPanelPath(path);
}

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
      path == AppRoutes.bookingSuccess ||
      path == AppRoutes.athleteCashback ||
      path == AppRoutes.community ||
      path == AppRoutes.store) {
    return true;
  }
  if (path.startsWith('${AppRoutes.store}/')) return true;
  if (path.startsWith('/athlete/')) return true;
  if (path.startsWith('/competir/')) return true;
  if (path.startsWith('/torneios')) return true;
  if (path.startsWith('/ligas/')) return true;
  if (path.startsWith('/torneios-convite/')) return true;
  if (path.startsWith('/convite/')) return true;
  // Convite do professor para a carteira: o atleta responde no modo Atleta.
  if (path.startsWith('/convite-professor/')) return true;
  // Comunicado do professor: o aluno lê e responde no modo Atleta.
  if (path.startsWith('/aviso-professor/')) return true;
  // Pagamento ao professor confirmado e comprovante (modo Atleta).
  if (path.startsWith('/pagamento-aula/')) return true;
  // Mensagens do atleta com os professores.
  if (path == '/mensagens' || path.startsWith('/mensagens/')) return true;
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
  bool arenaAreaAllowed = true,
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

  if (isProfessorSharedPath(path)) return null;

  if (isProfessorExperiencePath(path) &&
      activeRole != AppMobileRole.professor) {
    return activeRole.homeRoute;
  }

  if (isAthleteExperiencePath(path) &&
      activeRole != AppMobileRole.athlete &&
      !(activeRole == AppMobileRole.professor &&
          isProfessorAllowedArenaPath(path))) {
    return activeRole.homeRoute;
  }

  if (isArenaManagerPanelPath(path) && activeRole != AppMobileRole.arena) {
    return activeRole.homeRoute;
  }

  // Membro de equipe no painel: o cargo nao alcanca a area desta rota. Volta
  // ao Painel, que nao tem area — nao ao login, porque a pessoa TEM painel.
  // Fail-closed de proposito: erro ao resolver o acesso tambem cai aqui, e o
  // pior caso e abrir na tela inicial.
  if (isArenaManagerPanelPath(path) &&
      activeRole == AppMobileRole.arena &&
      !arenaAreaAllowed &&
      path != AppRoutes.arenaDashboard) {
    return AppRoutes.arenaDashboard;
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
