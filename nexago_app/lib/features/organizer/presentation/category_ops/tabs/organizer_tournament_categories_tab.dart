import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/tournament_ops/tournament_ops_logic.dart';
import '../../../domain/tournament_ops/tournament_ops_providers.dart';
import '../organizer_tournament_navigation.dart';
import '../widgets/organizer_tournament_category_card.dart';

class OrganizerTournamentCategoriesTab extends StatelessWidget {
  const OrganizerTournamentCategoriesTab({
    super.key,
    required this.categories,
    required this.tournamentId,
  });

  final List<OrganizerTournamentCategorySummary> categories;
  final String tournamentId;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 100),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'SELECIONE UMA CATEGORIA',
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: context.themeColors.onSurfaceMuted,
                  letterSpacing: 0.8,
                ),
              ),
            ),
            TextButton(
              onPressed: () => context.pushNamed(
                AppRouteNames.organizerTournamentCreateCategories,
              ),
              style: TextButton.styleFrom(
                foregroundColor: AppColors.brand,
                padding: EdgeInsets.zero,
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: Text(
                '+ Adicionar',
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: AppColors.brand,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        ...categories.map(
          (category) => Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: OrganizerTournamentCategoryCard(
              category: category,
              onTap: () => pushOrganizerCategoryShell(
                GoRouter.of(context),
                tournamentId: tournamentId,
                categoryId: category.categoryId,
              ),
              onGenerateBracket: () {
                final format =
                    generateBracketRouteFormat(category.bracketFormat);
                pushOrganizerCategoryGenerateBracket(
                  GoRouter.of(context),
                  tournamentId: tournamentId,
                  categoryId: category.categoryId,
                  format: format,
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}
