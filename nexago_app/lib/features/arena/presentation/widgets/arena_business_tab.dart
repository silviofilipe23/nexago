import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/errors/friendly_error_message.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/arena_access_providers.dart';
import '../../domain/arena_dashboard_providers.dart';
import '../../domain/arena_staff_role.dart';
import '../arena_dashboard_formatters.dart';
import 'arena_dashboard_insights_section.dart';
import 'arena_dashboard_kpi_grid.dart';
import 'arena_dashboard_period_chips.dart';
import 'arena_dashboard_revenue_chart_card.dart';
import 'arena_now_tab.dart';

/// Aba "Negócio": período, indicadores, gráfico e leituras do dia.
class ArenaBusinessTab extends ConsumerWidget {
  const ArenaBusinessTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summaryAsync = ref.watch(arenaDashboardSummaryProvider);
    final metricsAsync = ref.watch(arenaDashboardPeriodMetricsProvider);
    final seesMoney = ref.watch(arenaCanReadProvider(ArenaArea.financeiro));

    final error = summaryAsync.error ?? metricsAsync.error;
    final summary = summaryAsync.valueOrNull;
    final metrics = metricsAsync.valueOrNull;

    final Widget body;
    if (error != null) {
      body = ArenaSectionError(
        message: friendlyErrorMessage(
          error,
          action: 'Não foi possível carregar os números',
          logReason: 'arena_painel:negocio',
        ),
        onRetry: () => ref.invalidate(arenaDashboardSummaryProvider),
      );
    } else if (summary == null || metrics == null) {
      body = const Padding(
        padding: EdgeInsets.symmetric(vertical: 48),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2.4)),
      );
    } else {
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ArenaDashboardKpiGrid(
            items: [
              if (seesMoney)
                ArenaDashboardKpiItem(
                  label: 'Faturamento',
                  value: formatDashboardCurrency(metrics.revenue),
                  icon: Icons.payments_rounded,
                  badge: metrics.revenueBadge,
                ),
              ArenaDashboardKpiItem(
                label: 'Ocupação',
                value: formatDashboardOccupancyPercent(
                  metrics.occupancyRatePercent,
                ),
                icon: Icons.stacked_bar_chart_rounded,
                badge: metrics.occupancyBadge,
              ),
              ArenaDashboardKpiItem(
                label: 'Reservas',
                value: '${metrics.bookingsCount}',
                icon: Icons.event_available_rounded,
              ),
              ArenaDashboardKpiItem(
                label: 'Horário de pico',
                value: formatDashboardPeakHour(metrics.peakHour),
                icon: Icons.local_fire_department_rounded,
              ),
            ],
          ),
          if (seesMoney && metrics.comparisonLabel != null) ...[
            const SizedBox(height: 8),
            Text(
              'Faturamento ${metrics.comparisonLabel}.',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ],
          if (seesMoney) ...[
            const SizedBox(height: 20),
            ArenaDashboardRevenueChartCard(
              values: summary.revenueLast7Days,
              labels: summary.chartDayLabels,
              metrics: metrics,
            ),
          ],
          const SizedBox(height: 20),
          ArenaDashboardInsightsSection(
            summary: summary,
            includeMoney: seesMoney,
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const ArenaDashboardPeriodChips(),
        const SizedBox(height: 16),
        body,
      ],
    );
  }
}
