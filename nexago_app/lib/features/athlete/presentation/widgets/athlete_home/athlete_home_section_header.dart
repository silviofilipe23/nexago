import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';

class AthleteHomeSectionHeader extends StatelessWidget {
  const AthleteHomeSectionHeader({
    super.key,
    required this.title,
    this.trailingLabel,
    this.trailingAccent,
    this.onTrailingTap,
  });

  final String title;
  final String? trailingLabel;
  final String? trailingAccent;
  final VoidCallback? onTrailingTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Text(
          title,
          style: theme.textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
          ),
        ),
        if (trailingAccent != null) ...[
          SizedBox(width: 8),
          Text(
            trailingAccent!,
            style: AppTypography.mono(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              letterSpacing: 0.2,
              color: AppColors.brand,
            ),
          ),
        ],
        Spacer(),
        if (trailingLabel != null && onTrailingTap != null)
          TextButton(
            onPressed: onTrailingTap,
            style: TextButton.styleFrom(
              foregroundColor: context.themeColors.onSurfaceMuted,
              padding: EdgeInsets.zero,
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: Text(
              trailingLabel!,
              style: AppTypography.mono(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                letterSpacing: 0.2,
              ),
            ),
          ),
      ],
    );
  }
}
