import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../arenas/domain/arena_slot.dart';
import '../../arenas/domain/slots_providers.dart';
import 'arena_access_providers.dart';
import 'arena_bookings_providers.dart';
import 'arena_court_providers.dart';
import 'arena_date_utils.dart';
import 'arena_now.dart';
import 'arena_schedule_providers.dart';
import 'arena_staff_role.dart';
import 'comandas/arena_comanda.dart';
import 'comandas/arena_comanda_providers.dart';
import 'review_reply_providers.dart';

/// De quanto em quanto tempo a aba Agora recalcula "em jogo / livre".
const Duration arenaNowTick = Duration(seconds: 30);

/// Relógio da aba Agora: emite já e a cada [arenaNowTick].
final arenaNowClockProvider = StreamProvider.autoDispose<DateTime>((ref) {
  return Stream<DateTime>.multi((controller) {
    controller.add(DateTime.now());
    final sub = Stream<void>.periodic(
      arenaNowTick,
    ).listen((_) => controller.add(DateTime.now()));
    controller.onCancel = sub.cancel;
  });
});

/// Dia civil do relógio — muda à meia-noite e reabre a grade do dia novo.
final _arenaNowDayProvider = Provider.autoDispose<DateTime?>((ref) {
  final now = ref.watch(arenaNowClockProvider).valueOrNull;
  return now == null ? null : arenaDateOnly(now);
});

/// Grade de hoje (mesma consulta do resumo do Painel).
final arenaNowTodaySlotsProvider = StreamProvider.autoDispose<List<ArenaSlot>>((
  ref,
) {
  final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';
  final day = ref.watch(_arenaNowDayProvider);
  if (arenaId.isEmpty || day == null) {
    return Stream.value(const <ArenaSlot>[]);
  }
  return ref
      .watch(slotsRepositoryProvider)
      .watchArenaDaySlotsMerged(arenaId: arenaId, date: day);
});

/// Comandas, só para quem lê a área (as rules recusam os demais).
final _arenaNowComandasProvider = Provider.autoDispose<List<ArenaComanda>>((
  ref,
) {
  if (!ref.watch(arenaCanReadProvider(ArenaArea.comandas))) return const [];
  final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';
  if (arenaId.isEmpty) return const [];
  return ref.watch(arenaComandasStreamProvider(arenaId)).valueOrNull ??
      const [];
});

/// Avaliações sem resposta, só para quem lê `comunidade`.
final _arenaNowPendingReviewsProvider = Provider.autoDispose<int>((ref) {
  if (!ref.watch(arenaCanReadProvider(ArenaArea.comunidade))) return 0;
  return ref.watch(managedArenaPendingReviewsProvider).valueOrNull?.length ?? 0;
});

/// Tudo o que a aba Agora mostra. Comandas e avaliações são secundárias: se
/// falharem, a aba segue sem elas; reservas, grade e quadras são a base.
final arenaNowSnapshotProvider =
    Provider.autoDispose<AsyncValue<ArenaNowSnapshot>>((ref) {
      final clock = ref.watch(arenaNowClockProvider);
      final bookings = ref.watch(arenaManagerBookingsStreamProvider);
      final slots = ref.watch(arenaNowTodaySlotsProvider);
      final courts = ref.watch(arenaManagedCourtsProvider);

      for (final source in [clock, bookings, slots, courts]) {
        if (source.hasError) {
          return AsyncValue.error(source.error!, source.stackTrace!);
        }
      }
      final now = clock.valueOrNull;
      final bookingList = bookings.valueOrNull;
      final slotList = slots.valueOrNull;
      final courtList = courts.valueOrNull;
      if (now == null ||
          bookingList == null ||
          slotList == null ||
          courtList == null) {
        return const AsyncValue.loading();
      }

      return AsyncValue.data(
        buildArenaNowSnapshot(
          now: now,
          bookings: bookingList,
          todaySlots: slotList,
          courts: courtList,
          comandas: ref.watch(_arenaNowComandasProvider),
          pendingReviews: ref.watch(_arenaNowPendingReviewsProvider),
        ),
      );
    });
