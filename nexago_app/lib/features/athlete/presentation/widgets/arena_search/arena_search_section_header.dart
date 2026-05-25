import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';

class ArenaSearchSectionHeader extends StatelessWidget {
  const ArenaSearchSectionHeader({
    super.key,
    required this.title,
    this.trailingAccent,
    this.trailingLabel,
    this.onTrailingTap,
  });

  final String title;
  final String? trailingAccent;
  final String? trailingLabel;
  final VoidCallback? onTrailingTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      children: [
        Text(
          title,
          style: AppTypography.mono(
            fontWeight: FontWeight.w500,
            color: AppColors.onSurface,
          ),
        ),
        if (trailingAccent != null) ...[
          const SizedBox(width: 6),
          Text(
            trailingAccent!,
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: AppColors.onSurfaceMuted,
            ),
          ),
        ],
        const Spacer(),
        if (trailingLabel != null && onTrailingTap != null)
          TextButton(
            onPressed: onTrailingTap,
            style: TextButton.styleFrom(
              foregroundColor: AppColors.brand,
              padding: EdgeInsets.zero,
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: Text(
              trailingLabel!,
              style: theme.textTheme.labelMedium?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
      ],
    );
  }
}
