import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

class MatchDetailSectionHeader extends StatelessWidget {
  const MatchDetailSectionHeader({
    super.key,
    required this.eyebrow,
    required this.title,
  });

  final String eyebrow;
  final String title;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          eyebrow,
          style: AppTypography.mono(
            fontWeight: FontWeight.w600,
            color: AppColors.brand,
            letterSpacing: 1.2,
            fontSize: 10,
          ),
        ),
        SizedBox(height: 6),
        Text(
          title,
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
            letterSpacing: -0.3,
          ),
        ),
      ],
    );
  }
}
