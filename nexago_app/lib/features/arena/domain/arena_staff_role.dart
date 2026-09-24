/// Matriz de acesso por cargo da equipe da arena.
///
/// ESPELHO MANUAL — esta matriz existe em CINCO lugares e os cinco precisam
/// andar juntos:
///  1. este arquivo (app Flutter: abas, guard de rota, telas);
///  2. `frontend/projects/arena/src/app/painel/data/arena-roles.model.ts` (portal);
///  3. `functions/src/arena-staff-roles.ts` (validacao dos callables);
///  4. o mapa literal em `firestore.rules` (a autoridade de verdade);
///  5. `frontend/projects/arena/src/app/auth/arena-access.service.spec.ts`.
///
/// Nada automatiza o espelhamento. O que segura a divergencia e o corpo de
/// casos compartilhado entre os testes das copias — ver
/// `test/features/arena/domain/arena_staff_role_test.dart`.
enum ArenaStaffRole { gestor, recepcao, financeiro, manutencao }

enum ArenaArea {
  agenda,
  comandas,
  estoque,
  financeiro,
  promocoes,
  site,
  quadras,
  perfil,
  torneios,
  comunidade,
}

/// Areas em que o cargo pode escrever. Escrita implica leitura.
const Map<ArenaStaffRole, Set<ArenaArea>> _writeAreas = {
  ArenaStaffRole.gestor: {
    ArenaArea.agenda,
    ArenaArea.comandas,
    ArenaArea.estoque,
    ArenaArea.promocoes,
    ArenaArea.site,
    ArenaArea.quadras,
    ArenaArea.perfil,
    ArenaArea.comunidade,
  },
  ArenaStaffRole.recepcao: {ArenaArea.agenda, ArenaArea.comandas},
  ArenaStaffRole.financeiro: {ArenaArea.promocoes},
  ArenaStaffRole.manutencao: {ArenaArea.quadras, ArenaArea.estoque},
};

/// Areas so de leitura, somadas as de escrita.
const Map<ArenaStaffRole, Set<ArenaArea>> _readOnlyAreas = {
  ArenaStaffRole.gestor: {ArenaArea.financeiro, ArenaArea.torneios},
  ArenaStaffRole.recepcao: {ArenaArea.estoque, ArenaArea.comunidade},
  ArenaStaffRole.financeiro: {
    ArenaArea.financeiro,
    ArenaArea.comandas,
    ArenaArea.comunidade,
  },
  ArenaStaffRole.manutencao: {ArenaArea.agenda},
};

bool arenaRoleCanWrite(ArenaStaffRole role, ArenaArea area) {
  return _writeAreas[role]?.contains(area) ?? false;
}

bool arenaRoleCanRead(ArenaStaffRole role, ArenaArea area) {
  return arenaRoleCanWrite(role, area) ||
      (_readOnlyAreas[role]?.contains(area) ?? false);
}

/// Valor gravado em `arenas/{id}/staff/{uid}.role` e no espelho.
ArenaStaffRole? arenaStaffRoleFromValue(String? value) {
  switch (value?.trim()) {
    case 'gestor':
      return ArenaStaffRole.gestor;
    case 'recepcao':
      return ArenaStaffRole.recepcao;
    case 'financeiro':
      return ArenaStaffRole.financeiro;
    case 'manutencao':
      return ArenaStaffRole.manutencao;
    default:
      return null;
  }
}

String arenaStaffRoleLabel(ArenaStaffRole role) => switch (role) {
      ArenaStaffRole.gestor => 'Gestor',
      ArenaStaffRole.recepcao => 'Recepção',
      ArenaStaffRole.financeiro => 'Financeiro',
      ArenaStaffRole.manutencao => 'Manutenção',
    };
