import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/layout/nexa_floating_header.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../../athlete/domain/favorites_providers.dart';
import '../domain/arena_dashboard_providers.dart';
import '../domain/arena_schedule_providers.dart';
import '../domain/arena_shell_providers.dart';
import 'arena_dashboard_formatters.dart';
import 'plan/widgets/arena_plan_status_banner.dart';
import 'widgets/arena_dashboard_followers_card.dart';
import 'widgets/arena_dashboard_header.dart';
import 'widgets/arena_dashboard_insights_section.dart';
import 'widgets/arena_dashboard_kpi_grid.dart';
import 'widgets/arena_dashboard_period_chips.dart';
import 'widgets/arena_dashboard_quick_actions.dart';
import 'widgets/arena_dashboard_reputation_section.dart';
import 'widgets/arena_dashboard_revenue_chart_card.dart';
import 'widgets/arena_dashboard_tokens.dart';

class ArenaDashboardPage extends ConsumerWidget {
  const ArenaDashboardPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summaryAsync = ref.watch(arenaDashboardSummaryProvider);
    final metricsAsync = ref.watch(arenaDashboardPeriodMetricsProvider);
    final arenaId = ref.watch(managedArenaIdProvider).valueOrNull;
    final followersInsightsAsync = arenaId == null || arenaId.isEmpty
        ? const AsyncValue<ArenaFollowersInsights>.data(
            ArenaFollowersInsights(
              totalFollowers: 0,
              growthLastWeek: 0,
              qualityBookedPercent: 0,
              activeRecentlyPercent: 0,
            ),
          )
        : ref.watch(arenaFollowersInsightsProvider(arenaId));
    final theme = Theme.of(context);
    final hideFloatingHeader =
        ref.watch(arenaShellFloatingHeaderSuppressedProvider) > 0;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        bottom: false,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final maxW = constraints.maxWidth > 720 ? 640.0 : double.infinity;
            return CustomScrollView(
              controller: ref
                  .watch(arenaShellScrollRegistryProvider)
                  .controllerFor(0),
              key: const PageStorageKey<String>('arena-dashboard-scroll'),
              physics: ArenaDashboardTokens.shellScrollPhysics,
              slivers: [
                if (!hideFloatingHeader)
                  NexaFloatingHeaderSliver(
                    padding: const EdgeInsets.symmetric(
                      horizontal: ArenaDashboardTokens.horizontalPadding,
                    ),
                    child: Center(
                      child: ConstrainedBox(
                        constraints: BoxConstraints(maxWidth: maxW),
                        child: const FadeSlideIn(
                          duration: Duration(milliseconds: 420),
                          offsetY: 14,
                          child: ArenaDashboardHeader(),
                        ),
                      ),
                    ),
                  ),
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(
                    ArenaDashboardTokens.horizontalPadding,
                    0,
                    ArenaDashboardTokens.horizontalPadding,
                    ArenaDashboardTokens.shellScrollBottomPadding(context),
                  ),
                  sliver: SliverToBoxAdapter(
                    child: Center(
                      child: ConstrainedBox(
                        constraints: BoxConstraints(maxWidth: maxW),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const ArenaPlanStatusBanner(),
                            SizedBox(height: ArenaDashboardTokens.sectionGap),
                            const FadeSlideIn(
                              duration: Duration(milliseconds: 440),
                              offsetY: 14,
                              child: ArenaDashboardQuickActions(),
                            ),
                            SizedBox(height: ArenaDashboardTokens.sectionGap),
                            const FadeSlideIn(
                              duration: Duration(milliseconds: 460),
                              offsetY: 14,
                              child: ArenaDashboardPeriodChips(),
                            ),
                            SizedBox(height: ArenaDashboardTokens.sectionGap),
                            summaryAsync.when(
                              data: (summary) => metricsAsync.when(
                                data: (metrics) => Column(
                                  mainAxisSize: MainAxisSize.min,
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    FadeSlideIn(
                                      duration: const Duration(
                                        milliseconds: 500,
                                      ),
                                      offsetY: 14,
                                      child: ArenaDashboardKpiGrid(
                                        items: [
                                          ArenaDashboardKpiItem(
                                            label: 'Faturamento',
                                            value: formatDashboardCurrency(
                                              metrics.revenue,
                                            ),
                                            icon: Icons.payments_rounded,
                                            badge: metrics.revenueBadge,
                                          ),
                                          ArenaDashboardKpiItem(
                                            label: 'Ocupação',
                                            value:
                                                formatDashboardOccupancyPercent(
                                                  metrics.occupancyRatePercent,
                                                ),
                                            icon:
                                                Icons.stacked_bar_chart_rounded,
                                            badge: metrics.occupancyBadge,
                                          ),
                                          ArenaDashboardKpiItem(
                                            label: 'Reservas',
                                            value: '${metrics.bookingsCount}',
                                            icon: Icons.event_available_rounded,
                                            badge: metrics.bookingsBadge,
                                          ),
                                          ArenaDashboardKpiItem(
                                            label: 'Pico',
                                            value: formatDashboardPeakHour(
                                              metrics.peakHour,
                                            ),
                                            icon: Icons
                                                .local_fire_department_rounded,
                                            badge: metrics.peakBadge,
                                          ),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(height: 26),
                                    FadeSlideIn(
                                      duration: const Duration(
                                        milliseconds: 540,
                                      ),
                                      offsetY: 14,
                                      child: ArenaDashboardRevenueChartCard(
                                        values: summary.revenueLast7Days,
                                        labels: summary.chartDayLabels,
                                        metrics: metrics,
                                      ),
                                    ),
                                    SizedBox(
                                      height: ArenaDashboardTokens.sectionGap,
                                    ),
                                    FadeSlideIn(
                                      duration: const Duration(
                                        milliseconds: 580,
                                      ),
                                      offsetY: 14,
                                      child: ArenaDashboardInsightsSection(
                                        summary: summary,
                                      ),
                                    ),
                                    SizedBox(
                                      height: ArenaDashboardTokens.sectionGap,
                                    ),
                                    FadeSlideIn(
                                      duration: const Duration(
                                        milliseconds: 620,
                                      ),
                                      offsetY: 14,
                                      child: ArenaDashboardFollowersCard(
                                        insightsAsync: followersInsightsAsync,
                                        arenaId: arenaId,
                                      ),
                                    ),
                                    SizedBox(
                                      height: ArenaDashboardTokens.sectionGap,
                                    ),
                                    const FadeSlideIn(
                                      duration: Duration(milliseconds: 660),
                                      offsetY: 14,
                                      child: ArenaDashboardReputationSection(),
                                    ),
                                  ],
                                ),
                                loading: () => _loadingBlock(),
                                error: (e, _) => _errorBlock(theme),
                              ),
                              loading: () => _loadingBlock(),
                              error: (e, _) => _errorBlock(theme),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _loadingBlock() {
    return Padding(
      padding: EdgeInsets.symmetric(vertical: 56),
      child: Center(
        child: SizedBox(
          width: 32,
          height: 32,
          child: CircularProgressIndicator(strokeWidth: 2.8),
        ),
      ),
    );
  }

  Widget _errorBlock(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 32),
      child: Text(
        'Não foi possível carregar o painel. Tente de novo.',
        style: theme.textTheme.bodyLarge?.copyWith(
          color: theme.colorScheme.error,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}
