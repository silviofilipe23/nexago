import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../arena/presentation/widgets/arena_dashboard_tokens.dart';
import '../../athlete/domain/tournament_access_providers.dart';
import '../../athlete/domain/athlete_shell_providers.dart';
import '../../athlete/presentation/widgets/tournament_access_banner.dart';
import 'widgets/compete_hub/compete_hub_athletes_section.dart';
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

    return ColoredBox(
      color: theme.colorScheme.surfaceContainerLowest,
      child: ListView(
        controller:
            ref.watch(athleteShellScrollRegistryProvider).controllerFor(
                  athleteShellCompeteTabIndex,
                ),
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
              blockMessage: access.blockMessage,
              missingStepTitles: access.missingStepTitles,
            ),
          const PendingTournamentInviterInvitesSection(),
          // const SizedBox(height: 16),
          // CompeteHubPlayMatchBanner(
          //   onTap: () => showAppSnackBar(context, 'Em breve.'),
          // ),
          // const SizedBox(height: 24),
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
