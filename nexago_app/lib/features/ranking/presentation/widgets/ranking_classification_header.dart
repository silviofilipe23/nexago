import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';

class RankingClassificationHeader extends StatelessWidget {
  const RankingClassificationHeader({super.key});

  @override
  Widget build(BuildContext context) {
    return Text(
      'Classificação',
      overflow: TextOverflow.ellipsis,
      style: AppTypography.soraRegular(
        fontSize: 18,
        fontWeight: FontWeight.w800,
        color: context.themeColors.onSurface,
        letterSpacing: -0.3,
      ),
    );
  }
}
