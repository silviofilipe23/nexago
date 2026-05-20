import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../arenas/domain/arena_court.dart';
import '../../arenas/domain/booking_providers.dart';
import '../../arenas/domain/slots_providers.dart';
import 'arena_booking_view_mode.dart';
import 'arena_bookings_grouping.dart';
import 'arena_bookings_ui_models.dart';
import 'arena_date_utils.dart';
import 'arena_manager_booking.dart';
import 'arena_schedule_providers.dart';

/// Modo da lista: Hoje / Amanhã / Futuras / Passadas.
final bookingViewModeProvider =
    StateProvider<BookingViewMode>((ref) => BookingViewMode.today);

/// Data do filtro legado (aba Hoje usa sempre hoje civil).
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
      final bookings$ =
          ref.watch(bookingServiceProvider).watchBookingsForArena(arenaId);
      final courts$ = ref.watch(courtsRepositoryProvider).watchCourts(arenaId);
      return _combineLatestBookingsCourts(bookings$, courts$);
    },
    loading: () => Stream<List<ArenaManagerBooking>>.value(const []),
    error: (error, stackTrace) =>
        Stream<List<ArenaManagerBooking>>.value(const []),
  );
});

Stream<List<ArenaManagerBooking>> _combineLatestBookingsCourts(
  Stream<List<ArenaManagerBooking>> bookings$,
  Stream<List<ArenaCourt>> courts$,
) {
  final controller = StreamController<List<ArenaManagerBooking>>.broadcast();
  List<ArenaManagerBooking>? lastBookings;
  List<ArenaCourt>? lastCourts;

  void emit() {
    final bookings = lastBookings;
    if (bookings == null) return;
    final courts = lastCourts;
    if (courts == null || courts.isEmpty) {
      controller.add(bookings);
      return;
    }
    final names = {for (final c in courts) c.id: c.name};
    controller.add([
      for (final b in bookings) b.enrichCourtName(names),
    ]);
  }

  late final StreamSubscription<List<ArenaManagerBooking>> subBookings;
  late final StreamSubscription<List<ArenaCourt>> subCourts;

  subBookings = bookings$.listen(
    (bookings) {
      lastBookings = bookings;
      emit();
    },
    onError: controller.addError,
  );
  subCourts = courts$.listen(
    (courts) {
      lastCourts = courts;
      emit();
    },
    onError: controller.addError,
  );

  controller.onCancel = () async {
    await subBookings.cancel();
    await subCourts.cancel();
  };

  return controller.stream;
}

List<ArenaManagerBooking> _activeBookings(List<ArenaManagerBooking> list) {
  return list.where((b) {
    final s = (b.data['status'] as String?)?.toLowerCase().trim() ?? '';
    return s != 'canceled' && s != 'cancelled';
  }).toList();
}

/// Reservas de hoje (não canceladas na listagem principal).
final arenaBookingsTodayProvider =
    Provider.autoDispose<AsyncValue<List<ArenaManagerBooking>>>((ref) {
  final async = ref.watch(arenaManagerBookingsStreamProvider);
  final todayKey = arenaDateKey(arenaTodayDateOnly());
  return async.when(
    data: (list) {
      final filtered = _activeBookings(list)
          .where((b) => b.dateKey == todayKey)
          .toList()
        ..sort(_arenaBookingsManagerSort);
      return AsyncValue.data(filtered);
    },
    loading: () => const AsyncValue.loading(),
    error: AsyncValue.error,
  );
});

/// Reservas de amanhã.
final arenaBookingsTomorrowProvider =
    Provider.autoDispose<AsyncValue<List<ArenaManagerBooking>>>((ref) {
  final async = ref.watch(arenaManagerBookingsStreamProvider);
  final tomorrowKey =
      arenaDateKey(arenaTodayDateOnly().add(const Duration(days: 1)));
  return async.when(
    data: (list) {
      final filtered = _activeBookings(list)
          .where((b) => b.dateKey == tomorrowKey)
          .toList()
        ..sort(_arenaBookingsManagerSort);
      return AsyncValue.data(filtered);
    },
    loading: () => const AsyncValue.loading(),
    error: AsyncValue.error,
  );
});

