import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/firebase/firebase_providers.dart';
import '../data/recurring_booking_service.dart';
import 'arena_manager_booking.dart';
import 'arena_plan.dart';
import 'arena_plan_providers.dart';
import 'arena_recurring_booking.dart';
import 'arena_schedule_providers.dart';

final recurringBookingServiceProvider =
    Provider<RecurringBookingService>((ref) {
  return RecurringBookingService(ref.watch(firestoreProvider));
});

/// Séries de horário fixo ativas da arena gerida (tempo real).
final arenaActiveRecurringSeriesProvider =
    StreamProvider.autoDispose<List<ArenaRecurringBooking>>((ref) {
  final arenaAsync = ref.watch(managedArenaIdProvider);
  return arenaAsync.when(
    data: (arenaId) {
      if (arenaId == null || arenaId.isEmpty) {
        return Stream<List<ArenaRecurringBooking>>.value(const []);
      }
      return ref
          .watch(recurringBookingServiceProvider)
          .watchActiveSeries(arenaId);
    },
    loading: () => Stream<List<ArenaRecurringBooking>>.value(const []),
    error: (error, stackTrace) =>
        Stream<List<ArenaRecurringBooking>>.value(const []),
  );
});

/// Detalhe de uma série (tempo real).
final arenaRecurringSeriesProvider = StreamProvider.autoDispose
    .family<ArenaRecurringBooking?, String>((ref, seriesId) {
  return ref.watch(recurringBookingServiceProvider).watchSeries(seriesId);
});

/// Próximas ocorrências materializadas de uma série.
final arenaRecurringOccurrencesProvider = StreamProvider.autoDispose
    .family<List<ArenaManagerBooking>, String>((ref, seriesId) {
  return ref
      .watch(recurringBookingServiceProvider)
      .watchUpcomingOccurrences(seriesId);
});

/// Máximo de horários fixos ativos da arena gerida (`null` = ilimitado).
final managedArenaMaxRecurringBookingsProvider =
    Provider.autoDispose<int?>((ref) {
  final status = ref.watch(managedArenaPlanStatusProvider).valueOrNull ??
      ArenaPlanStatus.none;
  return maxRecurringBookingsFor(status.tier, entitled: status.entitled);
});

/// O gestor pode criar mais um horário fixo? (gate de UX; o gate de segurança
/// vive na callable `createArenaRecurringBooking`.)
final managedArenaCanAddRecurringBookingProvider =
    Provider.autoDispose<bool>((ref) {
  final max = ref.watch(managedArenaMaxRecurringBookingsProvider);
  if (max == null) return true;
  final active =
      ref.watch(arenaActiveRecurringSeriesProvider).valueOrNull ?? const [];
  return active.length < max;
});
