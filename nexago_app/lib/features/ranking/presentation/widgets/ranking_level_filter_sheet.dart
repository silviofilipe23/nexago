import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/ranking_list_models.dart';

/// Folha "Filtrar por nível" — mesmo padrão visual/estrutural de
/// `showRankingGenderFilterSheet`. Devolve a faixa escolhida ou [current]
/// inalterada se a folha for fechada sem escolha.
///
/// As opções são as 4 faixas de [RankingLevelFilter] (não os 7 degraus da
/// escada, que estouravam o teto padrão de 9/16 da tela). Mesmo com 5 linhas,
/// `isScrollControlled` + teto próprio de 85% e lista rolável seguram tela
/// curta e fonte ampliada — sem eles, 1.5x já quebra o layout.
Future<RankingLevelFilter> showRankingLevelFilterSheet(
  BuildContext context, {
  required RankingLevelFilter current,
}) async {
  final result = await showModalBottomSheet<RankingLevelFilter>(
    context: context,
    backgroundColor: context.themeColors.surfaceCard,
    isScrollControlled: true,
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.85,
    ),
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
              Flexible(
                child: ListView(
                  shrinkWrap: true,
                  padding: EdgeInsets.zero,
                  children: [
                    for (final option in RankingLevelFilter.values)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(
                          option.label,
                          style: TextStyle(
                            color: context.themeColors.onSurface,
                            fontWeight: current == option
                                ? FontWeight.w700
                                : FontWeight.w500,
                          ),
                        ),
                        trailing: current == option
                            ? Icon(Icons.check_rounded, color: AppColors.brand)
                            : null,
                        onTap: () => Navigator.pop(context, option),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    },
  );

  return result ?? current;
}
