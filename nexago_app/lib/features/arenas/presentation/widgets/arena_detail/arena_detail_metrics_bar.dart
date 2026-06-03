import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

class ArenaDetailMetricsBar extends StatelessWidget {
  const ArenaDetailMetricsBar({
    super.key,
    required this.score,
    required this.rating,
    required this.reviewsCount,
    required this.totalCourts,
    required this.freeCourtsToday,
  });

  final int score;
  final double rating;
  final int reviewsCount;
  final int totalCourts;
  final int freeCourtsToday;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ratingLabel = rating > 0 ? rating.toStringAsFixed(1) : '—';
    final reviewsLabel = reviewsCount > 0 ? '$reviewsCount av.' : 'sem av.';
    final courtsSubtitle = freeCourtsToday > 0
        ? '· $freeCourtsToday livre${freeCourtsToday == 1 ? '' : 's'}'
        : '';

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
      decoration: BoxDecoration(
        color: AppColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.surfaceRaised),
      ),
      child: IntrinsicHeight(
        child: Row(
          children: [
            Expanded(
              child: _MetricColumn(
                value: '$score',
                label: 'Score · NexaGO',
                theme: theme,
              ),
            ),
            const VerticalDivider(width: 1, color: AppColors.surfaceRaised),
            Expanded(
              child: _MetricColumn(
                value: ratingLabel,
                label: 'Avaliação · $reviewsLabel',
                theme: theme,
              ),
            ),
            const VerticalDivider(width: 1, color: AppColors.surfaceRaised),
            Expanded(
              child: _MetricColumn(
                value: '$totalCourts',
                label: 'Quadras$courtsSubtitle',
                theme: theme,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MetricColumn extends StatelessWidget {
  const _MetricColumn({
    required this.value,
    required this.label,
    required this.theme,
  });

  final String value;
  final String label;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          value,
          style: AppTypography.mono(
            fontWeight: FontWeight.w900,
            color: AppColors.brand,
            fontSize: 22,
            height: 1,
          ),
        ),
        SizedBox(height: 6),
        Text(
          label,
          textAlign: TextAlign.center,
          style: theme.textTheme.labelSmall?.copyWith(
            color: AppColors.onSurfaceMuted,
            fontWeight: FontWeight.w600,
            height: 1.2,
          ),
        ),
      ],
    );
  }
}
