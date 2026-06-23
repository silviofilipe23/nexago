import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/tournament_ops/tournament_ops_logic.dart';
import '../../../domain/tournament_ops/tournament_ops_models.dart';

class OrganizerTournamentHeader extends StatelessWidget {
  const OrganizerTournamentHeader({super.key, required this.summary});

  final OrganizerTournamentSummary summary;

  @override
  Widget build(BuildContext context) {
    final badge = tournamentListingBadge(summary.listingStatus);
    final registrationsOpen =
        badge == OrganizerTournamentListingBadge.registrationsOpen;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            _Badge(
              label: tournamentContextBadge(
                isLeagueStage: summary.isLeagueStage,
                leagueStageOrder: summary.leagueStageOrder,
              ),
            ),
            const SizedBox(width: 8),
            _StatusBadge(
              label: tournamentListingBadgeLabel(badge),
              registrationsOpen: registrationsOpen,
            ),
          ],
        ),
      ],
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.2),
        ),
      ),
      child: Text(
        label.toUpperCase(),
        style: AppTypography.mono(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: context.themeColors.onSurfaceMuted,
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.label, required this.registrationsOpen});

  final String label;
  final bool registrationsOpen;

  @override
  Widget build(BuildContext context) {
    final color = registrationsOpen ? AppColors.win : AppColors.pending;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class OrganizerTournamentKpiRow extends StatelessWidget {
  const OrganizerTournamentKpiRow({super.key, required this.summary});

  final OrganizerTournamentSummary summary;

  @override
  Widget build(BuildContext context) {
    final items = [
      _KpiItem('INSCRITOS', '${summary.enrolledCount}', false),
      _KpiItem('PENDENTES', '${summary.pendingCount}', false),
      _KpiItem('CATEGORIAS', '${summary.categoryCount}', false),
      _KpiItem(
        'ARRECADADO',
        formatOrganizerMoneyCents(summary.collectedCents),
        true,
      ),
    ];
    return SizedBox(
      height: 76,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, index) {
          final item = items[index];
          return Container(
            width: 118,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.themeColors.surfaceCard,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: context.themeColors.onSurfaceMuted.withValues(
                  alpha: 0.12,
                ),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.label,
                  style: AppTypography.mono(
                    fontSize: 10,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
                const Spacer(),
                Text(
                  item.value,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: item.accent ? AppColors.win : null,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _KpiItem {
  const _KpiItem(this.label, this.value, this.accent);

  final String label;
  final String value;
  final bool accent;
}
