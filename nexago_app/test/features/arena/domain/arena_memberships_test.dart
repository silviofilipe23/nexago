import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';

ArenaMembership owner(String id, String name) =>
    ArenaMembership(arenaId: id, name: name, isOwner: true);

ArenaMembership staff(String id, String name, ArenaStaffRole role) =>
    ArenaMembership(arenaId: id, name: name, isOwner: false, role: role);

void main() {
  group('mergeArenaMemberships', () {
    test('une as duas fontes ordenadas por nome', () {
      final merged = mergeArenaMemberships(
        owned: [owner('a1', 'Vegeton')],
        staff: [staff('a2', 'Areia Nobre', ArenaStaffRole.recepcao)],
      );
      expect(merged.map((m) => m.arenaId), ['a2', 'a1']);
    });

    test('dono vence quando a mesma arena aparece nas duas fontes', () {
      final merged = mergeArenaMemberships(
        owned: [owner('a1', 'Vegeton')],
        staff: [staff('a1', 'Vegeton', ArenaStaffRole.recepcao)],
      );
      expect(merged, hasLength(1));
      expect(merged.single.isOwner, isTrue);
      expect(merged.single.role, isNull);
    });

    test('lista vazia quando nao ha vinculo', () {
      expect(mergeArenaMemberships(owned: const [], staff: const []), isEmpty);
    });
  });

  group('ArenaMembership.canRead/canWrite', () {
    test('dono alcanca tudo', () {
      final m = owner('a1', 'Vegeton');
      for (final area in ArenaArea.values) {
        expect(m.canRead(area), isTrue);
        expect(m.canWrite(area), isTrue);
      }
    });

    test('manutencao le agenda e nao escreve', () {
      final m = staff('a1', 'Vegeton', ArenaStaffRole.manutencao);
      expect(m.canRead(ArenaArea.agenda), isTrue);
      expect(m.canWrite(ArenaArea.agenda), isFalse);
      expect(m.canRead(ArenaArea.comandas), isFalse);
    });
  });

  group('arenaMembershipsProvider', () {
    ProviderContainer containerWith({
      required Stream<List<ArenaMembership>> owned,
      required Stream<List<ArenaMembership>> staffStream,
    }) {
      final container = ProviderContainer(overrides: [
        ownedArenaMembershipsProvider.overrideWith((ref) => owned),
        staffArenaMembershipsProvider.overrideWith((ref) => staffStream),
      ]);
      addTearDown(container.dispose);
      return container;
    }

    test('fica em loading enquanto uma das fontes nao emitiu', () async {
      final container = containerWith(
        owned: Stream.value(const <ArenaMembership>[]),
        staffStream: const Stream<List<ArenaMembership>>.empty(),
      );
      container.listen(arenaMembershipsProvider, (_, __) {});
      await Future<void>.delayed(Duration.zero);
      expect(container.read(arenaMembershipsProvider).isLoading, isTrue);
    });

    test('combina as duas fontes depois das duas emissoes', () async {
      final container = containerWith(
        owned: Stream.value([owner('a1', 'Vegeton')]),
        staffStream:
            Stream.value([staff('a2', 'Areia Nobre', ArenaStaffRole.gestor)]),
      );
      container.listen(arenaMembershipsProvider, (_, __) {});
      await Future<void>.delayed(Duration.zero);
      final value = container.read(arenaMembershipsProvider).valueOrNull;
      expect(value?.map((m) => m.arenaId), ['a2', 'a1']);
    });
  });
}
