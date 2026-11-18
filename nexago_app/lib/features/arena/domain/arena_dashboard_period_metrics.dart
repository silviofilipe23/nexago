import 'package:flutter/foundation.dart';

import 'arena_dashboard_period.dart';

enum ArenaDashboardKpiBadgeTone { positive, negative, neutral }

@immutable
class ArenaDashboardKpiBadge {
  const ArenaDashboardKpiBadge({
    required this.label,
    required this.tone,
  });

  final String label;
  final ArenaDashboardKpiBadgeTone tone;
}

/// KPIs e badges para o período selecionado no painel.
@immutable
class ArenaDashboardPeriodMetrics {
  const ArenaDashboardPeriodMetrics({
    required this.period,
    required this.revenue,
    required this.bookingsCount,
    required this.occupancyRatePercent,
    required this.peakHour,
    required this.revenueBadge,
    required this.occupancyBadge,
    required this.bookingsBadge,
    required this.peakBadge,
    required this.chartTotal7Days,
    required this.chartTrendPercent,
    this.comparisonLabel,
  });

  final ArenaDashboardPeriod period;
  final double revenue;
  final int bookingsCount;
  final double occupancyRatePercent;
  final int? peakHour;

  final ArenaDashboardKpiBadge? revenueBadge;
  final ArenaDashboardKpiBadge? occupancyBadge;
  final ArenaDashboardKpiBadge? bookingsBadge;
  final ArenaDashboardKpiBadge? peakBadge;

  /// Soma dos últimos 7 dias (gráfico).
  final double chartTotal7Days;

  /// Variação % dos últimos 7 dias vs os 7 anteriores (gráfico).
  final double? chartTrendPercent;

  /// Base da variação do Faturamento ("vs. o mesmo dia da semana passada");
  /// `null` quando não há variação a mostrar.
  final String? comparisonLabel;
}
