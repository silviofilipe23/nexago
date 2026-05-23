import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/match_history/athlete_match_history_models.dart';

class MatchHistoryFilterChips extends StatelessWidget {
  const MatchHistoryFilterChips({
    super.key,
    required this.filter,
    required this.onFilterChanged,
  });

  final MatchHistoryFilter filter;
  final ValueChanged<MatchHistoryFilter> onFilterChanged;

  static const _labels = {
    MatchHistoryFilter.all: 'Todos',
    MatchHistoryFilter.year2026: '2026',
    MatchHistoryFilter.year2025: '2025',
    MatchHistoryFilter.winsOnly: 'Vitórias',
  };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: MatchHistoryFilter.values.map((f) {
          final selected = filter == f;
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilterChip(
              label: Text(_labels[f]!),
              selected: selected,
              onSelected: (_) => onFilterChanged(f),
              showCheckmark: false,
              labelStyle: theme.textTheme.labelMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: selected ? AppColors.onSurface : AppColors.onSurfaceMuted,
              ),
              backgroundColor: AppColors.surfaceRaised,
              selectedColor: AppColors.surfaceCard,
              side: BorderSide(
                color: selected
                    ? AppColors.brand.withValues(alpha: 0.5)
                    : Colors.transparent,
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
