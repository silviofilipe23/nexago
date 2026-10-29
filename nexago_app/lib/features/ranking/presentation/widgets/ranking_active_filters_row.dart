import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme_colors.dart';
import '../../domain/ranking_list_models.dart';

/// O recorte da tela embaixo das abas: esporte · temporada (fixo, troca na
/// folha) e um chip com × para cada filtro ligado, mais "Limpar". É o mesmo
/// recorte que o "Compartilhar" leva.
class RankingActiveFiltersRow extends StatelessWidget {
  const RankingActiveFiltersRow({
    super.key,
    required this.filter,
    required this.sportLabel,
    required this.onChanged,
  });

  final RankingPageFilter filter;
  final String sportLabel;
  final ValueChanged<RankingPageFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final isTeam = filter.mode == RankingListMode.teams;
    final removable = <(String, RankingPageFilter)>[
      if (filter.gender != RankingGenderFilter.all)
        (
          filter.gender.label,
          filter.copyWith(gender: RankingGenderFilter.all),
        ),
      if (filter.level != RankingLevelFilter.all)
        (
          filter.level.label,
          filter.copyWith(level: RankingLevelFilter.all),
        ),
      if (isTeam && filter.format != RankingFormatFilter.all)
        (
          filter.format.label,
          filter.copyWith(format: RankingFormatFilter.all),
        ),
    ];

    return Wrap(
      spacing: 6,
      runSpacing: 6,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        _Chip(
          label: '$sportLabel · '
              '${filter.isGeneralMode ? 'Geral' : '${filter.year}'}',
        ),
        for (final (label, without) in removable)
          _Chip(
            key: ValueKey('ranking-filter-chip-$label'),
            label: label,
            onRemove: () => onChanged(without),
          ),
        if (removable.length > 1)
          Semantics(
            button: true,
            child: GestureDetector(
              key: const Key('ranking-filter-chips-clear'),
              behavior: HitTestBehavior.opaque,
              onTap: () => onChanged(
                filter.copyWith(
                  gender: RankingGenderFilter.all,
                  level: RankingLevelFilter.all,
                  format: RankingFormatFilter.all,
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
                child: Text(
                  'Limpar',
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: colors.brandText,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({super.key, required this.label, this.onRemove});

  final String label;

  /// `null`: chip fixo (esporte e temporada).
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final text = Text(
      label,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        fontSize: 12.5,
        fontWeight: FontWeight.w700,
        color: onRemove == null ? colors.onSurfaceMuted : colors.onSurface,
      ),
    );
    final chip = Container(
      height: 30,
      padding: EdgeInsets.only(left: 12, right: onRemove == null ? 12 : 6),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(15),
        border: Border.all(color: colors.onSurface.withValues(alpha: 0.06)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(child: text),
          if (onRemove != null) ...[
            const SizedBox(width: 2),
            Icon(
              Icons.close_rounded,
              size: 16,
              color: colors.onSurfaceMuted,
            ),
          ],
        ],
      ),
    );
    if (onRemove == null) return chip;
    return Semantics(
      button: true,
      label: 'Remover filtro $label',
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onRemove,
        child: chip,
      ),
    );
  }
}
