import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'arena_booking_card_pills.dart';
import 'arena_booking_day_timeline.dart';
import 'arena_bookings_providers.dart';
import 'arena_date_utils.dart';
import 'arena_now_providers.dart';

/// Linha do dia de hoje na aba Reservas (reservas + relógio da aba Agora).
final arenaBookingsTodayTimelineProvider =
    Provider.autoDispose<AsyncValue<List<ArenaTimelineEntry>>>((ref) {
  final clock = ref.watch(arenaNowClockProvider);
  final bookings = ref.watch(arenaManagerBookingsStreamProvider);
  if (bookings.hasError) {
    return AsyncValue.error(bookings.error!, bookings.stackTrace!);
  }
  final now = clock.valueOrNull;
  final list = bookings.valueOrNull;
  if (now == null || list == null) return const AsyncValue.loading();
  return AsyncValue.data(
    buildArenaDayTimeline(
      bookings: list,
      dateKey: arenaDateKey(arenaDateOnly(now)),
      now: now,
    ),
  );
});

/// Resumo de hoje (ocupação, em quadra, a receber). `null` enquanto carrega.
final arenaBookingsTodaySummaryProvider =
    Provider.autoDispose<ArenaBookingsDaySummary?>((ref) {
  final timeline = ref.watch(arenaBookingsTodayTimelineProvider).valueOrNull;
  final now = ref.watch(arenaNowClockProvider).valueOrNull;
  final bookings = ref.watch(arenaManagerBookingsStreamProvider).valueOrNull;
  if (timeline == null || now == null || bookings == null) return null;
  final dateKey = arenaDateKey(arenaDateOnly(now));
  return buildArenaBookingsDaySummary(
    timeline: timeline,
    dayBookings: bookings.where((b) => b.dateKey == dateKey).toList(),
    // Grade que falhou ou ainda carrega: o resumo sai sem ocupação.
    daySlots: ref.watch(arenaNowTodaySlotsProvider).valueOrNull ?? const [],
    dateKey: dateKey,
  );
});
