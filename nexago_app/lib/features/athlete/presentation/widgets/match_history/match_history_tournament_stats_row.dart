import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/match_history/athlete_match_history_models.dart';

class MatchHistoryTournamentStatsRow extends StatelessWidget {
  const MatchHistoryTournamentStatsRow({
    super.key,
    required this.counts,
  });

  final TournamentMedalCounts counts;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _StatMiniCard(
            label: 'TORNEIOS',
            value: '${counts.total}',
            color: context.themeColors.onSurface,
          ),
        ),
        SizedBox(width: 8),
        Expanded(
          child: _StatMiniCard(
            label: 'OUROS',
            value: '${counts.gold}',
            color: AppColors.pending,
          ),
        ),
        SizedBox(width: 8),
        Expanded(
          child: _StatMiniCard(
            label: 'PRATA',
            value: '${counts.silver}',
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
        SizedBox(width: 8),
        Expanded(
          child: _StatMiniCard(
            label: 'BRONZE',
            value: '${counts.bronze}',
            color: const Color(0xFFCD7F32),
          ),
        ),
      ],
    );
  }
}

class _StatMiniCard extends StatelessWidget {
  const _StatMiniCard({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.themeColors.surfaceRaised),
      ),
      child: Column(
        children: [
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 0.3,
              fontSize: 9,
            ),
          ),
          SizedBox(height: 4),
          Text(
            value,
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w900,
              color: color,
              height: 1,
            ),
          ),
        ],
      ),
    );
  }
}
