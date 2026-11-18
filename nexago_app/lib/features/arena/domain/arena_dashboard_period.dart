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
}
