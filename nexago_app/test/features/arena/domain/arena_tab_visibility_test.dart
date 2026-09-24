import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/domain/arena_tab.dart';
import 'package:nexago_app/features/arena/domain/arena_tab_visibility.dart';

ArenaAccess accessFor(ArenaStaffRole role) => ArenaAccess.of(
      ArenaMembership(
          arenaId: 'a1', name: 'Vegeton', isOwner: false, role: role),
    );

void main() {
  test('dono ve as cinco abas', () {
    final tabs = visibleArenaTabs(
      ArenaAccess.of(
          const ArenaMembership(arenaId: 'a1', name: 'V', isOwner: true)),
      accessLoaded: true,
    );
    expect(tabs, ArenaTab.values);
  });

  test('gestor ve as cinco abas', () {
    expect(visibleArenaTabs(accessFor(ArenaStaffRole.gestor), accessLoaded: true),
        ArenaTab.values);
  });

  test('recepcao ve as cinco abas', () {
    expect(
        visibleArenaTabs(accessFor(ArenaStaffRole.recepcao), accessLoaded: true),
        ArenaTab.values);
  });

  test('manutencao perde Comandas', () {
    expect(
      visibleArenaTabs(accessFor(ArenaStaffRole.manutencao), accessLoaded: true),
      [ArenaTab.dashboard, ArenaTab.schedule, ArenaTab.bookings, ArenaTab.settings],
    );
  });

  test('financeiro perde Agenda e Reservas', () {
    expect(
      visibleArenaTabs(accessFor(ArenaStaffRole.financeiro), accessLoaded: true),
      [ArenaTab.dashboard, ArenaTab.comandas, ArenaTab.settings],
    );
  });

  test('enquanto o acesso carrega, mostra tudo', () {
    expect(visibleArenaTabs(ArenaAccess.none, accessLoaded: false),
        ArenaTab.values);
  });

  test('sem vinculo resolvido, so Painel e Ajustes', () {
    expect(visibleArenaTabs(ArenaAccess.none, accessLoaded: true),
        [ArenaTab.dashboard, ArenaTab.settings]);
  });
}
