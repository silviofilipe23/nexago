import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_options.dart';

/// Dropdown de nível na tela de ranking geral — mesmo padrão visual do
/// seletor de categoria do ranking de liga. `null` = todos os níveis.
class RankingLevelFilterDropdown extends StatelessWidget {
  const RankingLevelFilterDropdown({
    super.key,
    required this.selectedRank,
    required this.onChanged,
  });

  final int? selectedRank;
  final ValueChanged<int?> onChanged;

  /// Ranks unificados da escada de 5 (1 e 4 reservados p/ beach tennis).
  static const _ranks = [0, 1, 2, 3, 5];

  /// Sentinela do menu — `PopupMenuItem(value: null)` não dispara
  /// `onSelected` (Flutter trata como cancelamento).
  static const _allLevels = -1;

  @override
  Widget build(BuildContext context) {
    final label = selectedRank == null
        ? 'Todos os níveis'
        : AthleteProfileOptions.labelForRank(selectedRank!);

    return PopupMenuButton<int>(
      initialValue: selectedRank ?? _allLevels,
      onSelected: (value) =>
          onChanged(value == _allLevels ? null : value),
      color: context.themeColors.surfaceRaised,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      itemBuilder: (context) => [
        const PopupMenuItem<int>(
          value: _allLevels,
          child: Text('Todos os níveis'),
        ),
        for (final rank in _ranks)
          PopupMenuItem<int>(
            value: rank,
            child: Text(AthleteProfileOptions.labelForRank(rank)),
          ),
      ],
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
    );
  }
}
