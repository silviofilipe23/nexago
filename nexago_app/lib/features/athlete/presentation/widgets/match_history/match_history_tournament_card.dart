import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/match_history/athlete_match_history_models.dart';

class MatchHistoryTournamentCard extends StatelessWidget {
  const MatchHistoryTournamentCard({
    super.key,
    required this.tournament,
    this.onTap,
  });

  final AthleteTournamentHistoryItem tournament;
  final VoidCallback? onTap;

  Color _medalColor() {
    return switch (tournament.medal) {
      TournamentPlacement.gold => AppColors.pending,
      TournamentPlacement.silver => AppColors.onSurfaceMuted,
      TournamentPlacement.bronze => const Color(0xFFCD7F32),
      TournamentPlacement.other => AppColors.brand,
    };
  }

  String _placementLabel() {
    return switch (tournament.placement) {
      1 => '1º',
      2 => '2º',
      3 => '3º',
      _ => '${tournament.placement}º',
    };
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final medalColor = _medalColor();

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.surfaceRaised),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: medalColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: medalColor.withValues(alpha: 0.4),
                    ),
                  ),
                  child: Text(
                    _placementLabel(),
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w900,
                      color: medalColor,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        tournament.name,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: AppColors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        tournament.venue,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: AppColors.onSurfaceMuted,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        '${tournament.periodLabel} · ${tournament.categoryLabel} · ${tournament.genderLabel}',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: AppColors.onSurfaceMuted,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        '${tournament.wins}V · ${tournament.losses}D',
                        style: theme.textTheme.labelMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: AppColors.win,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  color: AppColors.onSurfaceMuted.withValues(alpha: 0.6),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
