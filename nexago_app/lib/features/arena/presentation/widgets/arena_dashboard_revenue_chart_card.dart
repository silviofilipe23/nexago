import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/arena_dashboard_period_metrics.dart';
import '../arena_dashboard_formatters.dart';
import 'arena_dashboard_revenue_chart.dart';
import 'arena_dashboard_tokens.dart';

/// Card do gráfico de faturamento (últimos 7 dias).
class ArenaDashboardRevenueChartCard extends StatelessWidget {
  const ArenaDashboardRevenueChartCard({
    super.key,
    required this.values,
    required this.labels,
    required this.metrics,
  });

  final List<double> values;
  final List<String> labels;
  final ArenaDashboardPeriodMetrics metrics;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final trend = metrics.chartTrendPercent;

    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Faturamento',
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        'ÚLTIMOS 7 DIAS',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.6,
                        ),
                      ),
                    ],
                  ),
                ),
                if (trend != null && trend.abs() >= 1)
                  _TrendBadge(percent: trend),
              ],
            ),
            SizedBox(height: 16),
            Text(
              formatDashboardCurrency(metrics.chartTotal7Days),
              style: theme.textTheme.headlineLarge?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: -1,
                color: context.themeColors.onSurface,
              ),
            ),
            SizedBox(height: 4),
            Text(
              'soma 7d',
              style: theme.textTheme.bodySmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                fontWeight: FontWeight.w600,
              ),
            ),
            SizedBox(height: 8),
            ArenaDashboardRevenueChart(values: values, labels: labels),
          ],
        ),
      ),
    );
  }
}

class _TrendBadge extends StatelessWidget {
  const _TrendBadge({required this.percent});

  final double percent;

  @override
  Widget build(BuildContext context) {
    final positive = percent > 0;
    final color = positive ? AppColors.win : AppColors.live;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        '${positive ? '▲' : '▼'} ${percent.abs().toStringAsFixed(0)}%',
        style: TextStyle(
          color: color,
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    );
  }
}
