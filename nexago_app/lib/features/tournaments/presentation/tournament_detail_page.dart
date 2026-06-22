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
import '../data/tournament_inscriptions_repository.dart';
import '../domain/tournament_discovery_providers.dart';
import '../domain/tournament_listing_status.dart';
import 'widgets/tournament_detail/tournament_detail_bottom_bar.dart';
import 'widgets/tournament_detail/tournament_detail_category_pick_section.dart';
import 'widgets/tournament_detail/tournament_detail_explore_section.dart';
import 'widgets/tournament_detail/tournament_detail_hero.dart';
import 'widgets/tournament_detail/tournament_detail_tournament_info_section.dart';

void _handleTournamentDetailBack(BuildContext context) {
  if (context.canPop()) {
    context.pop();
    return;
  }
  context.go(AppRoutes.tournamentDiscoveryList);
}

class TournamentDetailPage extends ConsumerWidget {
  const TournamentDetailPage({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tournamentAsync = ref.watch(tournamentDetailProvider(tournamentId));
    final topInset = MediaQuery.paddingOf(context).top;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        top: false,
        bottom: false,
        child: tournamentAsync.when(
          loading: () => Padding(
            padding: EdgeInsets.only(top: topInset),
            child: Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            ),
          ),
          error: (e, _) => _ErrorBody(
            message: 'Não foi possível carregar o torneio.\n$e',
            onBack: () => _handleTournamentDetailBack(context),
          ),
          data: (tournament) {
            if (tournament == null) {
              return _ErrorBody(
                message: 'Torneio não encontrado.',
                onBack: () => _handleTournamentDetailBack(context),
              );
            }

            WidgetsBinding.instance.addPostFrameCallback((_) {
              tryAwardExploreTournamentMission(
                ref,
                listingId: 'tournament_$tournamentId',
              );
            });

            final enrollmentAsync = ref.watch(
              tournamentCategoryEnrollmentCountsProvider(tournamentId),
            );
            final enrollmentResolved = enrollmentAsync.hasValue;
            final enrollment =
                enrollmentAsync.valueOrNull ?? const <String, int>{};
            final stats = tournamentDetailStats(
              tournament,
              enrollmentByCategoryId: enrollment,
              enrollmentCountsResolved: enrollmentResolved,
            );
            final organizerName = ref.watch(
              tournamentOrganizerDisplayProvider(tournament.managerId ?? ''),
            );

            final authAsync = ref.watch(authProvider);
            final registrationsAsync = ref.watch(
              tournamentUserRegistrationsByCategoryProvider(tournamentId),
            );
            final waitlistAsync = ref.watch(
              tournamentUserWaitlistByCategoryProvider(tournamentId),
            );
            final registrationsByCategory =
                registrationsAsync.valueOrNull ?? const <String, String>{};
            final waitlistByCategory =
                waitlistAsync.valueOrNull ?? const <String, bool>{};
            final registrationResolved =
                authAsync.hasValue && registrationsAsync.hasValue;

            final access = ref.watch(tournamentAccessStateProvider);

            return _TournamentDetailContent(
              tournament: tournament,
              stats: stats,
              organizerName: organizerName,
              enrollmentByCategoryId: enrollment,
              enrollmentCountsResolved: enrollmentResolved,
              registrationsByCategoryId: registrationsByCategory,
              waitlistByCategoryId: waitlistByCategory,
              registrationResolved: registrationResolved,
              canAccessTournaments: access.canAccess,
              onRegisterBlocked: () =>
                  _onTournamentRegisterBlocked(context, access),
            );
          },
        ),
      ),
    );
  }

  void _onTournamentRegisterBlocked(
    BuildContext context,
    TournamentAccessState access,
  ) {
    final message = access.snackbarMessage;
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
    required this.enrollmentByCategoryId,
    required this.enrollmentCountsResolved,
    required this.registrationsByCategoryId,
    required this.waitlistByCategoryId,
    required this.registrationResolved,
    required this.canAccessTournaments,
    required this.onRegisterBlocked,
  });

  final TournamentDetail tournament;
  final TournamentDetailStats stats;
  final String organizerName;
  final Map<String, int> enrollmentByCategoryId;
  final bool enrollmentCountsResolved;
  final Map<String, String> registrationsByCategoryId;
  final Map<String, bool> waitlistByCategoryId;
  final bool registrationResolved;
  final bool canAccessTournaments;
  final VoidCallback onRegisterBlocked;

  @override
  ConsumerState<_TournamentDetailContent> createState() =>
      _TournamentDetailContentState();
}

