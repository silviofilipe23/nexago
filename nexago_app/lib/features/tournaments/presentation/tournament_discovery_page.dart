import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/ui/app_snackbar.dart';
import '../../arena/presentation/widgets/arena_dashboard_tokens.dart';
import '../../athlete/domain/tournament_access_providers.dart';
import '../../athlete/presentation/widgets/tournament_access_banner.dart';
import '../../../core/theme/app_colors.dart';
import '../../ranking/domain/ranking_providers.dart';
import 'widgets/compete_hub/compete_hub_athletes_section.dart';
import 'widgets/compete_hub/compete_hub_play_match_banner.dart';
import 'widgets/compete_hub/compete_hub_ranking_card.dart';
import 'widgets/compete_hub/compete_hub_ranking_section.dart';
import 'widgets/compete_hub/compete_hub_teams_section.dart';
import 'widgets/compete_hub/compete_hub_tournaments_section.dart';
import 'widgets/pending_tournament_inviter_invites_section.dart';

/// Aba Competir — hub de competições (ranking, torneios, atletas, equipes).
class TournamentDiscoveryPage extends ConsumerWidget {
  const TournamentDiscoveryPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final access = ref.watch(tournamentAccessStateProvider);
    final rankingAsync = ref.watch(competeHubUserRankingProvider);

    return ColoredBox(
      color: theme.colorScheme.surfaceContainerLowest,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
          ArenaDashboardTokens.horizontalPadding,
          12,
          ArenaDashboardTokens.horizontalPadding,
          28,
        ),
        children: [
          if (!access.canAccess)
            TournamentAccessBanner(
              onboardingCompleted: access.onboardingCompleted,
              profileStepsComplete: access.profileStepsComplete,
            ),
          const PendingTournamentInviterInvitesSection(),
          const SizedBox(height: 16),
          rankingAsync.when(
            loading: () => const SizedBox(
              height: 160,
              child: Center(
                child: CircularProgressIndicator(color: AppColors.brand),
              ),
            ),
            error: (_, __) => const Padding(
              padding: EdgeInsets.only(bottom: 14),
              child: Text(
                'Não foi possível carregar seu ranking.',
                style: TextStyle(color: AppColors.onSurfaceMuted),
              ),
            ),
            data: (ranking) {
              if (ranking == null) return const SizedBox.shrink();
              return Column(
                children: [
                  CompeteHubRankingCard(ranking: ranking),
                  const SizedBox(height: 14),
                ],
              );
            },
          ),
          CompeteHubPlayMatchBanner(
            onTap: () => showAppSnackBar(context, 'Em breve.'),
          ),
          const SizedBox(height: 24),
          const CompeteHubTournamentsSection(),
          const SizedBox(height: 24),
          const CompeteHubRankingSection(),
          const SizedBox(height: 24),
          const CompeteHubAthletesSection(),
          const SizedBox(height: 24),
          const CompeteHubTeamsSection(),
        ],
      ),
    );
  }
}
