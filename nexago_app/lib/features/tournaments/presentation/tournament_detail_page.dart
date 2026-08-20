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
import '../../../core/theme/app_typography.dart';
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
import '../domain/tournament_detail_tabs_logic.dart';
import '../domain/tournament_matches_logic.dart';
import 'widgets/tournament_detail/tournament_detail_bottom_bar.dart';
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
    // A barra continua aparecendo COM inscrição: ela é a porta de entrada da
    // tela de inscrição, e lá o atleta acha o convite pendente, o uniforme e o
    // pagamento — além de poder se inscrever numa segunda categoria, que várias
    // categorias permitem (`maxRegistrationsPerAthlete`). Escondê-la com
    // qualquer inscrição fechava todos esses caminhos de uma vez. O portal
    // nunca escondeu.
    final showBottomBar = canRegister && widget.registrationResolved;
    final topInset = MediaQuery.paddingOf(context).top;
    final spotsSubtitle =
        '${tournamentSpotsRemainingLabel(widget.stats)} · garante já';
    final now = DateTime.now();

    final matches = ref
            .watch(tournamentMatchCardsProvider(widget.tournament.id))
            .valueOrNull
            ?.map((c) => c.match)
            .toList() ??
        const [];
    final teamIdsByCategory = ref
            .watch(
              tournamentUserTeamIdsByCategoryProvider(widget.tournament.id),
            )
            .valueOrNull ??
        const <String, String>{};
    final athleteTeamIds = athleteTeamIdsForHighlight(teamIdsByCategory);
    final isRegistered = isAthleteRegistered || athleteTeamIds.isNotEmpty;
    final live = liveTournamentMatches(matches);
    final isToday = tournamentIsEventToday(widget.tournament, now);
    final hasMyMatchToday = myTournamentDayTimeline(
          matches,
          athleteTeamIds,
          now,
          tournamentRunningToday: isToday,
        ).isNotEmpty ||
        live.isNotEmpty;

    return Column(
      children: [
        SizedBox(height: topInset + AppSpacing.xs),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            0,
            AppSpacing.screenH,
            0,
          ),
          child: Row(
            children: [
              NexaIconSquareButton(
                icon: Icons.arrow_back_rounded,
                onTap: () => _handleTournamentDetailBack(context),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isToday
                          ? '${widget.tournament.name} — hoje'
                          : widget.tournament.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.titleM
                          .copyWith(color: context.themeColors.onSurface),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      tournamentDetailHeroMeta(widget.tournament, now),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.monoMeta
                          .copyWith(color: context.themeColors.onSurfaceMuted),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              NexaIconSquareButton(
                icon: Icons.ios_share_rounded,
                onTap: () => _shareTournament(widget.tournament.name),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Expanded(
          child: CustomScrollView(
            clipBehavior: Clip.none,
            slivers: [
              SliverToBoxAdapter(
                child: TournamentDetailHero(
                  tournament: widget.tournament,
                  stats: widget.stats,
                  topInset: 0,
                  toolbar: const SizedBox.shrink(),
                ),
              ),
              SliverToBoxAdapter(
                child: TournamentDetailExploreSection(
                  tournament: widget.tournament,
                  stats: widget.stats,
                  showHoje: hasMyMatchToday,
                  liveNow: live.isNotEmpty,
                  showMinhaInscricao: isRegistered,
                  palpitesEnabled: tournamentHasDefinedMatchups(matches),
                  onOpenHoje: () => context.pushNamed(
                    AppRouteNames.tournamentFocus,
                    pathParameters: {'tournamentId': widget.tournament.id},
                  ),
                  onOpenCategorias: () => context.pushNamed(
                    AppRouteNames.tournamentCategories,
                    pathParameters: {'tournamentId': widget.tournament.id},
                  ),
                  onOpenMinhaInscricao: () => context.pushNamed(
                    AppRouteNames.tournamentMyRegistration,
                    pathParameters: {'tournamentId': widget.tournament.id},
                  ),
                  onOpenPalpites: () => context.pushNamed(
                    AppRouteNames.tournamentPredictions,
                    pathParameters: {'tournamentId': widget.tournament.id},
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: TournamentDetailTournamentInfoSection(
                  tournament: widget.tournament,
                  organizerName: widget.organizerName,
                  stats: widget.stats,
                ),
              ),
              const SliverPadding(padding: EdgeInsets.only(bottom: 50)),
            ],
          ),
        ),
        if (showBottomBar)
          TournamentDetailBottomBar(
            enabled: true,
            priceLabel: widget.tournament.priceLabel,
            spotsSubtitle: isAthleteRegistered
                ? 'acompanhe sua inscrição'
                : spotsSubtitle,
            ctaLabel: isAthleteRegistered
                ? 'Minha inscrição'
                : 'Inscrever minha dupla',
            onPressed: _openRegistration,
          ),
      ],
    );
  }

}
