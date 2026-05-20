import '../domain/arena_dashboard_summary.dart';

enum ArenaDashboardInsightTone { warning, success, highlight }

class ArenaDashboardInsightLine {
  const ArenaDashboardInsightLine({
    required this.message,
    required this.tone,
    required this.iconName,
  });

  final String message;
  final ArenaDashboardInsightTone tone;

  /// Material icon key: warning, check, crown
  final String iconName;
}

/// Textos automáticos para o painel (regras de negócio leves, sem I/O).
abstract final class ArenaDashboardInsights {
  ArenaDashboardInsights._();

  static List<ArenaDashboardInsightLine> lines(ArenaDashboardSummary s) {
    final out = <ArenaDashboardInsightLine>[];

    if (s.todaySlotsTotal > 0 && s.occupancyRatePercent < 40) {
      out.add(
        ArenaDashboardInsightLine(
          message:
              'Baixa ocupação hoje. Alguns horários ainda estão livres — uma promoção rápida pode ajudar a encher.',
          tone: ArenaDashboardInsightTone.warning,
          iconName: 'warning',
        ),
      );
    }

    if (_isStrongRevenueToday(s)) {
      out.add(
        const ArenaDashboardInsightLine(
          message:
              'Ótimo desempenho hoje. Suas quadras estão com boa movimentação no período.',
          tone: ArenaDashboardInsightTone.success,
          iconName: 'check',
        ),
      );
    }

    if (s.bestWeekdayLabel != null &&
        s.bestWeekdayLabel!.isNotEmpty &&
        s.bestWeekdayRevenue > 0) {
      out.add(
        ArenaDashboardInsightLine(
          message:
              'Melhor dia: ${s.bestWeekdayLabel}. '
              'Soma ${_shortMoney(s.bestWeekdayRevenue)} na amostra dos últimos dias.',
          tone: ArenaDashboardInsightTone.highlight,
          iconName: 'crown',
        ),
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
