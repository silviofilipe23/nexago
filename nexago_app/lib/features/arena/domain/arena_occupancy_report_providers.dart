import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/arena_occupancy_report_service.dart';
import 'arena_date_utils.dart';
import 'arena_occupancy_report.dart';
import 'arena_occupancy_report_period.dart';
import 'arena_schedule_providers.dart';

final arenaOccupancyReportServiceProvider =
    Provider<ArenaOccupancyReportService>((ref) {
  return ArenaOccupancyReportService();
});

/// Período selecionado no filtro de Relatórios (padrão: últimos 7 dias).
final arenaOccupancyReportPeriodProvider =
    StateProvider<ArenaOccupancyReportPeriod>(
  (ref) => ArenaOccupancyReportPeriod.last7Days,
);

/// Relatório de ocupação da arena atualmente gerida, no período selecionado.
final arenaOccupancyReportProvider =
    FutureProvider.autoDispose<ArenaOccupancyReport>((ref) async {
  final arenaId = ref.watch(managedArenaIdProvider).valueOrNull;
  if (arenaId == null || arenaId.trim().isEmpty) {
    return ArenaOccupancyReport.empty;
  }
  final period = ref.watch(arenaOccupancyReportPeriodProvider);
  final today = arenaTodayDateOnly();
  final dateTo = arenaDateKey(today);
  final dateFrom =
      arenaDateKey(today.subtract(Duration(days: period.days - 1)));

  return ref.watch(arenaOccupancyReportServiceProvider).fetchReport(
        arenaId: arenaId,
        dateFrom: dateFrom,
        dateTo: dateTo,
      );
});
