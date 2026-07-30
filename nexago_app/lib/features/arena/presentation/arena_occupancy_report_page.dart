import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../domain/arena_occupancy_report.dart';
import '../domain/arena_occupancy_report_period.dart';
import '../domain/arena_occupancy_report_providers.dart';
import '../domain/arena_plan.dart';
import '../domain/arena_plan_providers.dart';
import 'arena_occupancy_report_formatters.dart';
import 'plan/widgets/arena_plan_gate.dart';
import 'widgets/arena_dashboard_kpi_grid.dart';
import 'widgets/arena_dashboard_section_card.dart';
import 'widgets/arena_dashboard_tokens.dart';

/// Tela "Relatórios" do painel de arena — ocupação de quadra por período
/// (horas reservadas, jogadores únicos, taxa de no-show, recorrência).
/// Recurso avançado (Pro/Elite), mesma categoria de
/// [ArenaCapability.metricasCompletas].
class ArenaOccupancyReportPage extends ConsumerWidget {
  const ArenaOccupancyReportPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entitled = ref
        .watch(managedArenaCapabilitiesProvider)
        .contains(ArenaCapability.metricasCompletas);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _ReportHeader(
              onBack: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  context.goNamed(AppRouteNames.arenaDashboard);
                }
              },
            ),
            Expanded(
              child: entitled
                  ? const _ReportBody()
                  : const ArenaPlanUpsell(
                      capability: ArenaCapability.metricasCompletas,
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReportHeader extends StatelessWidget {
  const _ReportHeader({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 20, 0),
      child: Row(
        children: [
          Material(
            color: context.themeColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onBack,
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                width: 44,
                height: 44,
                child: Icon(
                  Icons.arrow_back_rounded,
                  color: context.themeColors.onSurface,
                ),
              ),
            ),
          ),
          Expanded(
            child: Text(
              'Relatórios',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                    letterSpacing: -0.3,
                  ),
            ),
          ),
          const SizedBox(width: 44),
        ],
      ),
    );
  }
}

class _ReportBody extends ConsumerWidget {
  const _ReportBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reportAsync = ref.watch(arenaOccupancyReportProvider);
    final theme = Theme.of(context);

    return LayoutBuilder(
      builder: (context, constraints) {
        final maxW = constraints.maxWidth > 720 ? 640.0 : double.infinity;
        return SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            ArenaDashboardTokens.horizontalPadding,
            16,
            ArenaDashboardTokens.horizontalPadding,
            32,
          ),
          child: Center(
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: maxW),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const _PeriodChips(),
                  SizedBox(height: ArenaDashboardTokens.sectionGap),
                  reportAsync.when(
                    data: (report) => _ReportContent(report: report),
                    loading: () => const Padding(
                      padding: EdgeInsets.symmetric(vertical: 56),
                      child: Center(
                        child: SizedBox(
                          width: 32,
                          height: 32,
                          child: CircularProgressIndicator(strokeWidth: 2.8),
                        ),
                      ),
                    ),
                    error: (e, _) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 32),
                      child: Text(
                        'Não foi possível carregar o relatório. Tente de novo.',
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
    );
  }
}

class _PeriodChips extends ConsumerWidget {
  const _PeriodChips();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(arenaOccupancyReportPeriodProvider);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(ArenaDashboardTokens.chipRadius),
      ),
      child: Padding(
        padding: const EdgeInsets.all(4),
        child: Row(
          children: [
            for (final period in ArenaOccupancyReportPeriod.values)
              Expanded(
                child: _PeriodChip(
                  label: period.label,
                  selected: selected == period,
                  onTap: () => ref
                      .read(arenaOccupancyReportPeriodProvider.notifier)
                      .state = period,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _PeriodChip extends StatelessWidget {
  const _PeriodChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.brand : Colors.transparent,
      borderRadius: BorderRadius.circular(ArenaDashboardTokens.chipRadius),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(ArenaDashboardTokens.chipRadius),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 14,
                color: selected
                    ? AppColors.black
                    : context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ReportContent extends StatelessWidget {
  const _ReportContent({required this.report});

  final ArenaOccupancyReport report;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ArenaDashboardKpiGrid(
          items: [
            ArenaDashboardKpiItem(
              label: 'Horas ocupadas',
              value: formatOccupancyHours(report.totalHoursReserved),
              icon: Icons.schedule_rounded,
            ),
            ArenaDashboardKpiItem(
              label: 'Jogadores únicos',
              value: '${report.uniqueAthletesCount}',
              icon: Icons.groups_rounded,
            ),
            ArenaDashboardKpiItem(
              label: 'Taxa de no-show',
              value: formatOccupancyPercent(report.noShowRatePercent),
              icon: Icons.event_busy_rounded,
            ),
            ArenaDashboardKpiItem(
              label: 'Reservas recorrentes',
              value: formatOccupancyPercent(report.recurringSharePercent),
              icon: Icons.repeat_rounded,
            ),
          ],
        ),
        SizedBox(height: ArenaDashboardTokens.sectionGap),
        ArenaDashboardSectionCard(
          title: 'Ocupação por quadra',
          subtitle: report.totalBookings == 0
              ? 'Nenhuma quadra teve reservas nesse período.'
              : '${report.totalBookings} reserva(s) no período '
                  '(${report.recurringBookingsCount} recorrente(s), '
                  '${report.standaloneBookingsCount} avulsa(s)).',
          child: report.courts.isEmpty
              ? const SizedBox.shrink()
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final court in report.courts) ...[
                      _CourtOccupancyRow(
                        court: court,
                        maxHours: report.courts
                            .map((c) => c.hoursReserved)
                            .fold<double>(0, (m, v) => v > m ? v : m),
                      ),
                      if (court != report.courts.last)
                        const SizedBox(height: 14),
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}

class _CourtOccupancyRow extends StatelessWidget {
  const _CourtOccupancyRow({required this.court, required this.maxHours});

  final ArenaOccupancyCourtBreakdown court;
  final double maxHours;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fraction = maxHours <= 0 ? 0.0 : (court.hoursReserved / maxHours).clamp(0.0, 1.0);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                court.courtName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: context.themeColors.onSurface,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              formatOccupancyHours(court.hoursReserved),
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            value: fraction,
            minHeight: 8,
            backgroundColor: context.themeColors.surfaceSheet,
            valueColor: const AlwaysStoppedAnimation<Color>(AppColors.brand),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          '${court.bookingsCount} reserva(s)',
          style: theme.textTheme.labelSmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
