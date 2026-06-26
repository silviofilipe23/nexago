import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/explore_card.dart';

import '../../../../../core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/tournament_detail_logic.dart';
import '../../../domain/tournament_detail_model.dart';
import '../../../domain/tournament_discovery_providers.dart';

class TournamentDetailExploreSection extends ConsumerWidget {
  const TournamentDetailExploreSection({
    super.key,
    required this.tournament,
    required this.stats,
  });

  final TournamentDetail tournament;
  final TournamentDetailStats stats;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final showGroups = tournamentShouldShowGroupsTab(tournament);
    final showBracket = ref
        .watch(tournamentMatchesProvider(tournament.id))
        .maybeWhen(
          data: tournamentShouldShowBracketExploreCard,
          orElse: () => false,
        );
    final tournamentId = tournament.id;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'EXPLORAR O TORNEIO',
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 12),
          ExploreCard(
            icon: Icons.grid_view_rounded,
            title: 'Categorias',
            subtitle: tournamentExploreCategoriesSubtitle(stats),
            onTap: () => context.pushNamed(
              AppRouteNames.tournamentCategories,
              pathParameters: {'tournamentId': tournamentId},
            ),
          ),
          if (showBracket)
            ExploreCard(
              icon: Icons.account_tree_outlined,
              title: 'Chaves e Jogos',
              subtitle: tournamentExploreBracketSubtitle(tournament),
              onTap: () => context.pushNamed(
                AppRouteNames.tournamentBracket,
                pathParameters: {'tournamentId': tournamentId},
              ),
            ),
          if (showGroups)
            ExploreCard(
              icon: Icons.groups_outlined,
              title: 'Grupos',
              subtitle: tournamentExploreBracketSubtitle(tournament),
              onTap: () => context.pushNamed(
                AppRouteNames.tournamentGroups,
                pathParameters: {'tournamentId': tournamentId},
              ),
            ),
          ExploreCard(
            icon: Icons.emoji_events_outlined,
            title: 'Premiações',
            subtitle: tournamentExplorePrizesSubtitle(stats),
            onTap: () => context.pushNamed(
              AppRouteNames.tournamentPrizes,
              pathParameters: {'tournamentId': tournamentId},
            ),
          ),
          ExploreCard(
            icon: Icons.leaderboard_outlined,
            title: 'Pódio',
            subtitle: 'Definido após o torneio',
            enabled: false,
            onTap: () {},
          ),
        ],
      ),
    );
  }
}
