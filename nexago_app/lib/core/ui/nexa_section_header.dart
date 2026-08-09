import 'package:flutter/material.dart';

import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Título de seção padrão da jornada: eyebrow mono opcional + título +
/// ação "Ver tudo" opcional à direita.
class NexaSectionHeader extends StatelessWidget {
  const NexaSectionHeader({
    super.key,
    required this.title,
    this.eyebrow,
    this.actionLabel,
    this.onAction,
    this.padding =
        const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
  });

  final String title;
  final String? eyebrow;
  final String? actionLabel;
  final VoidCallback? onAction;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: padding,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (eyebrow != null) ...[
                  Text(
                    eyebrow!.toUpperCase(),
                    style: AppTypography.eyebrow.copyWith(color: colors.brand),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                ],
                Text(
                  title,
                  style:
                      AppTypography.titleM.copyWith(color: colors.onSurface),
                ),
              ],
            ),
          ),
          if (actionLabel != null && onAction != null)
            TextButton(
              onPressed: onAction,
              style: TextButton.styleFrom(
                foregroundColor: colors.brand,
                padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.sm, vertical: AppSpacing.xs),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: Text(actionLabel!, style: AppTypography.labelL),
            ),
        ],
      ),
    );
  }
}
