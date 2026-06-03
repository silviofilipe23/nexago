import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Cabeçalho de seção reutilizado no perfil do atleta.
class AthleteProfileSectionHeader extends StatelessWidget {
  const AthleteProfileSectionHeader({
    super.key,
    required this.title,
    required this.trailing,
    required this.onTrailingTap,
    this.trailingBrand = false,
  });

  final String title;
  final String trailing;
  final VoidCallback onTrailingTap;
  final bool trailingBrand;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      children: [
        Text(
          title,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
          ),
        ),
        Spacer(),
        TextButton(
          onPressed: onTrailingTap,
          style: TextButton.styleFrom(
            foregroundColor:
                trailingBrand ? AppColors.brand : context.themeColors.onSurfaceMuted,
            padding: EdgeInsets.zero,
            minimumSize: Size.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '$trailing ',
                style: theme.textTheme.labelMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.6,
                ),
              ),
              Icon(
                Icons.chevron_right_rounded,
                size: 18,
                color: trailingBrand ? AppColors.brand : context.themeColors.onSurfaceMuted,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
