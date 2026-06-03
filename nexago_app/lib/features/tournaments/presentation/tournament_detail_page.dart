import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../athlete/domain/daily_mission_sync_provider.dart';
import '../../athlete/domain/tournament_access_providers.dart';
import '../domain/tournament_detail_logic.dart';
import '../domain/tournament_detail_model.dart';
import '../domain/tournament_detail_tab.dart';
import '../domain/tournament_discovery_helpers.dart';
import '../data/tournament_inscriptions_repository.dart';
import '../domain/tournament_discovery_providers.dart';
import '../domain/tournament_listing_status.dart';
import 'widgets/tournament_detail/tournament_detail_bottom_bar.dart';
import 'widgets/tournament_detail/tournament_detail_bracket_tab.dart';
import 'widgets/tournament_detail/tournament_detail_categories_tab.dart';
import 'widgets/tournament_detail/tournament_detail_groups_tab.dart';
import 'widgets/tournament_detail/tournament_detail_hero.dart';
import 'widgets/tournament_detail/tournament_detail_overview_tab.dart';
import 'widgets/tournament_detail/tournament_detail_prizes_tab.dart';
import 'widgets/tournament_detail/tournament_detail_tab_bar.dart';

class TournamentDetailPage extends ConsumerWidget {
  const TournamentDetailPage({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tournamentAsync = ref.watch(tournamentDetailProvider(tournamentId));
    final leaguesAsync = ref.watch(discoveryLeaguesProvider);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: tournamentAsync.when(
        loading: () => Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (e, _) => _ErrorBody(
          message: 'Não foi possível carregar o torneio.\n$e',
          onBack: () => context.pop(),
        ),
        data: (tournament) {
          if (tournament == null) {
            return _ErrorBody(
              message: 'Torneio não encontrado.',
              onBack: () => context.pop(),
            );
          }

          WidgetsBinding.instance.addPostFrameCallback((_) {
            tryAwardExploreTournamentMission(
              ref,
              listingId: 'tournament_$tournamentId',
            );
          });

          final leagues = leaguesAsync.valueOrNull ?? [];
          final leagueCtx = resolveLeagueContext(leagues, tournament.id);
          final enrollment = ref
                  .watch(
                    tournamentCategoryEnrollmentCountsProvider(tournamentId),
                  )
                  .valueOrNull ??
              const <String, int>{};
          final stats = tournamentDetailStats(
            tournament,
            enrollmentByCategoryId: enrollment,
          );
          final organizerName = ref.watch(
            tournamentOrganizerDisplayProvider(tournament.managerId ?? ''),
          );

          final authAsync = ref.watch(authProvider);
          final registrationsAsync = ref.watch(
            tournamentUserRegistrationsByCategoryProvider(tournamentId),
          );
          final registrationsByCategory =
              registrationsAsync.valueOrNull ?? const <String, String>{};
          final registrationResolved =
              authAsync.hasValue && registrationsAsync.hasValue;

          final access = ref.watch(tournamentAccessStateProvider);

          return _TournamentDetailContent(
            tournament: tournament,
            stats: stats,
            organizerName: organizerName,
            leagueContextLabel:
                leagueCtx != null ? leagueContextLabel(leagueCtx) : null,
            enrollmentByCategoryId: enrollment,
            registrationsByCategoryId: registrationsByCategory,
            registrationResolved: registrationResolved,
            canAccessTournaments: access.canAccess,
            onRegisterBlocked: () => _onTournamentRegisterBlocked(context, access),
          );
        },
      ),
    );
  }

  void _onTournamentRegisterBlocked(
    BuildContext context,
    TournamentAccessState access,
  ) {
    final message = access.blockMessage;
    if (message != null) {
      showAppSnackBar(context, message, isError: true);
    }
    if (!access.onboardingCompleted) {
      context.go(AppRoutes.athleteOnboardingWelcome);
    } else {
      context.pushNamed(AppRouteNames.athleteCompleteProfile);
    }
  }
}

class _TournamentDetailContent extends ConsumerStatefulWidget {
  const _TournamentDetailContent({
    required this.tournament,
    required this.stats,
    required this.organizerName,
    required this.leagueContextLabel,
    required this.enrollmentByCategoryId,
    required this.registrationsByCategoryId,
    required this.registrationResolved,
    required this.canAccessTournaments,
    required this.onRegisterBlocked,
  });

  final TournamentDetail tournament;
  final TournamentDetailStats stats;
  final String organizerName;
  final String? leagueContextLabel;
  final Map<String, int> enrollmentByCategoryId;
  final Map<String, String> registrationsByCategoryId;
  final bool registrationResolved;
  final bool canAccessTournaments;
  final VoidCallback onRegisterBlocked;

