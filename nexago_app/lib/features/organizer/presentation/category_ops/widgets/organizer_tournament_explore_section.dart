import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/explore_card.dart';

import '../../../domain/match_ops/match_ops_providers.dart';
import '../../../domain/tournament_ops/tournament_ops_logic.dart';
import '../../../domain/tournament_ops/tournament_ops_models.dart';
import '../../../domain/tournament_staff/tournament_staff_providers.dart';
import '../../../domain/tournament_uniforms/tournament_uniforms_providers.dart';
import '../organizer_tournament_navigation.dart';

class OrganizerTournamentExploreSection extends ConsumerWidget {
  const OrganizerTournamentExploreSection({
    super.key,
    required this.tournamentId,
    required this.summary,
    required this.showUniforms,
    this.isOwner = false,
    this.showFinancial = true,
    this.matchesOnly = false,
  });

  final String tournamentId;
  final OrganizerTournamentSummary summary;
  final bool showUniforms;

  /// Card "Equipe" aparece só para o dono — staff não gerencia a equipe.
  final bool isOwner;

  /// Card "Financeiro" (arrecadação) é exclusivo do dono.
  final bool showFinancial;

  /// Mesário (scorer) vê apenas o card de partidas.
  final bool matchesOnly;

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
          if (!matchesOnly)
            ExploreCard(
              icon: Icons.grid_view_rounded,
              title: 'Categorias',
              subtitle:
                  organizerExploreCategoriesSubtitle(summary.categoryCount),
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
          if (showFinancial && !matchesOnly)
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
          if (isOwner)
            ExploreCard(
              icon: Icons.groups_2_rounded,
              title: 'Equipe',
              subtitle: ref
                  .watch(tournamentStaffProvider(tournamentId))
                  .maybeWhen(
                    data: (members) => members.isEmpty
                        ? 'Adicione gestores e mesários'
                        : '${members.length} ${members.length == 1 ? 'membro' : 'membros'}',
                    orElse: () => 'Quem ajuda na operação',
                  ),
              onTap: () => pushOrganizerTournamentStaff(
                GoRouter.of(context),
                tournamentId: tournamentId,
              ),
            ),
          if (showUniforms && !matchesOnly)
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
