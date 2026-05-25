import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/slots_page_logic.dart';

class SlotsPeriodChips extends StatelessWidget {
  const SlotsPeriodChips({
    super.key,
    required this.selected,
    required this.counts,
    required this.onSelected,
  });

  final SlotPeriodFilter selected;
  final Map<SlotPeriodFilter, int> counts;
  final ValueChanged<SlotPeriodFilter> onSelected;

  static const _options = [
    (SlotPeriodFilter.all, 'Todos'),
    (SlotPeriodFilter.morning, 'Manhã'),
    (SlotPeriodFilter.afternoon, 'Tarde'),
    (SlotPeriodFilter.evening, 'Noite'),
  ];

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 36,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: _options.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final (period, label) = _options[index];
          final isSelected = selected == period;
          final count = counts[period] ?? 0;
          return FilterChip(
            selected: isSelected,
            showCheckmark: false,
            label: Text(
              '$label $count',
              style: TextStyle(
                fontWeight: FontWeight.w800,
                color: isSelected ? AppColors.black : AppColors.onSurface,
                fontSize: 13,
              ),
            ),
            selectedColor: AppColors.brand,
            backgroundColor: AppColors.surfaceCard,
            side: BorderSide(
              color: isSelected ? AppColors.brand : AppColors.surfaceRaised,
            ),
            onSelected: (_) => onSelected(period),
          );
        },
      ),
    );
  }
}
