import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_court_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_home_tab.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_booking.dart';
import 'package:nexago_app/features/arena/domain/arena_now.dart';
import 'package:nexago_app/features/arena/domain/arena_now_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda_providers.dart';
import 'package:nexago_app/features/arena/domain/review_reply_providers.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/athlete/domain/arena_review.dart';

final _now = DateTime(2026, 11, 18, 18, 42);

List<Override> _role(ArenaStaffRole? role, {bool owner = false}) {
  final m = ArenaMembership(
    arenaId: 'a1',
    name: 'Arena Maré',
    isOwner: owner,
    role: role,
  );
  return [
    ownedArenaMembershipsProvider.overrideWith(
      (ref) => Stream.value(owner ? [m] : const <ArenaMembership>[]),
    ),
    staffArenaMembershipsProvider.overrideWith(
      (ref) => Stream.value(owner ? const <ArenaMembership>[] : [m]),
    ),
  ];
}

final _staleComanda = ArenaComanda(
  id: 'c1',
  arenaId: 'a1',
  displayNumber: 12,
  type: ArenaComandaType.individual,
  status: ArenaComandaStatus.open,
  customerName: 'Bia',
  allowAppOrders: false,
  rentalCents: 0,
  itemsTotalCents: 8600,
  totalCents: 8600,
  itemsCount: 2,
  paidCents: 0,
  openedByUid: 'staff',
  openedAt: _now.subtract(const Duration(hours: 3)),
);

const _pendingReview = ArenaReview(
  id: 'r1',
  arenaId: 'a1',
  userId: 'u1',
  bookingId: 'b1',
  rating: 4,
  comment: 'Boa quadra',
  createdAt: null,
  likesCount: 0,
  reported: false,
);

Future<ArenaNowSnapshot> _snapshotFor(List<Override> role) async {
  final container = ProviderContainer(
    overrides: [
      ...role,
      arenaNowClockProvider.overrideWith((ref) => Stream.value(_now)),
      arenaManagerBookingsStreamProvider.overrideWith(
        (ref) => Stream.value(const <ArenaManagerBooking>[]),
      ),
      arenaNowTodaySlotsProvider.overrideWith(
        (ref) => Stream.value(const <ArenaSlot>[]),
      ),
      arenaManagedCourtsProvider.overrideWith(
        (ref) => Stream.value(const [ArenaCourt(id: 'q1', name: 'Quadra 1')]),
      ),
      arenaComandasStreamProvider(
        'a1',
      ).overrideWith((ref) => Stream.value([_staleComanda])),
      managedArenaReviewsProvider.overrideWith(
        (ref) => Stream.value(const [_pendingReview]),
      ),
    ],
  );
  addTearDown(container.dispose);
  final sub = container.listen(arenaNowSnapshotProvider, (_, __) {});
  addTearDown(sub.close);
  for (var i = 0; i < 20 && !sub.read().hasValue; i++) {
    await Future<void>.delayed(Duration.zero);
  }
  // Os providers secundários (comandas/avaliações) emitem depois.
  await Future<void>.delayed(Duration.zero);
  await Future<void>.delayed(Duration.zero);
  final value = container.read(arenaNowSnapshotProvider);
  expect(value.hasValue, isTrue, reason: 'snapshot não carregou');
  return value.requireValue;
}

Set<ArenaNowTaskKind> _kinds(ArenaNowSnapshot s) =>
    s.tasks.map((t) => t.kind).toSet();

void main() {
  test('dono vê comanda parada e avaliação pendente', () async {
    final s = await _snapshotFor(_role(null, owner: true));
    expect(_kinds(s), {ArenaNowTaskKind.openComanda, ArenaNowTaskKind.reviews});
  });

  test('recepção vê comanda e avaliação (lê as duas áreas)', () async {
    final s = await _snapshotFor(_role(ArenaStaffRole.recepcao));
    expect(_kinds(s), {ArenaNowTaskKind.openComanda, ArenaNowTaskKind.reviews});
  });

  test(
    'financeiro vê comanda e avaliação (só leitura nas duas áreas)',
    () async {
      final s = await _snapshotFor(_role(ArenaStaffRole.financeiro));
      expect(_kinds(s), {
        ArenaNowTaskKind.openComanda,
        ArenaNowTaskKind.reviews,
      });
    },
  );

  test('manutenção não recebe comandas nem avaliações', () async {
    final s = await _snapshotFor(_role(ArenaStaffRole.manutencao));
    expect(s.tasks, isEmpty);
  });

  group('aba inicial', () {
    test('financeiro abre em Negócio', () {
      expect(
        arenaHomeDefaultTab(ArenaStaffRole.financeiro),
        ArenaHomeTab.business,
      );
    });

    test('dono e demais cargos abrem em Agora', () {
      expect(arenaHomeDefaultTab(null), ArenaHomeTab.now);
      for (final r in [
        ArenaStaffRole.gestor,
        ArenaStaffRole.recepcao,
        ArenaStaffRole.manutencao,
      ]) {
        expect(arenaHomeDefaultTab(r), ArenaHomeTab.now, reason: r.name);
      }
    });
  });
}
