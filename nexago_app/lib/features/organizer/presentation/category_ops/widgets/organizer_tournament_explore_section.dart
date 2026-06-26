import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/explore_card.dart';

import '../../../domain/match_ops/match_ops_providers.dart';
import '../../../domain/tournament_ops/tournament_ops_logic.dart';
import '../../../domain/tournament_ops/tournament_ops_models.dart';
import '../../../domain/tournament_uniforms/tournament_uniforms_providers.dart';
import '../organizer_tournament_navigation.dart';

class OrganizerTournamentExploreSection extends ConsumerWidget {
  const OrganizerTournamentExploreSection({
    super.key,
    required this.tournamentId,
    required this.summary,
    required this.showUniforms,
  });

  final String tournamentId;
  final OrganizerTournamentSummary summary;
  final bool showUniforms;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final matchesAsync = ref.watch(
      organizerTournamentMatchesProvider(tournamentId),
    );
    final matchesSubtitle = matchesAsync.maybeWhen(
      data: (matches) {
        final live = matches.where((m) => m.isInProgress).length;
        return organizerExploreMatchesSubtitle(
          total: matches.length,
          live: live,
        );
      },
      orElse: () => 'Operação do dia',
    );

    final uniformsSubtitle = showUniforms
        ? ref.watch(
            organizerTournamentUniformsDisplaySummaryProvider(tournamentId),
          )
        : null;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'GERENCIAR TORNEIO',
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
            subtitle: organizerExploreCategoriesSubtitle(summary.categoryCount),
            onTap: () => pushOrganizerTournamentCategories(
              GoRouter.of(context),
              tournamentId: tournamentId,
            ),
          ),
          // ExploreCard(
          //   icon: Icons.dashboard_outlined,
          //   title: 'Visão geral',
          //   subtitle: organizerExploreOverviewSubtitle(summary),
          //   onTap: () => pushOrganizerTournamentOverview(
          //     GoRouter.of(context),
          //     tournamentId: tournamentId,
          //   ),
          // ),
          ExploreCard(
            icon: Icons.payments_outlined,
            title: 'Financeiro',
            subtitle: organizerExploreFinancialSubtitle(
              summary.paymentsBreakdown,
            ),
            onTap: () => pushOrganizerTournamentFinancial(
              GoRouter.of(context),
              tournamentId: tournamentId,
            ),
          ),
          ExploreCard(
            icon: Icons.sports_volleyball_rounded,
            title: 'Partidas',
            subtitle: matchesSubtitle,
            onTap: () => pushOrganizerTournamentOperations(
              GoRouter.of(context),
              tournamentId: tournamentId,
            ),
          ),
          if (showUniforms)
            ExploreCard(
              icon: Icons.checkroom_outlined,
              title: 'Uniformes',
              subtitle: organizerExploreUniformsSubtitle(
                pendingCount: uniformsSubtitle?.pendingCount ?? 0,
                totalAthletes: uniformsSubtitle?.totalAthletes ?? 0,
              ),
              onTap: () => pushOrganizerTournamentUniforms(
                GoRouter.of(context),
                tournamentId: tournamentId,
              ),
            ),
        ],
      ),
    );
  }
}
