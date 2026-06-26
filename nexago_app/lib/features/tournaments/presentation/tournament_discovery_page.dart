import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/app_mobile_role.dart';
import '../../../core/auth/active_role_providers.dart';
import '../../../core/layout/nexa_floating_header.dart';
import '../../../core/router/routes.dart';
import '../../arena/domain/arena_access_provider.dart';
import '../../arena/presentation/widgets/arena_dashboard_tokens.dart';
import '../../athlete/domain/tournament_access_providers.dart';
import '../../athlete/domain/athlete_shell_providers.dart';
import '../../athlete/presentation/widgets/tournament_access_banner.dart';
import 'widgets/compete_hub/compete_hub_athletes_section.dart';
import 'widgets/compete_hub/compete_hub_ranking_section.dart';
import 'widgets/compete_hub/compete_hub_shell_app_bar.dart';
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
    final arenaPanelAsync = ref.watch(arenaPanelAccessProvider);
    final activeRole = ref.watch(activeMobileRoleProvider);
    final showArenaPanelShortcut = arenaPanelAsync.maybeWhen(
      data: (allowed) => allowed && activeRole == AppMobileRole.arena,
      orElse: () => false,
    );

    return SafeArea(
      top: false,
      bottom: false,
      child: ColoredBox(
        color: theme.colorScheme.surfaceContainerLowest,
        child: CustomScrollView(
          controller: ref
              .watch(athleteShellScrollRegistryProvider)
              .controllerFor(athleteShellCompeteTabIndex),
          slivers: [
            NexaFloatingHeaderSliver(
              padding: const EdgeInsets.fromLTRB(
                ArenaDashboardTokens.horizontalPadding,
                0,
                ArenaDashboardTokens.horizontalPadding,
                12,
              ),
              child: CompeteHubHeader(
                trailingActions: showArenaPanelShortcut
                    ? [
                        const SizedBox(width: 8),
                        CompeteHubAppBarIconButton(
                          icon: Icons.admin_panel_settings_outlined,
                          onTap: () => context.push(AppRoutes.arenaDashboard),
                        ),
                      ]
                    : const [],
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.only(bottom: 28),
              sliver: SliverList.list(
                children: [
                  if (!access.canAccess)
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: ArenaDashboardTokens.horizontalPadding,
                      ),
                      child: TournamentAccessBanner(
                        onboardingCompleted: access.onboardingCompleted,
                        blockMessage: access.blockMessage,
                        missingStepTitles: access.missingStepTitles,
                      ),
                    ),
                  const Padding(
                    padding: EdgeInsets.symmetric(
                      horizontal: ArenaDashboardTokens.horizontalPadding,
                    ),
                    child: PendingTournamentInviterInvitesSection(),
                  ),
                  // const SizedBox(height: 16),
                  // CompeteHubPlayMatchBanner(
                  //   onTap: () => showAppSnackBar(context, 'Em breve.'),
                  // ),
                  // const SizedBox(height: 24),
                  const CompeteHubTournamentsSection(),
                  const SizedBox(height: 8),
                  const Padding(
                    padding: EdgeInsets.symmetric(
                      horizontal: ArenaDashboardTokens.horizontalPadding,
                    ),
                    child: CompeteHubRankingSection(),
                  ),
                  const SizedBox(height: 8),
                  const CompeteHubAthletesSection(),
                  const SizedBox(height: 8),
                  const Padding(
                    padding: EdgeInsets.symmetric(
                      horizontal: ArenaDashboardTokens.horizontalPadding,
                    ),
                    child: CompeteHubTeamsSection(),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
