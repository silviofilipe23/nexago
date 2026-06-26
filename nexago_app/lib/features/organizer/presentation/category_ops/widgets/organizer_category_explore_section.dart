import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/explore_card.dart';

import '../../../domain/category_ops/category_ops_logic.dart';
import '../../../domain/match_ops/match_ops_providers.dart';
import '../../../domain/tournament_ops/tournament_ops_providers.dart';
import '../organizer_tournament_navigation.dart';

class OrganizerCategoryExploreSection extends ConsumerWidget {
  const OrganizerCategoryExploreSection({
    super.key,
    required this.tournamentId,
    required this.categoryId,
    required this.category,
    required this.teamCount,
    required this.pendingCount,
  });

  final String tournamentId;
  final String categoryId;
  final OrganizerTournamentCategorySummary category;
  final int teamCount;
  final int pendingCount;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final key = OrganizerCategoryKey(
      tournamentId: tournamentId,
      categoryId: categoryId,
    );
    final payments = ref.watch(organizerCategoryPaymentsProvider(key));
    final matchesSubtitle = ref
        .watch(organizerTournamentMatchesProvider(tournamentId))
        .maybeWhen(
          data: (matches) {
            final categoryMatches = matches
                .where((m) => m.categoryId.trim() == categoryId.trim())
                .toList();
            final live =
                categoryMatches.where((m) => m.isInProgress).length;
            return organizerCategoryExploreMatchesSubtitle(
              total: categoryMatches.length,
              live: live,
            );
          },
          orElse: () => 'Aguardando chave publicada',
        );

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'GERENCIAR CATEGORIA',
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 12),
          ExploreCard(
            icon: Icons.groups_rounded,
            title: 'Duplas',
            subtitle: organizerCategoryExploreTeamsSubtitle(
              teamCount: teamCount,
              pendingCount: pendingCount,
            ),
            onTap: () => pushOrganizerCategoryTeams(
              GoRouter.of(context),
              tournamentId: tournamentId,
              categoryId: categoryId,
            ),
          ),
          ExploreCard(
            icon: Icons.payments_outlined,
            title: 'Pagamentos',
            subtitle: organizerCategoryExplorePaymentsSubtitle(payments),
            onTap: () => pushOrganizerCategoryPayments(
              GoRouter.of(context),
              tournamentId: tournamentId,
              categoryId: categoryId,
            ),
          ),
          ExploreCard(
            icon: Icons.account_tree_outlined,
            title: 'Chave',
            subtitle: organizerCategoryExploreBracketSubtitle(
              category.bracketStatus,
            ),
            onTap: () => pushOrganizerCategoryBracket(
              GoRouter.of(context),
              tournamentId: tournamentId,
              categoryId: categoryId,
            ),
          ),
          ExploreCard(
            icon: Icons.sports_volleyball_rounded,
            title: 'Jogos',
            subtitle: matchesSubtitle,
            onTap: () => pushOrganizerCategoryBracket(
              GoRouter.of(context),
              tournamentId: tournamentId,
              categoryId: categoryId,
              tab: 'matches',
            ),
          ),
        ],
      ),
    );
  }
}
