import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/ranking_list_models.dart';

class RankingClassificationHeader extends StatelessWidget {
  const RankingClassificationHeader({
    super.key,
    required this.mode,
    required this.count,
  });

  final RankingListMode mode;
  final int count;

  @override
  Widget build(BuildContext context) {
    final unit = mode == RankingListMode.teams ? 'DUPLAS' : 'ATLETAS';

    return Row(
      children: [
        Text(
          'Classificação',
          style: AppTypography.soraRegular(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
            letterSpacing: -0.3,
          ),
        ),
        Spacer(),
        Text(
          '$count $unit',
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: context.themeColors.onSurfaceMuted,
            letterSpacing: 0.5,
          ),
        ),
      ],
    );
  }
}