  @override
  ConsumerState<_TournamentDetailContent> createState() =>
      _TournamentDetailContentState();
}

class _TournamentDetailContentState extends ConsumerState<_TournamentDetailContent>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  late final List<TournamentDetailTab> _visibleTabs;

  @override
  void initState() {
    super.initState();
    _visibleTabs = visibleTournamentDetailTabs(widget.tournament);
    _tabController = TabController(length: _visibleTabs.length, vsync: this);
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) setState(() {});
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  TournamentDetailTab get _currentTab => _visibleTabs[_tabController.index];

  Future<void> _shareTournament(String name) async {
    await Share.share('Confira o torneio $name no NexaGO!');
  }

  Widget _buildTab(TournamentDetailTab tab) {
    switch (tab) {
      case TournamentDetailTab.overview:
        return TournamentDetailOverviewTab(
          tournament: widget.tournament,
          organizerName: widget.organizerName,
          leagueContextLabel: widget.leagueContextLabel,
          enrollmentByCategoryId: widget.enrollmentByCategoryId,
          registrationsByCategoryId: widget.registrationsByCategoryId,
        );
      case TournamentDetailTab.categories:
        return TournamentDetailCategoriesTab(
          tournament: widget.tournament,
          enrollmentByCategoryId: widget.enrollmentByCategoryId,
          registrationsByCategoryId: widget.registrationsByCategoryId,
          canAccessTournaments: widget.canAccessTournaments,
          onRegisterBlocked: widget.onRegisterBlocked,
        );
      case TournamentDetailTab.bracket:
        return TournamentDetailBracketTab(tournament: widget.tournament);
      case TournamentDetailTab.groups:
        return TournamentDetailGroupsTab(tournament: widget.tournament);
      case TournamentDetailTab.prizes:
        return TournamentDetailPrizesTab(tournament: widget.tournament);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canRegister = canRegisterForTournament(widget.tournament.status);
    final isAthleteRegistered = widget.registrationsByCategoryId.isNotEmpty;
    final showBottomBar = canRegister &&
        _currentTab == TournamentDetailTab.overview &&
        widget.registrationResolved &&
        !isAthleteRegistered;

    return Column(
      children: [
        Expanded(
          child: NestedScrollView(
            headerSliverBuilder: (context, innerBoxIsScrolled) {
              return [
                SliverAppBar(
                  pinned: true,
                  backgroundColor: context.themeColors.canvas,
                  elevation: 0,
                  scrolledUnderElevation: 0,
                  leading: IconButton(
                    icon: Icon(
                      Icons.arrow_back_rounded,
                      color: context.themeColors.onSurface,
                    ),
                    onPressed: () => context.pop(),
                  ),
                  actions: [
                    IconButton(
                      icon: Icon(
                        Icons.bookmark_border_rounded,
                        color: context.themeColors.onSurface,
                      ),
                      onPressed: () {
                        showAppSnackBar(context, 'Favoritos em breve.');
                      },
                    ),
                    IconButton(
                      icon: Icon(
                        Icons.ios_share_rounded,
                        color: context.themeColors.onSurface,
                      ),
                      onPressed: () =>
                          _shareTournament(widget.tournament.name),
                    ),
                  ],
                ),
                SliverToBoxAdapter(
                  child: TournamentDetailHero(
                    tournament: widget.tournament,
                    stats: widget.stats,
                  ),
                ),
                SliverPersistentHeader(
                  pinned: true,
                  delegate: TournamentDetailTabBarHeader(
                    selected: _currentTab,
                    tabs: _visibleTabs,
                    onSelected: (tab) {
                      _tabController.animateTo(_visibleTabs.indexOf(tab));
                    },
                  ),
                ),
              ];
            },
            body: TabBarView(
              controller: _tabController,
              children: [
                for (final tab in _visibleTabs) _buildTab(tab),
              ],
            ),
          ),
        ),
        if (showBottomBar)
          TournamentDetailBottomBar(
            enabled: true,
            label: 'Inscrever →',
            onPressed: () {
              if (!widget.canAccessTournaments) {
                widget.onRegisterBlocked();
                return;
              }
              context.pushNamed(
                AppRouteNames.tournamentRegistration,
                pathParameters: {'tournamentId': widget.tournament.id},
              );
            },
          ),
      ],
    );
  }
}

class _ErrorBody extends StatelessWidget {
  const _ErrorBody({required this.message, required this.onBack});

  final String message;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: Column(
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: IconButton(
              onPressed: onBack,
              icon: Icon(Icons.arrow_back_rounded),
            ),
          ),
          Expanded(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  message,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: AppColors.live,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
