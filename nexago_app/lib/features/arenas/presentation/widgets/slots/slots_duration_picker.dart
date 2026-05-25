import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/slots_page_logic.dart';

class SlotsDurationPicker extends StatelessWidget {
  const SlotsDurationPicker({
    super.key,
    required this.options,
    required this.selectedMinutes,
    required this.onSelected,
  });

  final List<DurationOption> options;
  final int? selectedMinutes;
  final ValueChanged<int> onSelected;

  static final _priceFmt = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: r'R$',
    decimalDigits: 0,
  );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
          child: Text(
            'DURAÇÃO',
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: 0.8,
              color: AppColors.onSurfaceMuted,
            ),
          ),
        ),
        SizedBox(
          height: 72,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: options.length,
            separatorBuilder: (_, _) => const SizedBox(width: 8),
            itemBuilder: (context, index) {
              final opt = options[index];
              final isSelected = selectedMinutes == opt.minutes;
              final price = opt.priceReais != null
                  ? _priceFmt.format(opt.priceReais)
                  : '—';

              return Material(
                color: AppColors.surfaceCard,
                borderRadius: BorderRadius.circular(12),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: () => onSelected(opt.minutes),
                  child: Container(
                    width: 72,
                    padding: const EdgeInsets.symmetric(
                      vertical: 10,
                      horizontal: 8,
                    ),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isSelected
                            ? AppColors.brand
                            : AppColors.surfaceRaised,
                        width: isSelected ? 2 : 1,
                      ),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          opt.label,
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w900,
                            color: isSelected
                                ? AppColors.brand
                                : AppColors.onSurface,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          price,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: isSelected
                                ? AppColors.brand
                                : AppColors.onSurfaceMuted,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
