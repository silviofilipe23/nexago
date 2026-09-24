import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';

/// Espelho do corpo de casos de `functions/src/arena-staff.test.ts` e
/// `functions/test/arena-staff-rbac.rules.test.mjs`. Se divergir das outras
/// quatro cópias da matriz, é aqui que tem de quebrar.
void main() {
  const writeAreas = <ArenaStaffRole, Set<ArenaArea>>{
    ArenaStaffRole.gestor: {
      ArenaArea.agenda, ArenaArea.comandas, ArenaArea.estoque,
      ArenaArea.promocoes, ArenaArea.site, ArenaArea.quadras,
      ArenaArea.perfil, ArenaArea.comunidade,
    },
    ArenaStaffRole.recepcao: {ArenaArea.agenda, ArenaArea.comandas},
    ArenaStaffRole.financeiro: {ArenaArea.promocoes},
    ArenaStaffRole.manutencao: {ArenaArea.quadras, ArenaArea.estoque},
  };

  const readAreas = <ArenaStaffRole, Set<ArenaArea>>{
    ArenaStaffRole.gestor: {
      ArenaArea.agenda, ArenaArea.comandas, ArenaArea.estoque,
      ArenaArea.promocoes, ArenaArea.site, ArenaArea.quadras,
      ArenaArea.perfil, ArenaArea.comunidade,
      ArenaArea.financeiro, ArenaArea.torneios,
    },
    ArenaStaffRole.recepcao: {
      ArenaArea.agenda, ArenaArea.comandas,
      ArenaArea.estoque, ArenaArea.comunidade,
    },
    ArenaStaffRole.financeiro: {
      ArenaArea.promocoes, ArenaArea.financeiro,
      ArenaArea.comandas, ArenaArea.comunidade,
    },
    ArenaStaffRole.manutencao: {
      ArenaArea.quadras, ArenaArea.estoque, ArenaArea.agenda,
    },
  };

  group('matriz cargo x area', () {
    for (final role in ArenaStaffRole.values) {
      for (final area in ArenaArea.values) {
        final canWrite = writeAreas[role]!.contains(area);
        final canRead = readAreas[role]!.contains(area);

        test('$role escreve em $area: $canWrite', () {
          expect(arenaRoleCanWrite(role, area), canWrite);
        });

        test('$role le $area: $canRead', () {
          expect(arenaRoleCanRead(role, area), canRead);
        });
      }
    }
  });

  test('escrita implica leitura em todas as combinacoes', () {
    for (final role in ArenaStaffRole.values) {
      for (final area in ArenaArea.values) {
        if (arenaRoleCanWrite(role, area)) {
          expect(arenaRoleCanRead(role, area), isTrue,
              reason: '$role escreve em $area mas nao le');
        }
      }
    }
  });

  group('arenaStaffRoleFromValue', () {
    test('casa os quatro valores do Firestore', () {
      expect(arenaStaffRoleFromValue('gestor'), ArenaStaffRole.gestor);
      expect(arenaStaffRoleFromValue('recepcao'), ArenaStaffRole.recepcao);
      expect(arenaStaffRoleFromValue('financeiro'), ArenaStaffRole.financeiro);
      expect(arenaStaffRoleFromValue('manutencao'), ArenaStaffRole.manutencao);
    });

    test('devolve null para desconhecido, vazio e null', () {
      expect(arenaStaffRoleFromValue('dono'), isNull);
      expect(arenaStaffRoleFromValue(''), isNull);
      expect(arenaStaffRoleFromValue(null), isNull);
    });
  });
}
