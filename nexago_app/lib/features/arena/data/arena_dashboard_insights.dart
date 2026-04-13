import '../domain/arena_dashboard_summary.dart';

/// Textos automáticos para o painel (regras de negócio leves, sem I/O).
abstract final class ArenaDashboardInsights {
  ArenaDashboardInsights._();

  static List<String> lines(ArenaDashboardSummary s) {
    final out = <String>[];

    if (s.todaySlotsTotal > 0 && s.occupancyRatePercent < 40) {
      out.add('Baixa ocupação hoje');
    }

    if (_isStrongRevenueToday(s)) {
      out.add('🔥 Ótimo desempenho hoje');
    }

    if (s.bestWeekdayLabel != null &&
        s.bestWeekdayLabel!.isNotEmpty &&
        s.bestWeekdayRevenue > 0) {
      out.add(
        'Melhor dia da semana: ${s.bestWeekdayLabel} '
        '(${_shortMoney(s.bestWeekdayRevenue)} na amostra)',
      );
    }

    return out;
  }

  static bool _isStrongRevenueToday(ArenaDashboardSummary s) {
    if (s.revenueToday <= 0 || s.bookingsToday < 1) return false;
    final pastSix = s.revenueLast7Days.sublist(0, 6);
    final sum = pastSix.fold<double>(0, (a, b) => a + b);
    final avgPast = sum / 6;
    if (avgPast < 1) {
      return s.revenueToday >= 50;
    }
    return s.revenueToday >= avgPast * 1.2;
  }

  static String _shortMoney(double v) {
    if (v >= 1000) {
      return 'R\$ ${(v / 1000).toStringAsFixed(1)}k'.replaceAll('.', ',');
    }
    return 'R\$ ${v.toStringAsFixed(0)}';
  }
}
