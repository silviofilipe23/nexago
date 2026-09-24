import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../arenas/domain/arena_list_item.dart';
import '../../arenas/domain/arena_slot.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../../arenas/domain/slots_providers.dart';
import '../data/slot_service.dart';
import 'arena_access_providers.dart';
import 'arena_bookings_providers.dart';
import 'arena_date_utils.dart';
import 'arena_schedule_grouping.dart';
import 'arena_schedule_models.dart';

/// Dia selecionado na agenda (somente data civil).
final arenaScheduleSelectedDateProvider =
    StateProvider<DateTime>((ref) {
  return arenaTodayDateOnly();
});

/// Filtro de status na lista da agenda.
final arenaScheduleStatusFilterProvider =
    StateProvider<ArenaScheduleStatusFilter>(
  (ref) => ArenaScheduleStatusFilter.all,
);

/// Filtro por quadra (`null` = todas).
final arenaScheduleCourtFilterProvider = StateProvider<String?>((ref) => null);

/// Slots do dia com reservas de `arenaBookings` aplicadas na grade.
final arenaScheduleSlotsWithBookingsProvider =
    Provider.autoDispose<List<ArenaSlot>>((ref) {
  final slots = ref.watch(arenaScheduleSlotsProvider).valueOrNull ?? const [];
  final dateKey = arenaDateKey(ref.watch(arenaScheduleSelectedDateProvider));
  final bookings =
      ref.watch(arenaManagerBookingsStreamProvider).valueOrNull ?? const [];
  return ArenaScheduleGrouping.applyBookingsOverlay(
    slots: slots,
    bookings: bookings,
    dateKey: dateKey,
  );
});

/// Contagens do dia selecionado (chips de filtro).
final arenaScheduleDayStatsProvider =
    Provider.autoDispose<ArenaScheduleDayStats>((ref) {
  final slots = ref.watch(arenaScheduleSlotsWithBookingsProvider);
  return ArenaScheduleGrouping.dayStats(slots);
});

/// Hora de pico do dia (reservas) para heurística "horário forte".
final arenaSchedulePeakHourProvider = Provider.autoDispose<int?>((ref) {
  final slots = ref.watch(arenaScheduleSlotsWithBookingsProvider);
  return ArenaScheduleGrouping.peakHour(slots);
});

/// Mapa bookingId → resumo para subtítulos.
final arenaScheduleBookingLookupProvider =
    Provider.autoDispose<Map<String, ArenaScheduleBookingSummary>>((ref) {
  final bookingsAsync = ref.watch(arenaManagerBookingsStreamProvider);
  return bookingsAsync.maybeWhen(
    data: ArenaScheduleGrouping.bookingLookup,
    orElse: () => const {},
  );
});

/// Lista agrupada por hora com filtros aplicados.
final arenaScheduleGroupedSlotsProvider =
    Provider.autoDispose<AsyncValue<List<ArenaScheduleHourGroup>>>((ref) {
  final slotsAsync = ref.watch(arenaScheduleSlotsProvider);
  final arenaId = ref.watch(managedArenaIdProvider).valueOrNull;
  final statusFilter = ref.watch(arenaScheduleStatusFilterProvider);
  final courtFilter = ref.watch(arenaScheduleCourtFilterProvider);
  final bookingLookup = ref.watch(arenaScheduleBookingLookupProvider);
  final peakHour = ref.watch(arenaSchedulePeakHourProvider);
  final slotsWithBookings = ref.watch(arenaScheduleSlotsWithBookingsProvider);

  if (arenaId == null || arenaId.isEmpty) {
    return const AsyncValue.data([]);
  }

  final courtsAsync = ref.watch(courtsStreamProvider(arenaId));

  return slotsAsync.when(
    loading: () => const AsyncValue.loading(),
    error: AsyncValue.error,
    data: (_) => courtsAsync.when(
      loading: () => const AsyncValue.loading(),
      error: AsyncValue.error,
      data: (courts) {
        final courtNames = {for (final c in courts) c.id: c.name};
        final filtered = ArenaScheduleGrouping.applyFilters(
          slots: slotsWithBookings,
          statusFilter: statusFilter,
          courtIdFilter: courtFilter,
        );
        final groups = ArenaScheduleGrouping.groupByHour(
          slots: filtered,
          courtNames: courtNames,
          bookingById: bookingLookup,
          peakHour: peakHour,
        );
        return AsyncValue.data(groups);
      },
    ),
  );
});

/// Arena ativa do painel. Deriva de [arenaAccessProvider], que une dono e
/// equipe — antes era `arenas.where(managerUserId == uid).limit(1)`, query que
/// nunca casava com membro de equipe.
///
/// Continua entregando `AsyncValue<String?>`: os ~35 pontos de uso leem
/// `.valueOrNull` e `.when`, entao nada muda para eles.
final managedArenaIdProvider = Provider<AsyncValue<String?>>((ref) {
  return ref.watch(arenaAccessProvider).whenData((access) => access.arenaId);
});

/// Documento completo da arena gerida (logo, capa, contato, etc.).
final managedArenaDetailProvider =
    StreamProvider.autoDispose<ArenaListItem?>((ref) {
  final idAsync = ref.watch(managedArenaIdProvider);
  return idAsync.when(
    data: (id) {
      if (id == null || id.isEmpty) {
        return Stream<ArenaListItem?>.value(null);
      }
      return ref.watch(arenasRepositoryProvider).watchArena(id);
    },
    loading: () => Stream<ArenaListItem?>.value(null),
    error: (_, __) => Stream<ArenaListItem?>.value(null),
  );
});

final slotServiceProvider = Provider<SlotService>((ref) {
  return SlotService(
    ref.watch(slotsRepositoryProvider),
    ref.watch(firestoreProvider),
  );
});

/// Slots do dia (todas as quadras) para a arena gerida.
final arenaScheduleSlotsProvider =
    StreamProvider.autoDispose<List<ArenaSlot>>((ref) {
  final arenaAsync = ref.watch(managedArenaIdProvider);
  final date = ref.watch(arenaScheduleSelectedDateProvider);

  return arenaAsync.when(
    data: (arenaId) {
      if (arenaId == null || arenaId.isEmpty) {
        return Stream<List<ArenaSlot>>.value(<ArenaSlot>[]);
      }
      return ref.watch(slotServiceProvider).watchArenaDaySlots(
            arenaId: arenaId,
            date: date,
          );
    },
    loading: () => Stream<List<ArenaSlot>>.value(<ArenaSlot>[]),
    error: (_, __) => Stream<List<ArenaSlot>>.value(<ArenaSlot>[]),
  );
});
