import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../arenas/domain/booking_providers.dart';
import '../../arenas/domain/slots_providers.dart';
import '../data/arena_dashboard_service.dart';
import 'arena_dashboard_summary.dart';
import 'arena_date_utils.dart';
import 'arena_schedule_providers.dart';

final arenaDashboardServiceProvider = Provider<ArenaDashboardService>((ref) {
  return const ArenaDashboardService();
});

/// Resumo em tempo real: mesmas fontes que a agenda (`arenaBookings`, `arenaSlots`, courts).
final arenaDashboardSummaryProvider =
    StreamProvider.autoDispose<ArenaDashboardSummary>((ref) {
  final arenaAsync = ref.watch(managedArenaIdProvider);
  final dashboard = ref.watch(arenaDashboardServiceProvider);
  return arenaAsync.when(
    data: (arenaId) {
      if (arenaId == null || arenaId.isEmpty) {
        return Stream.value(ArenaDashboardSummary.placeholder());
      }
      final today = arenaTodayDateOnly();
      final bookings$ =
          ref.watch(bookingServiceProvider).watchBookingsForArena(arenaId);
      final slots$ = ref.watch(slotsRepositoryProvider).watchArenaDaySlotsMerged(
            arenaId: arenaId,
            date: today,
          );
      final courts$ =
          ref.watch(courtsRepositoryProvider).watchCourts(arenaId);
      return _combineLatest3(
        bookings$,
        slots$,
        courts$,
        (bookings, slots, courts) => dashboard.summarize(
          bookings: bookings,
          slots: slots,
          courts: courts,
          todayReference: today,
        ),
      );
    },
    loading: () => const Stream<ArenaDashboardSummary>.empty(),
    error: (e, st) => Stream<ArenaDashboardSummary>.error(e, st),
  );
});

/// Emite quando [a], [b] e [c] já emitiram pelo menos uma vez cada.
Stream<R> _combineLatest3<A, B, C, R>(
  Stream<A> streamA,
  Stream<B> streamB,
  Stream<C> streamC,
  R Function(A, B, C) combine,
) {
  final controller = StreamController<R>.broadcast();
  A? lastA;
  B? lastB;
  C? lastC;

  void emit() {
    final x = lastA;
    final y = lastB;
    final z = lastC;
    if (x != null && y != null && z != null) {
      controller.add(combine(x, y, z));
    }
  }

  late final StreamSubscription<A> subA;
  late final StreamSubscription<B> subB;
  late final StreamSubscription<C> subC;

  subA = streamA.listen(
    (a) {
      lastA = a;
      emit();
    },
    onError: controller.addError,
  );
  subB = streamB.listen(
    (b) {
      lastB = b;
      emit();
    },
    onError: controller.addError,
  );
  subC = streamC.listen(
    (c) {
      lastC = c;
      emit();
    },
    onError: controller.addError,
  );

  controller.onCancel = () async {
    await subA.cancel();
    await subB.cancel();
    await subC.cancel();
  };

  return controller.stream;
}
