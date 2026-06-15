import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/tournament_ops/tournament_ops_logic.dart';
import '../../../domain/tournament_ops/tournament_ops_models.dart';

class OrganizerTournamentHeader extends StatelessWidget {
  const OrganizerTournamentHeader({
    super.key,
    required this.summary,
  });

  final OrganizerTournamentSummary summary;

  @override
  Widget build(BuildContext context) {
    final badge = tournamentListingBadge(summary.listingStatus);
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
            _Badge(
              label: tournamentListingBadgeLabel(badge),
              accent: badge == OrganizerTournamentListingBadge.registrationsOpen,
            ),
          ],
        ),
        const SizedBox(height: 12),
        Text(
          summary.name,
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: -0.3,
              ),
        ),
        const SizedBox(height: 6),
        Text(
          tournamentMetaLine(
            locationName: summary.locationName,
            city: summary.city,
            state: summary.state,
            dateLabel: summary.dateLabel,
          ),
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
        ),
      ],
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.label, this.accent = false});

  final String label;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: accent
            ? AppColors.brand.withValues(alpha: 0.15)
            : context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: accent
              ? AppColors.brand.withValues(alpha: 0.4)
              : context.themeColors.onSurfaceMuted.withValues(alpha: 0.2),
        ),
      ),
      child: Text(
        label.toUpperCase(),
        style: AppTypography.mono(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: accent ? AppColors.brand : context.themeColors.onSurfaceMuted,
        ),
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
      ('Inscritos', '${summary.enrolledCount}'),
      ('Pendentes', '${summary.pendingCount}'),
      ('Categorias', '${summary.categoryCount}'),
      ('Arrecadado', formatOrganizerMoneyCents(summary.collectedCents)),
    ];
    return SizedBox(
      height: 72,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, index) {
          final (label, value) = items[index];
          return Container(
            width: 120,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.themeColors.surfaceCard,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.15),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: AppTypography.mono(
                    fontSize: 10,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
                const Spacer(),
                Text(
                  value,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
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
