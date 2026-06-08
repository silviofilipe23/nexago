import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

class ArenaSearchHeader extends StatelessWidget {
  const ArenaSearchHeader({
    super.key,
    required this.activeFilterCount,
    required this.onFiltersTap,
    required this.onFavoritesTap,
    required this.onLocationTap,
  });

  final int activeFilterCount;
  final VoidCallback onFiltersTap;
  final VoidCallback onFavoritesTap;
  final VoidCallback onLocationTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'RESERVAR',
                style: AppTypography.soraRegular(
                  fontSize: 10,
                  fontWeight: FontWeight.w500,
                  color: AppColors.brand,
                  letterSpacing: 1,
                ),
              ),
              SizedBox(height: 0),
              Text(
                'Buscar horários',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w900,
                  color: context.themeColors.onSurface,
                  letterSpacing: -0.5,
                ),
              ),
            ],
          ),
        ),
        _IconActionButton(
          icon: Icons.tune_rounded,
          onTap: onFiltersTap,
          badgeCount: activeFilterCount,
        ),
        const SizedBox(width: 8),
        _IconActionButton(
          icon: Icons.favorite_border_rounded,
          onTap: onFavoritesTap,
        ),
        const SizedBox(width: 8),
        _IconActionButton(icon: Icons.place_outlined, onTap: onLocationTap),
      ],
    );
  }
}

class _IconActionButton extends StatelessWidget {
  const _IconActionButton({
    required this.icon,
    required this.onTap,
    this.badgeCount = 0,
  });

  final IconData icon;
  final VoidCallback onTap;
  final int badgeCount;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 44,
          height: 44,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Icon(icon, color: context.themeColors.onSurface, size: 22),
              if (badgeCount > 0)
                Positioned(
                  right: 8,
                  top: 8,
                  child: Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: AppColors.brand,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