/// Reservas com data > amanhã.
final arenaFutureBookingsProvider =
    Provider.autoDispose<AsyncValue<List<ArenaManagerBooking>>>((ref) {
  final async = ref.watch(arenaManagerBookingsStreamProvider);
  final tomorrowKey =
      arenaDateKey(arenaTodayDateOnly().add(const Duration(days: 1)));

  return async.when(
    data: (list) {
      final filtered = _activeBookings(list).where((b) {
        final k = b.dateKey;
        if (k.length < 10) return false;
        return k.compareTo(tomorrowKey) > 0;
      }).toList()
        ..sort((a, b) {
          final byD = a.dateKey.compareTo(b.dateKey);
          if (byD != 0) return byD;
          return _arenaBookingsManagerSort(a, b);
        });
      return AsyncValue.data(filtered);
    },
    loading: () => const AsyncValue.loading(),
    error: AsyncValue.error,
  );
});

/// Reservas passadas (dateKey < hoje).
final arenaPastBookingsProvider =
    Provider.autoDispose<AsyncValue<List<ArenaManagerBooking>>>((ref) {
  final async = ref.watch(arenaManagerBookingsStreamProvider);
  final todayKey = arenaDateKey(arenaTodayDateOnly());

  return async.when(
    data: (list) {
      final filtered = list.where((b) {
        final k = b.dateKey;
        if (k.length < 10) return false;
        return k.compareTo(todayKey) < 0;
      }).toList()
        ..sort((a, b) {
          final byD = b.dateKey.compareTo(a.dateKey);
          if (byD != 0) return byD;
          return _arenaBookingsManagerSort(a, b);
        });
      return AsyncValue.data(filtered);
    },
    loading: () => const AsyncValue.loading(),
    error: AsyncValue.error,
  );
});

/// Legado: filtro por data (mantido para compatibilidade).
final arenaBookingsFilteredProvider = arenaBookingsTodayProvider;

List<ArenaBookingDaySection> _groupBookingsByDate(
  List<ArenaManagerBooking> list, {
  required bool revenueSubtitle,
  DateTime? reference,
}) {
  final byDate = <String, List<ArenaManagerBooking>>{};
  for (final b in list) {
    if (b.dateKey.isEmpty) continue;
    byDate.putIfAbsent(b.dateKey, () => []).add(b);
  }
  final keys = byDate.keys.toList()
    ..sort((a, b) => revenueSubtitle ? a.compareTo(b) : b.compareTo(a));

  return [
    for (final k in keys)
      () {
        final bookings = List<ArenaManagerBooking>.of(byDate[k]!)
          ..sort(_arenaBookingsManagerSort);
        final title = ArenaBookingsGrouping.sectionTitleForDateKey(
          k,
          reference: reference,
        );
        final subtitle = revenueSubtitle
            ? ArenaBookingsGrouping.sectionSubtitleRevenue(bookings)
            : (k == arenaDateKey(reference ?? arenaTodayDateOnly())
                ? ArenaBookingsGrouping.sectionSubtitleToday(bookings)
                : ArenaBookingsGrouping.sectionSubtitleRevenue(bookings));
        return ArenaBookingDaySection(
          dateKey: k,
          title: title,
          subtitle: subtitle,
          bookings: bookings,
        );
      }(),
  ];
}

final arenaFutureBookingsGroupedProvider =
    Provider.autoDispose<AsyncValue<List<ArenaBookingDaySection>>>((ref) {
  final async = ref.watch(arenaFutureBookingsProvider);
  return async.when(
    data: (list) => AsyncValue.data(
      _groupBookingsByDate(list, revenueSubtitle: true),
    ),
    loading: () => const AsyncValue.loading(),
    error: AsyncValue.error,
  );
});

final arenaPastBookingsGroupedProvider =
    Provider.autoDispose<AsyncValue<List<ArenaBookingDaySection>>>((ref) {
  final async = ref.watch(arenaPastBookingsProvider);
  return async.when(
    data: (list) => AsyncValue.data(
      _groupBookingsByDate(list, revenueSubtitle: false),
    ),
    loading: () => const AsyncValue.loading(),
    error: AsyncValue.error,
  );
});

/// Lista plana ou agrupada conforme o modo ativo.
final arenaBookingsListForModeProvider =
    Provider.autoDispose<AsyncValue<Object>>((ref) {
  final mode = ref.watch(bookingViewModeProvider);
  switch (mode) {
    case BookingViewMode.today:
      return ref.watch(arenaBookingsTodayProvider);
    case BookingViewMode.tomorrow:
      return ref.watch(arenaBookingsTomorrowProvider);
    case BookingViewMode.upcoming:
      return ref.watch(arenaFutureBookingsGroupedProvider);
    case BookingViewMode.past:
      return ref.watch(arenaPastBookingsGroupedProvider);
  }
});

