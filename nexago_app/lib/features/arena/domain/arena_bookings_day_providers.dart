import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../arenas/domain/arena_booking_waitlist_entry.dart';
import '../../arenas/domain/arena_slot.dart';
import '../../arenas/domain/waitlist_providers.dart';
import '../../arenas/domain/slots_providers.dart';
import 'arena_access_providers.dart';
import 'arena_booking_card_pills.dart';
import 'arena_booking_day_timeline.dart';
import 'arena_bookings_filter.dart';
import 'arena_bookings_tasks.dart';
import 'arena_bookings_grouping.dart';
import 'arena_bookings_providers.dart';
import 'arena_bookings_ui_models.dart';
import 'arena_court_providers.dart';
import 'arena_date_utils.dart';
import 'arena_free_windows.dart';
import 'arena_manager_booking.dart';
import 'arena_now_providers.dart';
import 'arena_schedule_providers.dart';
import 'arena_slot_detail_providers.dart';
import 'arena_staff_role.dart';
import 'comandas/arena_comanda.dart';
import 'comandas/arena_comanda_providers.dart';

/// Dia aberto na aba Reservas (faixa de 7 dias / calendário).
final arenaBookingsSelectedDayProvider = StateProvider<DateTime>((ref) {
  return arenaTodayDateOnly();
});

/// Filtros da aba (quadra, pagamento, tipo, esporte).
final arenaBookingsFilterProvider = StateProvider<ArenaBookingsFilter>((ref) {
  return const ArenaBookingsFilter();
});

/// Busca da aba: `null` com o campo fechado.
final arenaBookingsSearchProvider = StateProvider<String?>((ref) => null);

/// Primeiro dia da faixa de 7 dias (ver [arenaBookingsStripStart]).
final arenaBookingsStripStartProvider = Provider<DateTime>((ref) {
  return arenaBookingsStripStart(
    ref.watch(arenaBookingsSelectedDayProvider),
    arenaTodayDateOnly(),
  );
});

/// Grade dos 7 dias da faixa. Mesmas consultas da grade do dia (a de
/// `arenaSlots` já traz a arena inteira): ver a semana não abre leitura nova.
final arenaBookingsStripSlotsProvider =
    StreamProvider.autoDispose<List<ArenaSlot>>((ref) {
  final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';
  if (arenaId.isEmpty) return Stream.value(const []);
  return ref.watch(slotsRepositoryProvider).watchArenaRangeSlotsMerged(
        arenaId: arenaId,
        from: ref.watch(arenaBookingsStripStartProvider),
        days: arenaBookingsStripDays,
      );
});

/// Um dia da faixa: data e ocupação (`null` enquanto a grade carrega).
@immutable
class ArenaBookingsStripDay {
  const ArenaBookingsStripDay({required this.date, this.occupancyPercent});

  final DateTime date;
  final int? occupancyPercent;

  String get dateKey => arenaDateKey(date);
}

final arenaBookingsStripProvider =
    Provider.autoDispose<List<ArenaBookingsStripDay>>((ref) {
  final start = ref.watch(arenaBookingsStripStartProvider);
  final slots = ref.watch(arenaBookingsStripSlotsProvider).valueOrNull;
  final bookings =
      ref.watch(arenaManagerBookingsStreamProvider).valueOrNull ?? const [];
  return [
    for (var i = 0; i < arenaBookingsStripDays; i++)
      () {
        final date = DateTime(start.year, start.month, start.day + i);
        return ArenaBookingsStripDay(
          date: date,
          occupancyPercent: slots == null
              ? null
              : arenaDayOccupancyPercent(
                  slots: slots,
                  bookings: bookings,
                  dateKey: arenaDateKey(date),
                ),
        );
      }(),
  ];
});

/// Reservas do dia aberto que passam no filtro.
List<ArenaManagerBooking> _filteredDay(
  List<ArenaManagerBooking> all,
  String dateKey,
  ArenaBookingsFilter filter,
) =>
    all.where((b) => b.dateKey == dateKey && filter.matches(b)).toList();

