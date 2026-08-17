import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/ranking_list_models.dart';

const rankingFormatFilterLabels = <RankingFormatFilter, String>{
  RankingFormatFilter.all: 'Todos os formatos',
  RankingFormatFilter.dupla: 'Dupla',
  RankingFormatFilter.trio: 'Trio',
  RankingFormatFilter.quarteto: 'Quarteto',
  RankingFormatFilter.quinteto: 'Quinteto',
};

Future<RankingFormatFilter?> showRankingFormatFilterSheet(
  BuildContext context, {
  required RankingFormatFilter current,
}) {
  return showModalBottomSheet<RankingFormatFilter>(
    context: context,
    backgroundColor: context.themeColors.surfaceCard,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) {
      return SafeArea(
        // Uma opção a mais que a folha de gênero: com fonte acessível grande em
        // tela baixa a coluna estoura — rolar é melhor que cortar o Quinteto.
        child: SingleChildScrollView(
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
                'Filtrar por formato',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
              ),
              SizedBox(height: 12),
              for (final option in const [
                (RankingFormatFilter.all, 'Todos'),
                (RankingFormatFilter.dupla, 'Dupla'),
                (RankingFormatFilter.trio, 'Trio'),
                (RankingFormatFilter.quarteto, 'Quarteto'),
                (RankingFormatFilter.quinteto, 'Quinteto'),
              ])
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(
                    option.$2,
                    style: TextStyle(
                      color: context.themeColors.onSurface,
                      fontWeight: current == option.$1
                          ? FontWeight.w700
                          : FontWeight.w500,
                    ),
                  ),
                  trailing: current == option.$1
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
}
