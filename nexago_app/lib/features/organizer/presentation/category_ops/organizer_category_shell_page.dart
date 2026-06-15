import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../domain/category_ops/category_ops_logic.dart';
import '../../domain/category_ops/category_ops_models.dart';
import '../../domain/tournament_ops/tournament_ops_logic.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import 'organizer_tournament_navigation.dart';
import 'tabs/organizer_category_payments_tab.dart';
import 'tabs/organizer_category_teams_tab.dart';
import 'widgets/organizer_category_filter_chips.dart';

class OrganizerCategoryShellPage extends ConsumerWidget {
  const OrganizerCategoryShellPage({
    super.key,
    required this.tournamentId,
    required this.categoryId,
  });

  final String tournamentId;
  final String categoryId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final key = OrganizerCategoryKey(
      tournamentId: tournamentId,
      categoryId: categoryId,
    );
    final detail = ref.watch(organizerTournamentDetailProvider(tournamentId));
    final teamsAsync = ref.watch(organizerCategoryRegistrationsProvider(key));

    final category = detail.valueOrNull?.categories
        .where((c) => c.categoryId == categoryId)
        .firstOrNull;
    final teamCount = teamsAsync.valueOrNull?.length ?? 0;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: AppBar(
        backgroundColor: context.themeColors.canvas,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
        ),
        title: Text(category?.name ?? categoryId),
        actions: [
          IconButton(
            icon: const Icon(Icons.campaign_outlined),
            onPressed: () => pushOrganizerCategoryCommunicate(
              GoRouter.of(context),
              tournamentId: tournamentId,
              categoryId: categoryId,
            ),
          ),
        ],
      ),
      body: DefaultTabController(
        length: OrganizerCategoryShellTab.values.length,
        child: Builder(
          builder: (context) {
            final tabController = DefaultTabController.of(context);
            return AnimatedBuilder(
              animation: tabController,
              builder: (context, _) {
                final showTeamsChrome = tabController.index == 0;
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (category != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: Text(
                          '${category.enrolledCount}/${category.maxTeams} duplas · ${category.paidCount} pagas',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: context.themeColors.onSurfaceMuted,
                              ),
                        ),
                      ),
                    const SizedBox(height: 8),
                    TabBar(
                      isScrollable: true,
                      labelColor: AppColors.brand,
                      unselectedLabelColor: context.themeColors.onSurfaceMuted,
                      indicatorColor: AppColors.brand,
                      tabs: [
                        Tab(
                          text: categoryShellTabLabel(
                            OrganizerCategoryShellTab.teams,
                            count: teamCount,
                          ),
                        ),
                        const Tab(text: 'Pagamentos'),
                        const Tab(text: 'Chave'),
                        const Tab(text: 'Jogos'),
                      ],
                    ),
                    if (showTeamsChrome) ...[
                      const SizedBox(height: 8),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: TextField(
                          decoration: const InputDecoration(
                            hintText: 'Buscar dupla',
                            prefixIcon: Icon(Icons.search_rounded),
                          ),
                          onChanged: (v) => ref
                              .read(organizerCategoryFilterProvider.notifier)
                              .setSearch(v),
                        ),
                      ),
                      const SizedBox(height: 8),
                      const OrganizerCategoryFilterChips(),
                    ],
                    Expanded(
                      child: TabBarView(
                        children: [
                          OrganizerCategoryTeamsTab(
                            tournamentId: tournamentId,
                            categoryId: categoryId,
                          ),
                          OrganizerCategoryPaymentsTab(
                            tournamentId: tournamentId,
                            categoryId: categoryId,
                          ),
                          Center(
                            child: FilledButton(
                              onPressed: () => pushOrganizerCategoryBracket(
                                GoRouter.of(context),
                                tournamentId: tournamentId,
                                categoryId: categoryId,
                              ),
                              child: const Text('Ver chave'),
                            ),
                          ),
                          Center(
                            child: FilledButton(
                              onPressed: () => pushOrganizerCategoryBracket(
                                GoRouter.of(context),
                                tournamentId: tournamentId,
                                categoryId: categoryId,
                                tab: 'matches',
                              ),
                              child: const Text('Ver jogos'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                );
              },
            );
          },
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => pushOrganizerCategorySeeding(
                    GoRouter.of(context),
                    tournamentId: tournamentId,
                    categoryId: categoryId,
                  ),
                  child: const Text('Cabeças de chave'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton(
                  onPressed: () {
                    final format = category?.bracketFormat ?? '';
                    final routeFormat = generateBracketRouteFormat(format);
                    if (routeFormat == 'double_elimination') {
                      pushOrganizerCategoryFormat(
                        GoRouter.of(context),
                        tournamentId: tournamentId,
                        categoryId: categoryId,
                      );
                    } else {
                      pushOrganizerCategoryGenerateBracket(
                        GoRouter.of(context),
                        tournamentId: tournamentId,
                        categoryId: categoryId,
                        format: routeFormat,
                      );
                    }
                  },
                  style: FilledButton.styleFrom(backgroundColor: AppColors.brand),
                  child: const Text('Gerar chave'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
