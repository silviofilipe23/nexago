import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../domain/tournament_uniforms/tournament_uniforms_models.dart';

class OrganizerUniformsCategoryChips extends StatelessWidget {
  const OrganizerUniformsCategoryChips({
    super.key,
    required this.totalAthletes,
    required this.chips,
    required this.selectedCategoryId,
    required this.onSelected,
  });

  final int totalAthletes;
  final List<OrganizerUniformCategoryChip> chips;
  final String? selectedCategoryId;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          _CategoryChip(
            label: 'TODAS',
            count: totalAthletes,
            selected: selectedCategoryId == null,
            onTap: () => onSelected(null),
          ),
          const SizedBox(width: 8),
          for (final chip in chips) ...[
            _CategoryChip(
              label: chip.label,
              count: chip.athleteCount,
              selected: selectedCategoryId == chip.categoryId,
              onTap: () => onSelected(chip.categoryId),
            ),
            const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final labelText = label.toUpperCase();
    final labelStyle = AppTypography.mono(
      fontSize: 11,
      fontWeight: FontWeight.w800,
      letterSpacing: 0.2,
    );
    final countStyle = AppTypography.mono(
      fontSize: 11,
      fontWeight: FontWeight.w800,
      letterSpacing: 0.2,
    );

    final labelColor = selected
        ? AppColors.black
        : context.themeColors.onSurfaceMuted.withValues(alpha: 0.85);
    final countColor = selected
        ? AppColors.black.withValues(alpha: 0.5)
        : context.themeColors.onSurfaceMuted.withValues(alpha: 0.45);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: selected ? AppColors.brand : Colors.transparent,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: selected
                ? AppColors.brand
                : context.themeColors.onSurfaceMuted.withValues(alpha: 0.28),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              labelText,
              style: labelStyle.copyWith(color: labelColor),
            ),
            const SizedBox(width: 6),
            Text(
              '$count',
              style: countStyle.copyWith(color: countColor),
            ),
          ],
        ),
      ),
    );
  }
}
