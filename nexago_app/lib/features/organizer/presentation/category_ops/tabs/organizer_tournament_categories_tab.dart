import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/tournament_ops/tournament_ops_logic.dart';
import '../../../domain/tournament_ops/tournament_ops_models.dart';
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
        Text(
          'Selecione uma categoria',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
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
                final format = generateBracketRouteFormat(category.bracketFormat);
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
