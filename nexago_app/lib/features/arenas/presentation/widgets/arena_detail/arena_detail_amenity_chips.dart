import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/arena_amenities.dart';
import '../../../domain/arena_amenities_labels.dart';

class ArenaDetailAmenityChips extends StatelessWidget {
  const ArenaDetailAmenityChips({
    super.key,
    required this.amenities,
  });

  final ArenaAmenities amenities;

  @override
  Widget build(BuildContext context) {
    final items = activeArenaAmenityDisplays(amenities);
    if (items.isEmpty) return const SizedBox.shrink();

    final theme = Theme.of(context);
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final item in items)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            decoration: BoxDecoration(
              color: context.themeColors.surfaceCard,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: AppColors.brand.withValues(alpha: 0.45),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(item.icon, size: 16, color: AppColors.brand),
                SizedBox(width: 6),
                Text(
                  item.label,
                  style: theme.textTheme.labelMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
