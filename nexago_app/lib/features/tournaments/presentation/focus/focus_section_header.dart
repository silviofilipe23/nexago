import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Cabeçalho de bloco dentro das seções do Focus ("ORDEM DO SEU DIA",
/// "SEM HORÁRIO DEFINIDO", "AO VIVO NA SUA CATEGORIA").
class FocusSectionHeader extends StatelessWidget {
  const FocusSectionHeader({
    super.key,
    required this.label,
    this.live = false,
  });

  final String label;
  final bool live;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final color = live ? AppColors.live : colors.onSurfaceMuted;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.lg,
        AppSpacing.screenH,
        AppSpacing.sm,
      ),
      child: Row(
        children: [
          if (live) ...[
            Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
            const SizedBox(width: AppSpacing.sm - 2),
          ],
          Text(label, style: AppTypography.eyebrow.copyWith(color: color)),
        ],
      ),
    );
  }
}
