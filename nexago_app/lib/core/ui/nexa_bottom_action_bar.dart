import 'package:flutter/material.dart';

import '../theme/app_borders.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Barra inferior fixa de ação (preço + CTA) — unifica as barras de
/// detalhe, inscrição e PIX.
class NexaBottomActionBar extends StatelessWidget {
  const NexaBottomActionBar({
    super.key,
    this.leading,
    required this.action,
    this.hint,
  });

  final Widget? leading;
  final Widget action;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      decoration: BoxDecoration(
        color: colors.canvas,
        border: Border(top: AppBorders.subtleSide(colors)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenH, AppSpacing.md, AppSpacing.screenH,
              AppSpacing.md),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (hint != null) ...[
                Text(
                  hint!,
                  textAlign: TextAlign.center,
                  style: AppTypography.bodyS
                      .copyWith(color: colors.onSurfaceMuted),
                ),
                const SizedBox(height: AppSpacing.sm),
              ],
              Row(
                children: [
                  if (leading != null) ...[
                    leading!,
                    const SizedBox(width: AppSpacing.lg),
                  ],
                  Expanded(child: action),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
