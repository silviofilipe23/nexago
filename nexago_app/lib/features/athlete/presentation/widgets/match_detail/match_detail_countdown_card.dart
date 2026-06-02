import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';

class MatchDetailCountdownCard extends StatelessWidget {
  const MatchDetailCountdownCard({super.key, required this.detail});

  final AthleteMatchDetail detail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final minutes = detail.startsInMinutes ?? 0;
    final timeLabel = minutes > 0 ? '$minutes min' : 'Em breve';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'COMEÇA EM',
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: AppColors.brand,
              letterSpacing: 1,
              fontSize: 10,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            timeLabel,
            style: theme.textTheme.headlineMedium?.copyWith(
              fontWeight: FontWeight.w900,
              color: AppColors.onSurface,
            ),
          ),
          if (detail.scheduleSubtitle != null) ...[
            const SizedBox(height: 6),
            Text(
              detail.scheduleSubtitle!,
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.onSurfaceMuted,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