/// Contagens por aba (mesmas regras de filtro das listas).
class ArenaBookingsTabCounts {
  const ArenaBookingsTabCounts({
    this.today = 0,
    this.tomorrow = 0,
    this.upcoming = 0,
    this.past = 0,
  });

  final int today;
  final int tomorrow;
  final int upcoming;
  final int past;

  int forMode(BookingViewMode mode) => switch (mode) {
        BookingViewMode.today => today,
        BookingViewMode.tomorrow => tomorrow,
        BookingViewMode.upcoming => upcoming,
        BookingViewMode.past => past,
      };
}

ArenaBookingsTabCounts _computeTabCounts(List<ArenaManagerBooking> list) {
  final todayKey = arenaDateKey(arenaTodayDateOnly());
  final tomorrowKey =
      arenaDateKey(arenaTodayDateOnly().add(const Duration(days: 1)));

  var today = 0;
  var tomorrow = 0;
  var upcoming = 0;
  var past = 0;

  for (final b in list) {
    final k = b.dateKey;
    if (k.length < 10) continue;

    final s = (b.data['status'] as String?)?.toLowerCase().trim() ?? '';
    final isCanceled = s == 'canceled' || s == 'cancelled';

    if (k.compareTo(todayKey) < 0) {
      past++;
    } else if (k == todayKey && !isCanceled) {
      today++;
    } else if (k == tomorrowKey && !isCanceled) {
      tomorrow++;
    } else if (k.compareTo(tomorrowKey) > 0 && !isCanceled) {
      upcoming++;
    }
  }

  return ArenaBookingsTabCounts(
    today: today,
    tomorrow: tomorrow,
    upcoming: upcoming,
    past: past,
  );
}

final arenaBookingsTabCountsProvider =
    Provider.autoDispose<ArenaBookingsTabCounts>((ref) {
  final async = ref.watch(arenaManagerBookingsStreamProvider);
  return async.maybeWhen(
    data: _computeTabCounts,
    orElse: () => const ArenaBookingsTabCounts(),
  );
});

/// Soma R$ das reservas visíveis na aba.
final arenaBookingsTabSummaryProvider =
    Provider.autoDispose<double>((ref) {
  final mode = ref.watch(bookingViewModeProvider);
  switch (mode) {
    case BookingViewMode.today:
      return ref.watch(arenaBookingsTodayProvider).maybeWhen(
            data: ArenaBookingsGrouping.sumReais,
            orElse: () => 0,
          );
    case BookingViewMode.tomorrow:
      return ref.watch(arenaBookingsTomorrowProvider).maybeWhen(
            data: ArenaBookingsGrouping.sumReais,
            orElse: () => 0,
          );
    case BookingViewMode.upcoming:
      return ref.watch(arenaFutureBookingsProvider).maybeWhen(
            data: ArenaBookingsGrouping.sumReais,
            orElse: () => 0,
          );
    case BookingViewMode.past:
      return ref.watch(arenaPastBookingsProvider).maybeWhen(
            data: ArenaBookingsGrouping.sumReais,
            orElse: () => 0,
          );
  }
});

/// Insight card (aba Hoje).
final arenaBookingsTodayInsightProvider =
    Provider.autoDispose<ArenaBookingsTodayInsight?>((ref) {
  final todayAsync = ref.watch(arenaBookingsTodayProvider);
  final slotsAsync = ref.watch(arenaScheduleSlotsProvider);

  return todayAsync.maybeWhen(
    data: (bookings) {
      final available = slotsAsync.maybeWhen(
        data: (slots) => slots.where((s) => s.isAvailable).length,
        orElse: () => 0,
      );
      return ArenaBookingsGrouping.todayInsight(
        todayBookings: bookings,
        availableSlotsToday: available,
      );
    },
    orElse: () => null,
  );
});

int _attendanceOrder(String status) {
  switch (status) {
    case 'checked_in':
      return 0;
    case 'confirmed':
      return 1;
    case 'pending':
      return 2;
    case 'no_show':
      return 3;
    default:
      return 4;
  }
}

int _arenaBookingsManagerSort(ArenaManagerBooking a, ArenaManagerBooking b) {
  final byAttendance = _attendanceOrder(a.attendanceStatus)
      .compareTo(_attendanceOrder(b.attendanceStatus));
  if (byAttendance != 0) return byAttendance;
  return a.startTime.compareTo(b.startTime);
}