/// Linha do dia aberto: reservas filtradas, horários livres (de hoje em
/// diante, só quando o filtro é de quadra ou nenhum) e o marcador "agora".
final arenaBookingsDayTimelineProvider =
    Provider.autoDispose<AsyncValue<List<ArenaTimelineEntry>>>((ref) {
  final clock = ref.watch(arenaNowClockProvider);
  final bookings = ref.watch(arenaManagerBookingsStreamProvider);
  if (bookings.hasError) {
    return AsyncValue.error(bookings.error!, bookings.stackTrace!);
  }
  final now = clock.valueOrNull;
  final list = bookings.valueOrNull;
  if (now == null || list == null) return const AsyncValue.loading();

  final dateKey = arenaDateKey(ref.watch(arenaBookingsSelectedDayProvider));
  final filter = ref.watch(arenaBookingsFilterProvider);
  final free = filter.onlyCourts
      ? ref.watch(arenaBookingsDayFreeWindowsProvider)
      : const <ArenaFreeWindow>[];
  final day = _filteredDay(list, dateKey, filter);
  return AsyncValue.data(
    buildArenaDayTimeline(
      bookings: day,
      dateKey: dateKey,
      now: now,
      freeWindows: free,
      canceled: arenaCanceledOfDay(day, dateKey),
    ),
  );
});

/// Horários livres do dia aberto (respeita o filtro de quadra).
final arenaBookingsDayFreeWindowsProvider =
    Provider.autoDispose<List<ArenaFreeWindow>>((ref) {
  final now = ref.watch(arenaNowClockProvider).valueOrNull;
  final slots = ref.watch(arenaBookingsStripSlotsProvider).valueOrNull;
  final bookings = ref.watch(arenaManagerBookingsStreamProvider).valueOrNull;
  if (now == null || slots == null || bookings == null) return const [];
  final dateKey = arenaDateKey(ref.watch(arenaBookingsSelectedDayProvider));
  final courtFilter = ref.watch(arenaBookingsFilterProvider).courtIds;
  final courts = ref.watch(arenaManagedCourtsProvider).valueOrNull ?? const [];
  final day = arenaDaySlotsWithBookings(
    slots: slots,
    bookings: bookings,
    dateKey: dateKey,
  ).where((s) => courtFilter.isEmpty || courtFilter.contains(s.courtId));
  return buildArenaFreeWindows(
    slots: day.toList(),
    dateKey: dateKey,
    now: now,
    courtNames: {for (final c in courts) c.id: c.name},
  );
});

/// Resumo do dia aberto (ocupação, em quadra, a receber). `null` enquanto
/// carrega. A ocupação é da arena (sem filtro); o resto segue o filtro.
final arenaBookingsDaySummaryProvider =
    Provider.autoDispose<ArenaBookingsDaySummary?>((ref) {
  final timeline = ref.watch(arenaBookingsDayTimelineProvider).valueOrNull;
  final bookings = ref.watch(arenaManagerBookingsStreamProvider).valueOrNull;
  if (timeline == null || bookings == null) return null;
  final dateKey = arenaDateKey(ref.watch(arenaBookingsSelectedDayProvider));
  return buildArenaBookingsDaySummary(
    timeline: timeline,
    dayBookings: bookings.where((b) => b.dateKey == dateKey).toList(),
    // Grade que falhou ou ainda carrega: o resumo sai sem ocupação.
    daySlots:
        ref.watch(arenaBookingsStripSlotsProvider).valueOrNull ?? const [],
    dateKey: dateKey,
  );
});

