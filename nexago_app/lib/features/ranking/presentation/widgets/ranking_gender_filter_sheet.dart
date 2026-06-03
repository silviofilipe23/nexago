import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/ranking_list_models.dart';

Future<RankingGenderFilter?> showRankingGenderFilterSheet(
  BuildContext context, {
  required RankingGenderFilter current,
}) {
  return showModalBottomSheet<RankingGenderFilter>(
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
                'Filtrar por gênero',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                    ),
              ),
              SizedBox(height: 12),
              for (final option in const [
                (RankingGenderFilter.all, 'Todos'),
                (RankingGenderFilter.male, 'Masculino'),
                (RankingGenderFilter.female, 'Feminino'),
                (RankingGenderFilter.mixed, 'Misto'),
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
