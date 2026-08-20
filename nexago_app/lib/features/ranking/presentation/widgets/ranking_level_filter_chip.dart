import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/ranking_list_models.dart';
import 'ranking_level_filter_sheet.dart';

/// Chip de nível na tela de ranking geral — abre a mesma folha de seleção
/// já usada pro filtro de gênero (`ranking_gender_filter_sheet.dart`).
/// `RankingLevelFilter.all` = todos os níveis.
class RankingLevelFilterChip extends StatelessWidget {
  const RankingLevelFilterChip({
    super.key,
    required this.selected,
    required this.onChanged,
  });

  final RankingLevelFilter selected;
  final ValueChanged<RankingLevelFilter> onChanged;

  Future<void> _openSheet(BuildContext context) async {
    final result = await showRankingLevelFilterSheet(
      context,
      current: selected,
    );
    if (result != selected) onChanged(result);
  }

  @override
  Widget build(BuildContext context) {
    final label = selected.label;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => _openSheet(context),
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: context.themeColors.outline.withValues(alpha: 0.45),
            ),
            color: context.themeColors.surfaceRaised,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                  color: context.themeColors.onSurface,
                ),
              ),
              const SizedBox(width: 4),
              Icon(
                Icons.arrow_drop_down_rounded,
                size: 18,
                color: context.themeColors.onSurfaceMuted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