class _TournamentDetailContentState
    extends ConsumerState<_TournamentDetailContent> {
  Future<void> _shareTournament(String name) async {
    await Share.share('Confira o torneio $name no NexaGO!');
  }

  void _openRegistration() {
    if (!widget.canAccessTournaments) {
      widget.onRegisterBlocked();
      return;
    }
    context.pushNamed(
      AppRouteNames.tournamentRegistration,
      pathParameters: {'tournamentId': widget.tournament.id},
    );
  }

  @override
  Widget build(BuildContext context) {
    final canRegister = canRegisterForTournament(widget.tournament.status);
    final isAthleteRegistered = widget.registrationsByCategoryId.isNotEmpty;
    final showBottomBar =
        canRegister &&
        widget.registrationResolved &&
        !isAthleteRegistered;
    final topInset = MediaQuery.paddingOf(context).top;
    final hasCover = widget.tournament.imageUrl?.trim().isNotEmpty == true;
    final spotsSubtitle =
        '${tournamentSpotsRemainingLabel(widget.stats)} · garante já';

    return Column(
      children: [
        Expanded(
          child: CustomScrollView(
            clipBehavior: Clip.none,
            slivers: [
              SliverToBoxAdapter(
                child: TournamentDetailHero(
                  tournament: widget.tournament,
                  stats: widget.stats,
                  topInset: topInset,
                  toolbar: _TournamentDetailToolbar(
                    iconColor: hasCover
                        ? Colors.white
                        : context.themeColors.onSurface,
                    onBack: () => _handleTournamentDetailBack(context),
                    onBookmark: () {
                      showAppSnackBar(context, 'Favoritos em breve.');
                    },
                    onShare: () => _shareTournament(widget.tournament.name),
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: TournamentDetailExploreSection(
                  tournament: widget.tournament,
                  stats: widget.stats,
                ),
              ),
              SliverToBoxAdapter(
                child: TournamentDetailCategoryPickSection(
                  tournament: widget.tournament,
                  stats: widget.stats,
                  enrollmentByCategoryId: widget.enrollmentByCategoryId,
                  enrollmentCountsResolved: widget.enrollmentCountsResolved,
                  canAccessTournaments: widget.canAccessTournaments,
                  onRegisterBlocked: widget.onRegisterBlocked,
                  registrationsByCategoryId: widget.registrationsByCategoryId,
                  registrationResolved: widget.registrationResolved,
                ),
              ),
              SliverToBoxAdapter(
                child: TournamentDetailTournamentInfoSection(
                  tournament: widget.tournament,
                  organizerName: widget.organizerName,
                  stats: widget.stats,
                ),
              ),
              const SliverPadding(padding: EdgeInsets.only(bottom: 100)),
            ],
          ),
        ),
        if (showBottomBar)
          TournamentDetailBottomBar(
            enabled: true,
            priceLabel: widget.tournament.priceLabel,
            spotsSubtitle: spotsSubtitle,
            onPressed: _openRegistration,
          ),
      ],
    );
  }
}

class _TournamentDetailToolbar extends StatelessWidget {
  const _TournamentDetailToolbar({
    required this.iconColor,
    required this.onBack,
    required this.onBookmark,
    required this.onShare,
  });

  final Color iconColor;
  final VoidCallback onBack;
  final VoidCallback onBookmark;
  final VoidCallback onShare;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 4, 0),
      child: Row(
        children: [
          IconButton(
            icon: Icon(Icons.arrow_back_rounded, color: iconColor),
            onPressed: onBack,
          ),
          const Spacer(),
          IconButton(
            icon: Icon(Icons.bookmark_border_rounded, color: iconColor),
            onPressed: onBookmark,
          ),
          IconButton(
            icon: Icon(Icons.ios_share_rounded, color: iconColor),
            onPressed: onShare,
          ),
        ],
      ),
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
    final topInset = MediaQuery.paddingOf(context).top;

    return SafeArea(
      top: false,
      bottom: false,
      child: Column(
        children: [
          Padding(
            padding: EdgeInsets.only(top: topInset),
            child: Align(
              alignment: Alignment.centerLeft,
              child: IconButton(
                onPressed: onBack,
                icon: Icon(Icons.arrow_back_rounded),
              ),
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
