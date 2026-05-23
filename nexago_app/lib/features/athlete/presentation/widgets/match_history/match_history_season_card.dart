import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/match_history/athlete_match_history_models.dart';

class MatchHistorySeasonCard extends StatelessWidget {
  const MatchHistorySeasonCard({
    super.key,
    required this.summary,
  });

  final AthleteSeasonSummary summary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final rate = summary.winRatePercent.round();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.surfaceRaised),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Sua temporada • ${summary.year}',
            style: theme.textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w800,
              color: AppColors.onSurfaceMuted,
              letterSpacing: 0.4,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '$rate%',
                style: theme.textTheme.displaySmall?.copyWith(
                  fontWeight: FontWeight.w900,
                  color: AppColors.onSurface,
                  height: 1,
                ),
              ),
              const SizedBox(width: 8),
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text(
                  'aproveitamento',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.onSurfaceMuted,
                  ),
                ),
              ),
              const Spacer(),
              if (summary.trendPercent != null)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.win.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '+${summary.trendPercent!.round()}%',
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.win,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            '${summary.wins}V · ${summary.losses}D',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
              color: AppColors.onSurface,
            ),
          ),
          if (summary.monthlyBars.isNotEmpty) ...[
            const SizedBox(height: 16),
            SizedBox(
              height: 48,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: summary.monthlyBars.map((bar) {
                  final total = bar.wins + bar.losses;
                  final winFlex = total == 0 ? 1 : bar.wins;
                  final lossFlex = total == 0 ? 0 : bar.losses;
                  return Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          Expanded(
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                if (winFlex > 0)
                                  Expanded(
                                    flex: winFlex,
                                    child: Container(
                                      decoration: BoxDecoration(
                                        color: AppColors.win,
                                        borderRadius: const BorderRadius.vertical(
                                          top: Radius.circular(3),
                                        ),
                                      ),
                                    ),
                                  ),
                                if (lossFlex > 0)
                                  Expanded(
                                    flex: lossFlex,
                                    child: Container(
                                      decoration: BoxDecoration(
                                        color: AppColors.live,
                                        borderRadius: const BorderRadius.vertical(
                                          top: Radius.circular(3),
                                        ),
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            bar.label,
                            style: theme.textTheme.labelSmall?.copyWith(
                              fontSize: 8,
                              color: AppColors.onSurfaceMuted,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
