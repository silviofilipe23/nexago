import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/products/arena_product_category.dart';
import '../../widgets/arena_dashboard_tokens.dart';

class ArenaProductCategoryChips extends StatelessWidget {
  const ArenaProductCategoryChips({
    super.key,
    required this.selected,
    required this.onSelected,
  });

  final ArenaProductCategory? selected;
  final ValueChanged<ArenaProductCategory?> onSelected;

  static final _filters = <({String label, ArenaProductCategory? category})>[
    (label: 'Todos', category: null),
    (label: 'Bebidas', category: ArenaProductCategory.bebidas),
    (label: 'Alimentação', category: ArenaProductCategory.alimentacao),
    (label: 'Equipamentos', category: ArenaProductCategory.equipamentos),
    (label: 'Serviços', category: ArenaProductCategory.servicos),
  ];

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final filter in _filters) ...[
            _FilterChip(
              label: filter.label,
              selected: selected == filter.category,
              onTap: () => onSelected(filter.category),
            ),
            const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
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
      color: selected ? AppColors.brand : context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(ArenaDashboardTokens.chipRadius),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Text(
            label,
            style: AppTypography.soraRegular(
              color: selected
                  ? AppColors.black
                  : context.themeColors.onSurfaceMuted,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}
