import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_selection_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';

ArenaMembership owner(String id, String name) =>
    ArenaMembership(arenaId: id, name: name, isOwner: true);

ArenaMembership staff(String id, String name, ArenaStaffRole role) =>
    ArenaMembership(arenaId: id, name: name, isOwner: false, role: role);

ProviderContainer containerWith(List<ArenaMembership> memberships,
    {bool loading = false}) {
  final container = ProviderContainer(overrides: [
    ownedArenaMembershipsProvider.overrideWith(
      (ref) => loading
          ? const Stream<List<ArenaMembership>>.empty()
          : Stream.value(memberships.where((m) => m.isOwner).toList()),
    ),
    staffArenaMembershipsProvider.overrideWith(
      (ref) => Stream.value(memberships.where((m) => !m.isOwner).toList()),
    ),
  ]);
  addTearDown(container.dispose);
  container.listen(arenaMembershipsProvider, (_, __) {});
  return container;
}

void main() {
  test('sem vinculo o acesso nega tudo e nao tem arenaId', () async {
    final container = containerWith(const []);
    await Future<void>.delayed(Duration.zero);
    final access = container.read(arenaAccessProvider).valueOrNull;
    expect(access?.arenaId, isNull);
    expect(access?.canRead(ArenaArea.agenda), isFalse);
  });

  test('vinculo unico vira o acesso ativo', () async {
    final container = containerWith([staff('a1', 'Vegeton', ArenaStaffRole.recepcao)]);
    await Future<void>.delayed(Duration.zero);
    final access = container.read(arenaAccessProvider).valueOrNull;
    expect(access?.arenaId, 'a1');
    expect(access?.canWrite(ArenaArea.comandas), isTrue);
    expect(access?.canRead(ArenaArea.financeiro), isFalse);
  });

  test('com duas arenas, a selecao manda', () async {
    final container = containerWith([
      staff('a1', 'Vegeton', ArenaStaffRole.recepcao),
      owner('a2', 'Areia Nobre'),
    ]);
    await Future<void>.delayed(Duration.zero);
    container.read(currentArenaIdProvider.notifier).selectArena('a1');
    final access = container.read(arenaAccessProvider).valueOrNull;
    expect(access?.arenaId, 'a1');
    expect(access?.isOwner, isFalse);
  });

  test('selecao inexistente cai na primeira arena', () async {
    final container = containerWith([owner('a2', 'Areia Nobre')]);
    await Future<void>.delayed(Duration.zero);
    container.read(currentArenaIdProvider.notifier).selectArena('sumiu');
    expect(container.read(arenaAccessProvider).valueOrNull?.arenaId, 'a2');
  });

  test('enquanto carrega, canRead e canWrite respondem false', () async {
    final container = containerWith(const [], loading: true);
    await Future<void>.delayed(Duration.zero);
    expect(container.read(arenaCanReadProvider(ArenaArea.financeiro)), isFalse);
    expect(container.read(arenaCanWriteProvider(ArenaArea.agenda)), isFalse);
  });

  test('dono responde true em canRead/canWrite de qualquer area', () async {
    final container = containerWith([owner('a1', 'Vegeton')]);
    await Future<void>.delayed(Duration.zero);
    expect(container.read(arenaCanReadProvider(ArenaArea.financeiro)), isTrue);
    expect(container.read(arenaCanWriteProvider(ArenaArea.perfil)), isTrue);
  });

  // Revogacao ao vivo: o portal remove o membro e o espelho perde o doc. Como
  // a fonte e um listener, o painel tem de cair no mesmo instante — e isso que
  // o spec promete e o que um resolvedor por callable NAO daria.
  test('membro removido no meio da sessao perde o acesso', () async {
    final staffController =
        StreamController<List<ArenaMembership>>.broadcast();
    addTearDown(staffController.close);
    final container = ProviderContainer(overrides: [
      ownedArenaMembershipsProvider
          .overrideWith((ref) => Stream.value(const <ArenaMembership>[])),
      staffArenaMembershipsProvider
          .overrideWith((ref) => staffController.stream),
    ]);
    addTearDown(container.dispose);
    container.listen(arenaMembershipsProvider, (_, __) {});

    staffController.add([staff('a1', 'Vegeton', ArenaStaffRole.gestor)]);
    await Future<void>.delayed(Duration.zero);
    expect(container.read(arenaAccessProvider).valueOrNull?.arenaId, 'a1');

    staffController.add(const []);
    await Future<void>.delayed(Duration.zero);
    expect(container.read(arenaAccessProvider).valueOrNull?.arenaId, isNull);
    expect(container.read(arenaCanReadProvider(ArenaArea.agenda)), isFalse);
  });
}
