import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/app_mobile_role.dart';
import '../../../core/auth/active_role_providers.dart';
import '../../../core/layout/nexa_bottom_nav_bar.dart';
import '../../../core/layout/nexa_floating_header.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_spacing.dart';
import '../../arena/domain/arena_access_provider.dart';
import '../../athlete/domain/tournament_access_providers.dart';
import '../../athlete/domain/athlete_shell_providers.dart';
import '../../athlete/presentation/widgets/tournament_access_banner.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'widgets/compete_hub/compete_hub_menu_card.dart';
import 'widgets/compete_hub/compete_hub_shell_app_bar.dart';

/// Aba Competir — menu de navegação no padrão do painel do portal web:
/// quatro cards (Torneios e ligas, Ranking, Equipes, Atletas). O conteúdo
/// em destaque (carrossel de competições, convites) mora na Home.
class TournamentDiscoveryPage extends ConsumerWidget {
  const TournamentDiscoveryPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final access = ref.watch(tournamentAccessStateProvider);
    final arenaPanelAsync = ref.watch(arenaPanelAccessProvider);
    final activeRole = ref.watch(activeMobileRoleProvider);
    final showArenaPanelShortcut = arenaPanelAsync.maybeWhen(
      data: (allowed) => allowed && activeRole == AppMobileRole.arena,
      orElse: () => false,
    );
    final bottomClearance = nexaBottomNavBarHeight(context) +
        MediaQuery.viewPaddingOf(context).bottom +
        16;

    return SafeArea(
      top: false,
      bottom: false,
      child: ColoredBox(
        color: context.themeColors.canvas,
        child: CustomScrollView(
          controller: ref
              .watch(athleteShellScrollRegistryProvider)
              .controllerFor(athleteShellCompeteTabIndex),
          physics: const AlwaysScrollableScrollPhysics(
            parent: BouncingScrollPhysics(),
          ),
          slivers: [
            NexaFloatingHeaderSliver(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenH,
                0,
                AppSpacing.screenH,
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
              padding: EdgeInsets.fromLTRB(
                AppSpacing.screenH,
                AppSpacing.xs,
                AppSpacing.screenH,
                bottomClearance,
              ),
              sliver: SliverList.list(
                children: [
                  if (!access.canAccess) ...[
                    TournamentAccessBanner(
                      onboardingCompleted: access.onboardingCompleted,
                      blockMessage: access.blockMessage,
                      missingStepTitles: access.missingStepTitles,
                    ),
                    const SizedBox(height: AppSpacing.lg),
                  ],
                  CompeteHubMenuCard(
                    icon: Icons.emoji_events_outlined,
                    title: 'Torneios e ligas',
                    description:
                        'Descubra competições abertas e acompanhe suas inscrições',
                    onTap: () => context.pushNamed(
                      AppRouteNames.tournamentDiscoveryList,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md + 2),
                  CompeteHubMenuCard(
                    icon: Icons.leaderboard_outlined,
                    title: 'Ranking',
                    description: 'Sua posição e a pontuação da temporada',
                    onTap: () =>
                        context.pushNamed(AppRouteNames.athleteRanking),
                  ),
                  const SizedBox(height: AppSpacing.md + 2),
                  CompeteHubMenuCard(
                    icon: Icons.group_outlined,
                    title: 'Equipes',
                    description: 'Equipes da comunidade perto de você',
                    onTap: () => context.pushNamed(AppRouteNames.teamDiscover),
                  ),
                  const SizedBox(height: AppSpacing.md + 2),
                  CompeteHubMenuCard(
                    icon: Icons.person_search_outlined,
                    title: 'Atletas',
                    description: 'Encontre jogadores da comunidade',
                    onTap: () =>
                        context.pushNamed(AppRouteNames.athleteDiscover),
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
