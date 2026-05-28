import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../athlete/domain/daily_mission_sync_provider.dart';
import '../../athlete/domain/profile_access.dart';
import '../../athlete/domain/tournament_access_providers.dart';
import '../domain/tournament_detail_logic.dart';
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

class TournamentDetailPage extends ConsumerStatefulWidget {
  const TournamentDetailPage({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  ConsumerState<TournamentDetailPage> createState() =>
      _TournamentDetailPageState();
}

class _TournamentDetailPageState extends ConsumerState<TournamentDetailPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(
      length: TournamentDetailTab.values.length,
      vsync: this,
    );
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) setState(() {});
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  TournamentDetailTab get _currentTab =>
      TournamentDetailTab.values[_tabController.index];

  @override
  Widget build(BuildContext context) {
    final tournamentAsync =
        ref.watch(tournamentDetailProvider(widget.tournamentId));
    final leaguesAsync = ref.watch(discoveryLeaguesProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: tournamentAsync.when(
        loading: () => const Center(
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
              listingId: 'tournament_${widget.tournamentId}',
            );
          });

          final leagues = leaguesAsync.valueOrNull ?? [];
          final leagueCtx = resolveLeagueContext(leagues, tournament.id);
          final enrollment = ref
                  .watch(
                    tournamentCategoryEnrollmentCountsProvider(
                      widget.tournamentId,
                    ),
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
            tournamentUserRegistrationsByCategoryProvider(widget.tournamentId),
          );
          final registrationsByCategory =
              registrationsAsync.valueOrNull ?? const <String, String>{};
          final registrationResolved =
              authAsync.hasValue && registrationsAsync.hasValue;
          final isAthleteRegistered = registrationsByCategory.isNotEmpty;

          final canRegister = canRegisterForTournament(tournament.status);
          final access = ref.watch(tournamentAccessStateProvider);
          final ctaLabel = canRegister ? 'Inscrever →' : 'Ver detalhes →';
          final showBottomBar = _currentTab == TournamentDetailTab.overview &&
              registrationResolved &&
              !isAthleteRegistered;

          return Column(
            children: [
              Expanded(
                child: NestedScrollView(
                  headerSliverBuilder: (context, innerBoxIsScrolled) {
                    return [
                      SliverAppBar(
                        pinned: true,
                        backgroundColor: AppColors.canvas,
                        elevation: 0,
                        scrolledUnderElevation: 0,
                        leading: IconButton(
                          icon: const Icon(
                            Icons.arrow_back_rounded,
                            color: AppColors.onSurface,
                          ),
                          onPressed: () => context.pop(),
                        ),
                        actions: [
                          IconButton(
                            icon: const Icon(
                              Icons.bookmark_border_rounded,
                              color: AppColors.onSurface,
                            ),
                            onPressed: () {
                              showAppSnackBar(
                                context,
                                'Favoritos em breve.',
                              );
                            },
                          ),
                          IconButton(
                            icon: const Icon(
                              Icons.ios_share_rounded,
                              color: AppColors.onSurface,
                            ),
                            onPressed: () =>
                                _shareTournament(tournament.name),
                          ),
                        ],
                      ),
                      SliverToBoxAdapter(
                        child: TournamentDetailHero(
                          tournament: tournament,
                          stats: stats,
                        ),
                      ),
                      SliverPersistentHeader(
                        pinned: true,
                        delegate: TournamentDetailTabBarHeader(
                          selected: _currentTab,
                          onSelected: (tab) {
                            _tabController.animateTo(tab.index);
                          },
                        ),
                      ),
                    ];
                  },
                  body: TabBarView(
                    controller: _tabController,
                    children: [
                      TournamentDetailOverviewTab(
                        tournament: tournament,
                        organizerName: organizerName,
                        leagueContextLabel: leagueCtx != null
                            ? leagueContextLabel(leagueCtx)
                            : null,
                        enrollmentByCategoryId: enrollment,
                        registrationsByCategoryId: registrationsByCategory,
                      ),
                      TournamentDetailCategoriesTab(
                        tournament: tournament,
                        enrollmentByCategoryId: enrollment,
                        registrationsByCategoryId: registrationsByCategory,
                        canAccessTournaments: access.canAccess,
                        onRegisterBlocked: () => _onTournamentRegisterBlocked(
                          context,
                          access,
                        ),
                      ),
                      TournamentDetailBracketTab(tournament: tournament),
                      TournamentDetailGroupsTab(tournament: tournament),
                      TournamentDetailPrizesTab(tournament: tournament),
                    ],
                  ),
                ),
              ),
              if (showBottomBar)
                TournamentDetailBottomBar(
                  enabled: true,
                  label: ctaLabel,
                  onPressed: () {
                    if (!canRegister) {
                      context.pop();
                      return;
                    }
                    if (!access.canAccess) {
                      _onTournamentRegisterBlocked(context, access);
                      return;
                    }
                    context.pushNamed(
                      AppRouteNames.tournamentRegistration,
                      pathParameters: {'tournamentId': tournament.id},
                    );
                  },
                ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _shareTournament(String name) async {
    await Share.share('Confira o torneio $name no NexaGO!');
  }

  void _onTournamentRegisterBlocked(
    BuildContext context,
    TournamentAccessState access,
  ) {
    final message = tournamentAccessBlockMessage(
      onboardingCompleted: access.onboardingCompleted,
      profileStepsComplete: access.profileStepsComplete,
    );
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
              icon: const Icon(Icons.arrow_back_rounded),
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
