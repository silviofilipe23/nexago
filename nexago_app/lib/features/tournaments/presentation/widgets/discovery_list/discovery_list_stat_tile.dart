import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_radii.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import '../../../../../core/ui/nexa_card.dart';

/// Tile compacto de estatística (inscritos, ao vivo, abertos) do topo da
/// lista de descoberta.
class DiscoveryListStatTile extends StatelessWidget {
  const DiscoveryListStatTile({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    this.accent,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    final color = accent ?? AppColors.brand;

    return NexaCard(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      radius: AppRadii.md,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Icon(icon, size: 13, color: color),
              const SizedBox(width: 4),
              Text(
                value,
                style: AppTypography.soraRegular(
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                  fontSize: 15,
                  height: 1,
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.soraRegular(
              fontSize: 10,
              height: 1.2,
              color: context.themeColors.onSurfaceMuted,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
