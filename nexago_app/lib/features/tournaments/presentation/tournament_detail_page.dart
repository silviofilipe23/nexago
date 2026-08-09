import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/ui/nexa_async_view.dart';
import 'package:nexago_app/core/ui/nexa_icon_square_button.dart';
import 'package:nexago_app/core/ui/nexa_share.dart';
import 'package:nexago_app/core/ui/nexa_skeleton.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
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
        child: NexaAsyncView<TournamentDetail?>(
          value: tournamentAsync,
          onRetry: () => ref.invalidate(tournamentDetailProvider(tournamentId)),
          errorTitle: 'Não foi possível carregar',
          errorMessage: 'Não foi possível carregar o torneio.',
          skeleton: Padding(
            padding: EdgeInsets.fromLTRB(
              AppSpacing.screenH,
              topInset,
              AppSpacing.screenH,
              0,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: const [
                SizedBox(height: AppSpacing.lg),
                NexaSkeleton(height: 220, radius: AppRadii.lgAll),
                SizedBox(height: AppSpacing.lg),
                NexaSkeleton(height: 84, radius: AppRadii.lgAll),
                SizedBox(height: AppSpacing.md),
                NexaSkeleton(height: 84, radius: AppRadii.lgAll),
              ],
            ),
          ),
          emptyWhen: (t) => t == null,
          empty: AppEmptyView(
            icon: Icons.emoji_events_outlined,
            title: 'Torneio não encontrado',
            subtitle:
                'O torneio pode ter sido removido ou o link está desatualizado.',
            actionLabel: 'Voltar',
            onAction: () => _handleTournamentDetailBack(context),
          ),
          data: (value) {
            final tournament = value!;

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
            final registrationsByCategory = registrationsAsync.valueOrNull ??
                const <String, UserCategoryRegistration>{};
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
  final TournamentUserRegistrationsByCategory registrationsByCategoryId;
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
    await nexaShareText(context, 'Confira o torneio $name no NexaGO!');
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
        canRegister && widget.registrationResolved && !isAthleteRegistered;
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
                    hasCover: hasCover,
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
              // SliverToBoxAdapter(
              //   child: TournamentDetailCategoryPickSection(
              //     tournament: widget.tournament,
              //     stats: widget.stats,
              //     enrollmentByCategoryId: widget.enrollmentByCategoryId,
              //     enrollmentCountsResolved: widget.enrollmentCountsResolved,
              //     canAccessTournaments: widget.canAccessTournaments,
              //     onRegisterBlocked: widget.onRegisterBlocked,
              //     registrationsByCategoryId: widget.registrationsByCategoryId,
              //     registrationResolved: widget.registrationResolved,
              //   ),
              // ),
              // SliverToBoxAdapter(
              //   child: TournamentDetailTournamentInfoSection(
              //     tournament: widget.tournament,
              //     organizerName: widget.organizerName,
              //     stats: widget.stats,
              //   ),
              // ),
              const SliverPadding(padding: EdgeInsets.only(bottom: 50)),
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
    required this.hasCover,
    required this.onBack,
    required this.onBookmark,
    required this.onShare,
  });

  final bool hasCover;
  final VoidCallback onBack;
  final VoidCallback onBookmark;
  final VoidCallback onShare;

  @override
  Widget build(BuildContext context) {
    final background = hasCover ? Colors.black.withValues(alpha: 0.35) : null;
    final iconColor = hasCover ? Colors.white : null;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.xs,
        AppSpacing.xs,
        AppSpacing.xs,
        0,
      ),
      child: Row(
        children: [
          NexaIconSquareButton(
            icon: Icons.arrow_back_rounded,
            onTap: onBack,
            background: background,
            iconColor: iconColor,
          ),
          const Spacer(),
          NexaIconSquareButton(
            icon: Icons.bookmark_border_rounded,
            onTap: onBookmark,
            background: background,
            iconColor: iconColor,
          ),
          const SizedBox(width: AppSpacing.sm),
          NexaIconSquareButton(
            icon: Icons.ios_share_rounded,
            onTap: onShare,
            background: background,
            iconColor: iconColor,
          ),
        ],
      ),
    );
  }
}
