import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../arenas/domain/arena_slot.dart';
import '../../arenas/domain/slots_providers.dart';
import '../data/arena_goals_repository.dart';
import 'arena_access_providers.dart';
import 'arena_bookings_providers.dart';
import 'arena_date_utils.dart';
import 'arena_idle_map.dart';
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
