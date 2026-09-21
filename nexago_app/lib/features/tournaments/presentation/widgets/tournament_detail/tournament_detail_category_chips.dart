import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/tournament_discovery_models.dart';

/// Uma opção do seletor: só o que o chip precisa saber.
typedef TournamentCategoryChipOption = ({String id, String name});

class TournamentDetailCategoryChips extends StatelessWidget {
  /// Construtor usual: as categorias oferecidas pelo torneio.
  TournamentDetailCategoryChips({
    super.key,
    required List<TournamentCategoryOffer> offers,
    required this.selectedId,
    required this.onSelected,
  }) : options = [
          for (final o in offers) (id: o.id, name: o.name),
        ];

  /// Para quem já tem só o par id/nome (o pódio, por exemplo) e não a oferta.
  const TournamentDetailCategoryChips.fromOptions({
    super.key,
    required this.options,
    required this.selectedId,
    required this.onSelected,
  });

  final List<TournamentCategoryChipOption> options;
  final String selectedId;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    if (options.isEmpty) return const SizedBox.shrink();

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
      child: Row(
        children: [
          for (final option in options) ...[
            if (option != options.first) const SizedBox(width: 8),
            _Chip(
              label: option.name,
              selected: option.id == selectedId,
              onTap: () => onSelected(option.id),
            ),
          ],
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
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
          ? AppColors.brand.withValues(alpha: 0.2)
          : context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(99),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(99),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(99),
            border: Border.all(
              color: selected
                  ? AppColors.brand.withValues(alpha: 0.65)
                  : context.themeColors.onSurfaceMuted.withValues(alpha: 0.15),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Text(
              label,
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: selected ? AppColors.brand : context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
