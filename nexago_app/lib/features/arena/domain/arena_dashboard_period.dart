/// Período do filtro no painel da arena.
enum ArenaDashboardPeriod {
  today,
  week,
  month,
}

extension ArenaDashboardPeriodX on ArenaDashboardPeriod {
  String get label => switch (this) {
        ArenaDashboardPeriod.today => 'Hoje',
        ArenaDashboardPeriod.week => 'Semana',
        ArenaDashboardPeriod.month => 'Mês',
      };

  int get days => switch (this) {
        ArenaDashboardPeriod.today => 1,
        ArenaDashboardPeriod.week => 7,
        ArenaDashboardPeriod.month => 30,
      };
}