/// Resultado da busca em toda a janela carregada (30 dias para trás, 60 à
/// frente), com o filtro aplicado. De hoje em diante primeiro, em ordem;
/// depois as passadas, da mais recente. `null` sem busca ativa.
final arenaBookingsSearchResultsProvider =
    Provider.autoDispose<AsyncValue<List<ArenaBookingDaySection>>?>((ref) {
  final query = ref.watch(arenaBookingsSearchProvider)?.trim() ?? '';
  if (query.length < arenaBookingsSearchMinLength) return null;
  final async = ref.watch(arenaManagerBookingsStreamProvider);
  final filter = ref.watch(arenaBookingsFilterProvider);
  return async.whenData((list) {
    final names = <String, String?>{
      for (final id in {
        for (final b in list)
          if (b.athleteId.trim().isNotEmpty) b.athleteId.trim(),
      })
        id: ref.watch(athleteDisplayLabelProvider(id)).valueOrNull,
    };
    final hits = list
        .where(
          (b) =>
              filter.matches(b) &&
              arenaBookingMatchesQuery(
                b,
                query,
                athleteName: names[b.athleteId.trim()],
              ),
        )
        .toList();
    return arenaBookingSearchSections(hits, today: arenaTodayDateOnly());
  });
});

/// Agrupa resultados por dia: de hoje em diante (crescente), depois as
/// passadas (da mais recente). Título "Hoje · Quarta, 18 de novembro".
List<ArenaBookingDaySection> arenaBookingSearchSections(
  List<ArenaManagerBooking> hits, {
  required DateTime today,
}) {
  final todayKey = arenaDateKey(today);
  final byDay = <String, List<ArenaManagerBooking>>{};
  for (final b in hits) {
    if (b.dateKey.isEmpty) continue;
    byDay.putIfAbsent(b.dateKey, () => []).add(b);
  }
  final keys = byDay.keys.toList()
    ..sort((a, b) {
      final aFuture = a.compareTo(todayKey) >= 0;
      final bFuture = b.compareTo(todayKey) >= 0;
      if (aFuture != bFuture) return aFuture ? -1 : 1;
      return aFuture ? a.compareTo(b) : b.compareTo(a);
    });
  return [
    for (final k in keys)
      ArenaBookingDaySection(
        dateKey: k,
        title:
            ArenaBookingsGrouping.sectionTitleForDateKey(k, reference: today),
        bookings: byDay[k]!..sort(arenaBookingChronologicalOrder),
      ),
  ];
}

/// Mantém o dia aberto na agenda quando o gestor toca em "Nova reserva" ou
/// num horário livre.
void openArenaScheduleOn(WidgetRef ref, DateTime day) {
  ref.read(arenaScheduleSelectedDateProvider.notifier).state =
      arenaDateOnly(day);
}

/// Fila de espera de hoje (para a pendência "cancelado com fila").
final arenaBookingsTodayWaitlistProvider =
    StreamProvider.autoDispose<List<ArenaBookingWaitlistEntry>>((ref) {
  final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';
  final now = ref.watch(arenaNowClockProvider).valueOrNull;
  if (arenaId.isEmpty || now == null) return Stream.value(const []);
  return ref.watch(waitlistRepositoryProvider).watchArenaDay(
        arenaId: arenaId,
        dateKey: arenaDateKey(arenaDateOnly(now)),
      );
});

/// Comandas da arena, só para quem lê a área (as rules recusam os demais):
/// `null` para quem não lê ou enquanto carregam.
final _arenaBookingsComandasProvider =
    Provider.autoDispose<List<ArenaComanda>?>((ref) {
  if (!ref.watch(arenaCanReadProvider(ArenaArea.comandas))) return null;
  final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';
  if (arenaId.isEmpty) return null;
  return ref.watch(arenaComandasStreamProvider(arenaId)).valueOrNull;
});

/// Pendências de hoje para a faixa "Precisa de você". Lista vazia enquanto
/// carrega ou quando a fila de espera falha (a faixa some, a tela segue).
final arenaBookingsTasksProvider =
    Provider.autoDispose<List<ArenaBookingTask>>((ref) {
  final now = ref.watch(arenaNowClockProvider).valueOrNull;
  final bookings = ref.watch(arenaManagerBookingsStreamProvider).valueOrNull;
  if (now == null || bookings == null) return const [];
  return buildArenaBookingsTasks(
    bookings: bookings,
    waitlist:
        ref.watch(arenaBookingsTodayWaitlistProvider).valueOrNull ?? const [],
    comandas: ref.watch(_arenaBookingsComandasProvider),
    now: now,
  );
});
