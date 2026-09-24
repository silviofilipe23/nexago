import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_selection_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';

ProviderContainer containerWith(List<ArenaMembership> all) {
  final container = ProviderContainer(overrides: [
    ownedArenaMembershipsProvider
        .overrideWith((ref) => Stream.value(all.where((m) => m.isOwner).toList())),
    staffArenaMembershipsProvider
        .overrideWith((ref) => Stream.value(all.where((m) => !m.isOwner).toList())),
  ]);
  addTearDown(container.dispose);
  container.listen(arenaMembershipsProvider, (_, __) {});
  return container;
}

void main() {
  test('uma arena nao exige selecao', () async {
    final container = containerWith([
      const ArenaMembership(arenaId: 'a1', name: 'Vegeton', isOwner: true),
    ]);
    await Future<void>.delayed(Duration.zero);
    expect(container.read(needsArenaSelectionProvider), isFalse);
  });

  test('duas arenas sem escolha exigem selecao', () async {
    final container = containerWith([
      const ArenaMembership(arenaId: 'a1', name: 'Vegeton', isOwner: true),
      const ArenaMembership(
          arenaId: 'a2',
          name: 'Areia Nobre',
          isOwner: false,
          role: ArenaStaffRole.gestor),
    ]);
    await Future<void>.delayed(Duration.zero);
    expect(container.read(needsArenaSelectionProvider), isTrue);

    container.read(currentArenaIdProvider.notifier).selectArena('a2');
    expect(container.read(needsArenaSelectionProvider), isFalse);
  });
}
