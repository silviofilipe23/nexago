import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';

class AchievementsSummaryRow extends StatelessWidget {
  const AchievementsSummaryRow({
    super.key,
    required this.unlocked,
    required this.inProgress,
    required this.total,
  });

  final int unlocked;
  final int inProgress;
  final int total;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Expanded(
          child: _SummaryCard(
            value: '$unlocked',
            label: 'DESBLOQUEADAS',
            valueColor: AppColors.brand,
            theme: theme,
          ),
        ),
        SizedBox(width: 10),
        Expanded(
          child: _SummaryCard(
            value: '$inProgress',
            label: 'EM PROGRESSO',
            valueColor: context.themeColors.onSurface,
            theme: theme,
          ),
        ),
        SizedBox(width: 10),
        Expanded(
          child: _SummaryCard(
            value: '$total',
            label: 'NO TOTAL',
            valueColor: context.themeColors.onSurface,
            theme: theme,
          ),
        ),
      ],
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.value,
    required this.label,
    required this.valueColor,
    required this.theme,
  });

  final String value;
  final String label;
  final Color valueColor;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised.withValues(alpha: 0.85),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        children: [
          Text(
            value,
            style: AppTypography.soraRegular(
              fontSize: theme.textTheme.headlineSmall?.fontSize ?? 22,
              fontWeight: FontWeight.w800,
              color: valueColor,
              height: 1,
            ),
          ),
          SizedBox(height: 6),
          Text(
            label,
            textAlign: TextAlign.center,
            style: AppTypography.mono(
              color: context.themeColors.onSurfaceMuted,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
              fontSize: 9,
            ),
          ),
        ],
      ),
    );
  }
}
