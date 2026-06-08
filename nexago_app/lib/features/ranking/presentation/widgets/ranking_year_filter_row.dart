import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';

class RankingYearFilterRow extends StatelessWidget {
  const RankingYearFilterRow({
    super.key,
    required this.yearOptions,
    required this.selectedYear,
    required this.modeLabel,
    required this.onYearSelected,
  });

  final List<int?> yearOptions;
  final int? selectedYear;
  final String modeLabel;
  final ValueChanged<int?> onYearSelected;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _YearChip(
                  label: 'Geral',
                  selected: selectedYear == null,
                  onTap: () => onYearSelected(null),
                ),
                for (final year in yearOptions.whereType<int>()) ...[
                  SizedBox(width: 8),
                  _YearChip(
                    label: '$year',
                    selected: selectedYear == year,
                    onTap: () => onYearSelected(year),
                  ),
                ],
              ],
            ),
          ),
        ),
        SizedBox(width: 8),
        Text(
          modeLabel,
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: context.themeColors.onSurfaceMuted,
            letterSpacing: 0.4,
          ),
        ),
      ],
    );
  }
}

class _YearChip extends StatelessWidget {
  const _YearChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected
          ? context.themeColors.onSurface
          : context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: selected
                  ? context.themeColors.onSurface
                  : context.themeColors.surfaceRaised,
            ),
          ),
          child: Text(
            label,
            style: AppTypography.mono(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: selected
                  ? Colors.black
                  : context.themeColors.onSurfaceMuted,
            ),
          ),
        ),
      ),
    );
  }
}
