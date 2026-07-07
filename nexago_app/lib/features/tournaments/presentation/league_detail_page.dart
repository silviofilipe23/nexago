import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/ui/nexa_share.dart';

import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../athlete/domain/daily_mission_sync_provider.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_discovery_providers.dart';
import '../domain/tournament_listing_status.dart';
import 'widgets/league_detail/league_detail_hero.dart';
import 'widgets/league_detail/league_detail_overview_tab.dart';
import 'widgets/league_detail/league_detail_ranking_tab.dart';
import 'widgets/league_detail/league_detail_regulations_tab.dart';
import 'widgets/league_detail/league_detail_stages_tab.dart';
import 'widgets/league_detail/league_detail_tab_bar.dart';

class LeagueDetailPage extends ConsumerStatefulWidget {
  const LeagueDetailPage({super.key, required this.leagueId});

  final String leagueId;

  @override
  ConsumerState<LeagueDetailPage> createState() => _LeagueDetailPageState();
}

class _LeagueDetailPageState extends ConsumerState<LeagueDetailPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: LeagueDetailTabBar.tabs.length, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _shareLeague(DiscoveryLeague league) async {
    await nexaShareText(context, 'Confira a liga ${league.name} no NexaGO!');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final leagueAsync = ref.watch(leagueDetailProvider(widget.leagueId));
    final tournamentsAsync = ref.watch(discoveryTournamentsProvider);
    final topInset = MediaQuery.paddingOf(context).top;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: leagueAsync.when(
        loading: () => Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (e, _) => Center(
          child: Text(
            'Não foi possível carregar a liga.\n$e',
            style: theme.textTheme.bodyLarge?.copyWith(color: AppColors.live),
          ),
        ),
        data: (league) {
          if (league == null) {
            return Center(child: Text('Liga não encontrada.'));
          }

          WidgetsBinding.instance.addPostFrameCallback((_) {
            tryAwardExploreTournamentMission(
              ref,
              listingId: 'league_${widget.leagueId}',
            );
          });

          final tournaments = tournamentsAsync.valueOrNull ?? [];
          final tournamentsById = {for (final t in tournaments) t.id: t};
          final listingBanner =
              leagueListingBannerMessage(league.listingStatus);

          return NestedScrollView(
            headerSliverBuilder: (context, innerBoxIsScrolled) => [
              SliverToBoxAdapter(
                child: LeagueDetailHero(
                  league: league,
                  topInset: topInset,
                  onBack: () => context.pop(),
                  onBookmark: () {
                    showAppSnackBar(context, 'Em breve.');
                  },
                  onShare: () => _shareLeague(league),
                ),
              ),
              SliverPersistentHeader(
                pinned: true,
                delegate: _LeagueTabBarHeader(
                  child: LeagueDetailTabBar(controller: _tabController),
                ),
              ),
            ],
            body: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (listingBanner != null)
                  Container(
                    width: double.infinity,
                    margin: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppColors.live.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: AppColors.live.withValues(alpha: 0.35),
                      ),
                    ),
                    child: Text(
                      listingBanner,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: AppColors.live,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                Expanded(
                  child: TabBarView(
                    controller: _tabController,
                    children: [
                      LeagueDetailOverviewTab(
                        league: league,
                        tournamentsById: tournamentsById,
                        onViewFullRanking: () => _tabController.animateTo(2),
                      ),
                      LeagueDetailStagesTab(
                        league: league,
                        tournamentsById: tournamentsById,
                      ),
                      LeagueDetailRankingTab(
                        league: league,
                        tournamentsById: tournamentsById,
                      ),
                      LeagueDetailRegulationsTab(league: league),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _LeagueTabBarHeader extends SliverPersistentHeaderDelegate {
  _LeagueTabBarHeader({required this.child});

  final Widget child;

  @override
  double get minExtent => 56;

  @override
  double get maxExtent => 56;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return child;
  }

  @override
  bool shouldRebuild(covariant _LeagueTabBarHeader oldDelegate) {
    return oldDelegate.child != child;
  }
}
