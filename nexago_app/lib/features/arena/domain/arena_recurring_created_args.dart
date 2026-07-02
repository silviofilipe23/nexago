/// Dados exibidos na celebração após criar um horário fixo.
class ArenaRecurringCreatedArgs {
  const ArenaRecurringCreatedArgs({
    required this.seriesId,
    required this.createdCount,
    required this.skippedCount,
    required this.customerName,
    required this.courtName,
    required this.weekday,
    required this.startTime,
    required this.endTime,
  });

  final String seriesId;
  final int createdCount;
  final int skippedCount;
  final String customerName;
  final String courtName;

  /// ISO: 1 = segunda … 7 = domingo.
  final int weekday;
  final String startTime;
  final String endTime;
}
