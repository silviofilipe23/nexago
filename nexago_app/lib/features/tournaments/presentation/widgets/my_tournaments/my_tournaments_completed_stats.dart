import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/my_tournaments_models.dart';

class MyTournamentsCompletedStats extends StatelessWidget {
  const MyTournamentsCompletedStats({
    super.key,
    required this.titlesDisplay,
    required this.podiumsDisplay,
    required this.rankingPointsDisplay,
  });

  final String titlesDisplay;
  final String podiumsDisplay;
  final String rankingPointsDisplay;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: context.themeColors.surfaceCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: MyTournamentsTokens.gold.withValues(alpha: 0.35),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 12),
          child: Row(
            children: [
              Expanded(
                child: _StatColumn(
                  icon: Icons.emoji_events_outlined,
                  iconColor: MyTournamentsTokens.gold,
                  value: titlesDisplay,
                  label: 'TÍTULOS',
                ),
              ),
              Expanded(
                child: _StatColumn(
                  value: podiumsDisplay,
                  label: 'PÓDIOS',
                ),
              ),
              Expanded(
                child: _StatColumn(
                  value: rankingPointsDisplay,
                  label: 'PTS RANKING',
                  valueColor: AppColors.win,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatColumn extends StatelessWidget {
  const _StatColumn({
    required this.value,
    required this.label,
    this.icon,
    this.iconColor,
    this.valueColor,
  });

  final String value;
  final String label;
  final IconData? icon;
  final Color? iconColor;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        if (icon != null) ...[
          Icon(icon, size: 18, color: iconColor ?? context.themeColors.onSurface),
          SizedBox(height: 4),
        ],
        Text(
          value,
          style: AppTypography.soraRegular(
            fontSize: 22,
            fontWeight: FontWeight.w800,
            color: valueColor ?? context.themeColors.onSurface,
          ),
        ),
        SizedBox(height: 4),
        Text(
          label,
          style: AppTypography.mono(
            fontSize: 9,
            fontWeight: FontWeight.w600,
            color: context.themeColors.onSurfaceMuted,
            letterSpacing: 0.4,
          ),
        ),
      ],
    );
  }
}
