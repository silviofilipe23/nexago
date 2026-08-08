import 'package:flutter/material.dart';

import '../theme/app_radii.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Pílula de status (ex.: "Inscrições abertas", "Ao vivo", "Encerrado").
class NexaStatusChip extends StatelessWidget {
  const NexaStatusChip({
    super.key,
    required this.label,
    this.color,
    this.showDot = true,
  });

  final String label;
  final Color? color;
  final bool showDot;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final accent = color ?? colors.brand;
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md, vertical: AppSpacing.xs + 2),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.14),
        borderRadius: AppRadii.pillAll,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (showDot) ...[
            Container(
              width: 6,
              height: 6,
              decoration:
                  BoxDecoration(color: accent, shape: BoxShape.circle),
            ),
            const SizedBox(width: AppSpacing.xs + 2),
          ],
          Text(label, style: AppTypography.labelS.copyWith(color: accent)),
        ],
      ),
    );
  }
}

/// Chip de metadado (data, local, vagas) — ícone + texto muted.
class NexaMetaChip extends StatelessWidget {
  const NexaMetaChip({super.key, required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm + 2, vertical: AppSpacing.xs + 2),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: AppRadii.mdAll,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: colors.onSurfaceMuted),
          const SizedBox(width: AppSpacing.xs + 2),
          Text(label,
              style:
                  AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted)),
        ],
      ),
    );
  }
}
