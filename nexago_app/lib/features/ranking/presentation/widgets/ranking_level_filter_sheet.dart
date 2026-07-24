import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_options.dart';

/// Ranks unificados da escada de 5 (rank 4 sem uso — numeração fixa).
const _levelRanks = [0, 1, 2, 3, 5];

/// Sentinela interno — `Navigator.pop(context, null)` seria indistinguível
/// de fechar a folha sem escolher nada, então "Todos os níveis" usa esse
/// valor por baixo e é convertido de volta pra `null` na saída.
const _allLevelsSentinel = -1;

/// Folha "Filtrar por nível" — mesmo padrão visual/estrutural de
/// `showRankingGenderFilterSheet`. Devolve o rank escolhido (`null` = todos)
/// ou [current] inalterado se a folha for fechada sem escolha.
Future<int?> showRankingLevelFilterSheet(
  BuildContext context, {
  required int? current,
}) async {
  final normalizedCurrent = current ?? _allLevelsSentinel;

  final result = await showModalBottomSheet<int>(
    context: context,
    backgroundColor: context.themeColors.surfaceCard,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: context.themeColors.surfaceRaised,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              SizedBox(height: 16),
              Text(
                'Filtrar por nível',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
              ),
              SizedBox(height: 12),
              for (final option in [
                (_allLevelsSentinel, 'Todos os níveis'),
                for (final rank in _levelRanks)
                  (rank, AthleteProfileOptions.labelForRank(rank)),
              ])
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(
                    option.$2,
                    style: TextStyle(
                      color: context.themeColors.onSurface,
                      fontWeight: normalizedCurrent == option.$1
                          ? FontWeight.w700
                          : FontWeight.w500,
                    ),
                  ),
                  trailing: normalizedCurrent == option.$1
                      ? Icon(Icons.check_rounded, color: AppColors.brand)
                      : null,
                  onTap: () => Navigator.pop(context, option.$1),
                ),
            ],
          ),
        ),
      );
    },
  );

  if (result == null) return current;
  return result == _allLevelsSentinel ? null : result;
}
