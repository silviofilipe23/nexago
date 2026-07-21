/// Período do filtro na tela de Relatórios (ocupação de quadra).
enum ArenaOccupancyReportPeriod { last7Days, last30Days, last90Days }

extension ArenaOccupancyReportPeriodX on ArenaOccupancyReportPeriod {
  String get label => switch (this) {
        ArenaOccupancyReportPeriod.last7Days => '7 dias',
        ArenaOccupancyReportPeriod.last30Days => '30 dias',
        ArenaOccupancyReportPeriod.last90Days => '90 dias',
      };

  int get days => switch (this) {
        ArenaOccupancyReportPeriod.last7Days => 7,
        ArenaOccupancyReportPeriod.last30Days => 30,
        ArenaOccupancyReportPeriod.last90Days => 90,
      };
}
