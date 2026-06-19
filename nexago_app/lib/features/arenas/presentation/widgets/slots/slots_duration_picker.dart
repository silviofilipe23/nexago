import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
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
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
      child: Row(
        children: [
          for (var i = 0; i < options.length; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            Expanded(
              child: _DurationSegment(
                option: options[i],
                selected: selectedMinutes == options[i].minutes,
                priceLabel: options[i].priceReais != null
                    ? _priceFmt.format(options[i].priceReais)
                    : null,
                onTap: () => onSelected(options[i].minutes),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Segmento compacto de duração (1h · 2h · 3h) — ocupa pouca altura.
class _DurationSegment extends StatelessWidget {
  const _DurationSegment({
    required this.option,
    required this.selected,
    required this.priceLabel,
    required this.onTap,
  });

  final DurationOption option;
  final bool selected;
  final String? priceLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: selected
          ? AppColors.brand.withValues(alpha: 0.1)
          : context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : context.themeColors.onSurfaceMuted.withValues(alpha: 0.18),
              width: selected ? 1.6 : 1,
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                option.label,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w900,
                  color: selected
                      ? AppColors.brand
                      : context.themeColors.onSurface,
                ),
              ),
              if (priceLabel != null) ...[
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    priceLabel!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: selected
                          ? AppColors.brand
                          : context.themeColors.onSurfaceMuted,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
