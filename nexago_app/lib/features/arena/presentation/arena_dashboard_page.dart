import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/layout/app_scaffold.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../domain/arena_providers.dart';
import 'arena_dashboard_formatters.dart';
import 'widgets/arena_dashboard_actions_bar.dart';
import 'widgets/arena_dashboard_insights_section.dart';
import 'widgets/arena_dashboard_kpi_grid.dart';
import 'widgets/arena_dashboard_revenue_chart.dart';
import 'widgets/arena_dashboard_section_card.dart';
import 'widgets/arena_logout_button.dart';

class ArenaDashboardPage extends ConsumerWidget {
  const ArenaDashboardPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(arenaModuleConfigProvider);
    final summaryAsync = ref.watch(arenaDashboardSummaryProvider);
    final theme = Theme.of(context);

    return AppScaffold(
      title: config.title,
      actions: const [ArenaLogoutButton()],
      body: ColoredBox(
        color: theme.colorScheme.surfaceContainerLowest,
        child: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final maxW = constraints.maxWidth > 720 ? 640.0 : double.infinity;
              return Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(28, 20, 28, 40),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: maxW),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        FadeSlideIn(
                          duration: const Duration(milliseconds: 420),
                          offsetY: 14,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Painel',
                                style: theme.textTheme.labelLarge?.copyWith(
                                  color: theme.colorScheme.onSurface
                                      .withValues(alpha: 0.45),
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 1.2,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'Visão geral',
                                style: theme.textTheme.headlineMedium?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -1,
                                  height: 1.05,
                                ),
                              ),
                              const SizedBox(height: 12),
                              Text(
                                'Acompanhe faturamento, ocupação e tendência da semana em um só lugar.',
                                style: theme.textTheme.bodyLarge?.copyWith(
                                  color: AppColors.onSurfaceMuted,
                                  height: 1.5,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 36),
                        summaryAsync.when(
                          data: (summary) => Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text(
                                'Hoje',
                                style: theme.textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.3,
                                ),
                              ),
                              const SizedBox(height: 18),
                              ArenaDashboardKpiGrid(
                                items: [
                                  ArenaDashboardKpiItem(
                                    label: 'Faturamento',
                                    value: formatDashboardCurrency(
                                      summary.revenueToday,
                                    ),
                                    icon: Icons.payments_rounded,
                                  ),
                                  ArenaDashboardKpiItem(
                                    label: 'Ocupação',
                                    value: formatDashboardOccupancyPercent(
                                      summary.occupancyRatePercent,
                                    ),
                                    icon: Icons.stacked_bar_chart_rounded,
                                  ),
                                  ArenaDashboardKpiItem(
                                    label: 'Reservas',
                                    value: '${summary.bookingsToday}',
                                    icon: Icons.event_available_rounded,
                                  ),
                                  ArenaDashboardKpiItem(
                                    label: 'Pico',
                                    value: formatDashboardPeakHour(
                                      summary.peakHour,
                                    ),
                                    icon: Icons.local_fire_department_rounded,
                                  ),
                                ],
                              ),
                              const SizedBox(height: 36),
                              ArenaDashboardSectionCard(
                                title: 'Faturamento — últimos 7 dias',
                                subtitle:
                                    'Soma diária das reservas válidas na amostra carregada.',
                                child: ArenaDashboardRevenueChart(
                                  values: summary.revenueLast7Days,
                                  labels: summary.chartDayLabels,
                                ),
                              ),
                              const SizedBox(height: 36),
                              ArenaDashboardInsightsSection(summary: summary),
                              const SizedBox(height: 36),
                              const ArenaDashboardActionsBar(),
                            ],
                          ),
                          loading: () => const Padding(
                            padding: EdgeInsets.symmetric(vertical: 56),
                            child: Center(
                              child: SizedBox(
                                width: 32,
                                height: 32,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.8,
                                ),
                              ),
                            ),
                          ),
                          error: (e, _) => Padding(
                            padding: const EdgeInsets.symmetric(vertical: 32),
                            child: Text(
                              'Não foi possível carregar o painel. Tente de novo.',
                              style: theme.textTheme.bodyLarge?.copyWith(
                                color: theme.colorScheme.error,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}
