import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../arenas/domain/arena_slot.dart';
import '../../arenas/domain/booking_providers.dart';
import '../../arenas/domain/slots_providers.dart';
import '../data/arena_goals_repository.dart';
import 'arena_access_providers.dart';
import 'arena_bookings_providers.dart';
import 'arena_cockpit.dart';
import 'arena_dashboard_period.dart';
import 'arena_dashboard_providers.dart';
import 'arena_date_utils.dart';
import 'arena_idle_map.dart';
import 'arena_manager_booking.dart';
import 'arena_month_goal.dart';
import 'arena_now_providers.dart';
import 'arena_schedule_providers.dart';
import 'arena_staff_role.dart';

final arenaGoalsRepositoryProvider = Provider<ArenaGoalsRepository>((ref) {
  return ArenaGoalsRepository(ref.watch(firestoreProvider));
});

/// Meta mensal da arena gerida — só para quem lê o financeiro (as rules
/// recusam os demais); para eles fica `null` sem tocar o Firestore.
final arenaMonthlyRevenueGoalProvider = StreamProvider.autoDispose<double?>((
  ref,
) {
  if (!ref.watch(arenaCanReadProvider(ArenaArea.financeiro))) {
    return Stream.value(null);
  }
  final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';
  if (arenaId.isEmpty) return Stream.value(null);
  return ref.watch(arenaGoalsRepositoryProvider).watchMonthlyRevenue(arenaId);
});

/// Dia civil do relógio do Painel (vira à meia-noite).
final _arenaBusinessDayProvider = Provider.autoDispose<DateTime?>((ref) {
  final now = ref.watch(arenaNowClockProvider).valueOrNull;
  return now == null ? null : arenaDateOnly(now);
});

/// Progresso do mês rumo à meta.
final arenaMonthGoalProgressProvider =
    Provider.autoDispose<AsyncValue<ArenaMonthGoalProgress>>((ref) {
      final day = ref.watch(_arenaBusinessDayProvider);
      final bookings = ref.watch(arenaManagerBookingsStreamProvider);
      final goal = ref.watch(arenaMonthlyRevenueGoalProvider);
      if (bookings.hasError) {
        return AsyncValue.error(bookings.error!, bookings.stackTrace!);
      }
      final list = bookings.valueOrNull;
      if (day == null || list == null || goal.isLoading) {
        return const AsyncValue.loading();
      }
      return AsyncValue.data(
        buildArenaMonthGoalProgress(
          bookings: list,
          today: day,
          // Meta que não carregou (rede/regra) vira "sem meta", não erro.
          goalReais: goal.valueOrNull,
        ),
      );
    });

/// Grade dos próximos [arenaIdleMapDays] dias (mesmas consultas da do dia).
final arenaWeekSlotsProvider = StreamProvider.autoDispose<List<ArenaSlot>>((
  ref,
) {
  final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';
  final day = ref.watch(_arenaBusinessDayProvider);
  if (arenaId.isEmpty || day == null) return Stream.value(const []);
  return ref
      .watch(slotsRepositoryProvider)
      .watchArenaRangeSlotsMerged(
        arenaId: arenaId,
        from: day,
        days: arenaIdleMapDays,
      );
});

/// Mapa de horários vazios da semana.
final arenaIdleMapProvider = Provider.autoDispose<AsyncValue<ArenaIdleMap>>((
  ref,
) {
  final now = ref.watch(arenaNowClockProvider).valueOrNull;
  final slots = ref.watch(arenaWeekSlotsProvider);
  if (slots.hasError) return AsyncValue.error(slots.error!, slots.stackTrace!);
  final list = slots.valueOrNull;
  if (now == null || list == null) return const AsyncValue.loading();
  return AsyncValue.data(buildArenaIdleMap(slots: list, now: now));
});

/// Base do Mês no cockpit: o mês anterior até o mesmo dia. A janela do
/// gestor só olha 30 dias para trás, então essa faixa vem de uma escuta
/// própria — aberta só enquanto o período "Mês" está na tela.
final arenaCockpitPreviousMonthBookingsProvider =
    StreamProvider.autoDispose<List<ArenaManagerBooking>?>((ref) {
      final period = ref.watch(arenaDashboardPeriodProvider);
      final day = ref.watch(_arenaBusinessDayProvider);
      final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';
      if (period != ArenaDashboardPeriod.month ||
          day == null ||
          arenaId.isEmpty) {
        return Stream.value(null);
      }
      final range = arenaCockpitPreviousMonthRange(day);
      return ref
          .watch(bookingServiceProvider)
          .watchBookingsForArenaInRange(
            arenaId,
            fromKey: range.fromKey,
            toKey: range.toKey,
          );
    });

/// Números da aba Negócio para o período escolhido.
final arenaCockpitProvider = Provider.autoDispose<AsyncValue<ArenaCockpit>>((
  ref,
) {
  final period = ref.watch(arenaDashboardPeriodProvider);
  final day = ref.watch(_arenaBusinessDayProvider);
  final bookings = ref.watch(arenaManagerBookingsStreamProvider);
  final slots = ref.watch(arenaNowTodaySlotsProvider);
  final previous = ref.watch(arenaCockpitPreviousMonthBookingsProvider);
  if (bookings.hasError) {
    return AsyncValue.error(bookings.error!, bookings.stackTrace!);
  }
  final list = bookings.valueOrNull;
  if (day == null || list == null) return const AsyncValue.loading();
  return AsyncValue.data(
    buildArenaCockpit(
      period: period,
      bookings: list,
      // Base que falhou ou ainda carrega: o cockpit sai sem comparação.
      previousMonthBookings: previous.valueOrNull,
      todaySlots: slots.valueOrNull ?? const [],
      today: day,
    ),
  );
});
