import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/nexa_card.dart';

/// Card de navegação do hub Competir (paridade com o `.ch-card` do portal
/// web): quadrado de ícone laranja + título + descrição + chevron.
class CompeteHubMenuCard extends StatelessWidget {
  const CompeteHubMenuCard({
    super.key,
    required this.icon,
    required this.title,
    required this.description,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String description;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return NexaCard(
      onTap: onTap,
      padding: const EdgeInsets.all(AppSpacing.lg + 2),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.12),
              borderRadius: AppRadii.mdAll,
            ),
            child: Icon(icon, size: 22, color: AppColors.brand),
          ),
          const SizedBox(width: AppSpacing.md + 2),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: AppTypography.titleS.copyWith(color: colors.onSurface),
                ),
                const SizedBox(height: 3),
                Text(
                  description,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodyS
                      .copyWith(color: colors.onSurfaceMuted, fontSize: 12.5),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Icon(
            Icons.chevron_right_rounded,
            size: 20,
            color: colors.onSurfaceMuted,
          ),
        ],
      ),
    );
  }
}
