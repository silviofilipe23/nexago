import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/match_history/athlete_tournament_detail_models.dart';

class TournamentDetailSummaryCard extends StatelessWidget {
  const TournamentDetailSummaryCard({super.key, required this.detail});

  final AthleteTournamentDetail detail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF1A1408),
            Color(0xFF0F0D08),
          ],
        ),
        border: Border.all(color: AppColors.pending.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: AppColors.pending.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: AppColors.pending.withValues(alpha: 0.4),
                  ),
                ),
                child: Icon(
                  Icons.emoji_events_rounded,
                  color: AppColors.pending,
                  size: 28,
                ),
              ),
              SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      detail.championBadgeLabel,
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: AppColors.pending,
                        letterSpacing: 0.5,
                      ),
                    ),
                    SizedBox(height: 6),
                    Text(
                      detail.name,
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: context.themeColors.onSurface,
                        height: 1.15,
                      ),
                    ),
                    SizedBox(height: 4),
                    Text(
                      detail.metaLabel,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          SizedBox(height: 18),
          Row(
            children: [
              _StatCell(label: 'JOGOS', value: '${detail.gamesCount}'),
              _StatCell(
                label: 'V',
                value: '${detail.wins}',
                valueColor: AppColors.win,
              ),
              _StatCell(label: 'D', value: '${detail.losses}'),
              _StatCell(
                label: 'XP',
                value: '+${detail.xpEarned}',
                valueColor: AppColors.brand,
                prefix: '',
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatCell extends StatelessWidget {
  const _StatCell({
    required this.label,
    required this.value,
    this.valueColor,
    this.prefix,
  });

  final String label;
  final String value;
  final Color? valueColor;
  final String? prefix;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w900,
              color: valueColor ?? context.themeColors.onSurface,
            ),
          ),
          SizedBox(height: 2),
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurfaceMuted,
              fontSize: 9,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );
  }
}
