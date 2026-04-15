import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../arenas/domain/booking_providers.dart';
import 'arena_booking_view_mode.dart';
import 'arena_bookings_ui_models.dart';
import 'arena_date_utils.dart';
import 'arena_manager_booking.dart';
import 'arena_schedule_providers.dart';

/// Modo da lista: dia específico ou reservas futuras.
final bookingViewModeProvider =
    StateProvider<BookingViewMode>((ref) => BookingViewMode.today);

/// Data do filtro na tela de reservas (somente dia civil) — usado no modo [BookingViewMode.today].
final arenaBookingsFilterDateProvider = StateProvider<DateTime>((ref) {
  return arenaTodayDateOnly();
});

/// Reservas da arena gerida (stream via [BookingService.watchBookingsForArena], snapshots).
final arenaManagerBookingsStreamProvider =
    StreamProvider.autoDispose<List<ArenaManagerBooking>>((ref) {
  final arenaAsync = ref.watch(managedArenaIdProvider);
  return arenaAsync.when(
    data: (arenaId) {
      if (arenaId == null || arenaId.isEmpty) {
        return Stream<List<ArenaManagerBooking>>.value(const []);
      }
      return ref.watch(bookingServiceProvider).watchBookingsForArena(arenaId);
    },
    loading: () => Stream<List<ArenaManagerBooking>>.value(const []),
    error: (error, stackTrace) =>
        Stream<List<ArenaManagerBooking>>.value(const []),
  );
});

/// Reservas filtradas pelo dia selecionado (modo Hoje).
final arenaBookingsFilteredProvider =
    Provider<AsyncValue<List<ArenaManagerBooking>>>((ref) {
  final async = ref.watch(arenaManagerBookingsStreamProvider);
  final date = ref.watch(arenaBookingsFilterDateProvider);
  final key = arenaDateKey(date);

  return async.when(
    data: (list) {
      final filtered = list.where((b) => b.dateKey == key).toList()
        ..sort((a, b) => b.startTime.compareTo(a.startTime));
      return AsyncValue.data(filtered);
    },
    loading: () => const AsyncValue.loading(),
    error: (e, st) => AsyncValue.error(e, st),
  );
});

/// Reservas com `dateKey` ≥ hoje, ordenadas por data e horário de início.
final arenaFutureBookingsProvider =
    Provider<AsyncValue<List<ArenaManagerBooking>>>((ref) {
  final async = ref.watch(arenaManagerBookingsStreamProvider);
  final todayKey = arenaDateKey(arenaTodayDateOnly());

  return async.when(
    data: (list) {
      final filtered = list.where((b) {
        final k = b.dateKey;
        if (k.length < 10) return false;
        return k.compareTo(todayKey) >= 0;
      }).toList()
        ..sort((a, b) {
          final byD = b.dateKey.compareTo(a.dateKey);
          if (byD != 0) return byD;
          return b.startTime.compareTo(a.startTime);
        });
      return AsyncValue.data(filtered);
    },
    loading: () => const AsyncValue.loading(),
    error: (e, st) => AsyncValue.error(e, st),
  );
});

/// Mesmas reservas de [arenaFutureBookingsProvider], agrupadas por data civil.
final arenaFutureBookingsGroupedProvider =
    Provider<AsyncValue<List<ArenaBookingDaySection>>>((ref) {
  final async = ref.watch(arenaFutureBookingsProvider);
  return async.when(
    data: (list) => AsyncValue.data(_groupBookingsByDate(list)),
    loading: () => const AsyncValue.loading(),
    error: (e, st) => AsyncValue.error(e, st),
  );
});

List<ArenaBookingDaySection> _groupBookingsByDate(
  List<ArenaManagerBooking> list,
) {
  final byDate = <String, List<ArenaManagerBooking>>{};
  for (final b in list) {
    if (b.dateKey.isEmpty) continue;
    byDate.putIfAbsent(b.dateKey, () => []).add(b);
  }
  final keys = byDate.keys.toList()..sort((a, b) => b.compareTo(a));
  return [
    for (final k in keys)
      ArenaBookingDaySection(
        dateKey: k,
        title: _bookingDateSectionTitle(k),
        bookings: List<ArenaManagerBooking>.of(byDate[k]!)
          ..sort((a, b) => b.startTime.compareTo(a.startTime)),
      ),
  ];
}

String _bookingDateSectionTitle(String dateKey) {
  if (dateKey.length < 10) return dateKey;
  final d = DateTime.tryParse(dateKey.substring(0, 10));
  if (d == null) return dateKey;
  final raw = DateFormat("EEEE, d 'de' MMMM", 'pt_BR').format(d);
  if (raw.isEmpty) return dateKey;
  return raw[0].toUpperCase() + raw.substring(1);
}
