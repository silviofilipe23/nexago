import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_bottom_nav_bar.dart';
import '../../../core/layout/nexa_floating_header.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/nexa_async_view.dart';
import '../../../core/ui/nexa_skeleton.dart';
import '../../arenas/domain/my_bookings_providers.dart';
import '../../ranking/domain/ranking_providers.dart';
import '../../tournaments/data/my_tournament_registrations_repository.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart';
import '../../tournaments/domain/registration_progress_logic.dart';
import '../../tournaments/domain/tournament_partner_invite_providers.dart';
import '../../tournaments/domain/tournament_registration_navigation.dart';
import '../../tournaments/presentation/widgets/my_tournaments_home_section.dart';
import '../../tournaments/presentation/widgets/pending_tournament_invitee_invites_section.dart';
import '../../tournaments/presentation/widgets/pending_tournament_inviter_invites_section.dart';
import '../domain/athlete_booking_helpers.dart';
import '../domain/athlete_display_name.dart';
import '../domain/athlete_home_dashboard_logic.dart';
import '../domain/athlete_home_registration_progress_providers.dart';
import '../domain/athlete_notifications_providers.dart';
import '../domain/athlete_profile_providers.dart';
import '../domain/athlete_shell_providers.dart';
import '../domain/community/community_feed_providers.dart';
import '../domain/gamification_providers.dart';
import '../domain/match_history/athlete_match_history_providers.dart';
import '../domain/sand_rank/sand_rank_providers.dart';
import 'daily_mission_navigation.dart';
import 'widgets/athlete_home/athlete_home_community_section.dart';
import 'widgets/athlete_home/athlete_home_competitions_section.dart';
import 'widgets/athlete_home/athlete_home_daily_missions_section.dart';
import 'widgets/athlete_home/athlete_home_evolution_chart.dart';
import 'widgets/athlete_home/athlete_home_focus_button.dart';
import 'widgets/athlete_home/athlete_home_header.dart';
import 'widgets/athlete_home/athlete_home_kpi_grid.dart';
import 'widgets/athlete_home/athlete_home_next_reservation_card.dart';
import 'widgets/athlete_home/athlete_home_registration_tracker.dart';
import 'widgets/athlete_home/athlete_home_shortcuts_grid.dart';

/// Aba Início do atleta — mesmo padrão de layout do painel do portal web no
/// mobile: meus torneios (quando ativa, em destaque no topo) → Modo Focus
/// (no dia do evento) → KPIs → acompanhamento de inscrição → convites de
/// dupla recebidos → convites enviados por mim → competições → próxima
/// reserva → evolução → comunidade → missões → atalhos.
class AthleteHomePage extends ConsumerWidget {
  const AthleteHomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Único watch de topo: é o gate do NexaAsyncView (skeleton/erro/dados).
    // Os demais providers da página são lidos dentro de Consumers por
    // seção — assim uma emissão de notificações/reservas/missões/etc. não
    // reconstrói a CustomScrollView inteira (~15 seções, gráfico, carrossel
    // de imagens) a cada tick, inclusive durante o gesto de scroll.
    final summaryAsync = ref.watch(gamificationSummaryProvider);

    return SafeArea(
      top: false,
      bottom: false,
      child: ColoredBox(
        color: context.themeColors.canvas,
        child: NexaAsyncView(
          value: summaryAsync,
          onRetry: () => ref.invalidate(gamificationSummaryProvider),
          skeleton: const _AthleteHomeSkeleton(),
          data: (summary) {
            final bottomClearance =
                nexaBottomNavBarHeight() +
                MediaQuery.viewPaddingOf(context).bottom +
                16;

            return CustomScrollView(
              controller: ref
                  .watch(athleteShellScrollRegistryProvider)
                  .controllerFor(0),
              slivers: [
                NexaFloatingHeaderSliver(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.screenH,
                  ),
                  child: Consumer(
                    builder: (context, ref, _) {
                      final profile =
                          ref.watch(athleteProfileProvider).valueOrNull;
                      final name = profile != null
                          ? athleteDisplayName(profile)
                          : 'Atleta';
                      final unreadNotifications = ref.watch(
                        athleteUnreadNotificationsCountProvider,
                      );
                      return AthleteHomeHeader(
                        displayName: name,
                        avatarUrl: profile?.avatarUrl,
                        summary: summary,
                        onAvatarTap: () =>
                            context.pushNamed(AppRouteNames.athleteProfile),
                        onXpTap: () =>
                            context.pushNamed(AppRouteNames.athleteQuest),
                        unreadNotificationCount: unreadNotifications,
                        onNotificationsTap: () => context.pushNamed(
                          AppRouteNames.athleteNotifications,
                        ),
                        sandRankEnabled:
                            ref.watch(sandRankEnabledProvider).valueOrNull ??
                                false,
                        sandRankFrameId: ref
                            .watch(sandRankCosmeticsProvider)
                            .valueOrNull
                            ?.frameId,
                      );
                    },
                  ),
                ),
                SliverPadding(
                  padding: EdgeInsets.only(bottom: bottomClearance),
                  sliver: SliverList.list(
                    children: [
                      const SizedBox(height: AppSpacing.lg),
                      const Padding(
                        padding: EdgeInsets.symmetric(
                          horizontal: AppSpacing.screenH,
                        ),
                        child: MyTournamentsHomeSection(),
                      ),
                      const AthleteHomeFocusButton(),
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.screenH,
                        ),
                        child: Consumer(
                          builder: (context, ref, _) {
                            final matches = ref
                                    .watch(
                                      currentAthleteMatchHistoryBundleProvider,
                                    )
                                    .valueOrNull
                                    ?.matches ??
                                const [];
                            final ranking = ref
                                .watch(competeHubUserRankingProvider)
                                .valueOrNull;
                            final kpis = buildAthleteHomeKpis(
                              matches: matches,
                              gamification: summary,
                              ranking: ranking,
                              now: DateTime.now(),
                            );
                            return AthleteHomeKpiGrid(kpis: kpis);
                          },
                        ),
                      ),
                      const Padding(
                        padding: EdgeInsets.symmetric(
                          horizontal: AppSpacing.screenH,
                        ),
                        child: _HomeRegistrationTrackerSection(),
                      ),
                      // Convites recebidos ainda pendentes — o atleta precisa
                      // responder. Espelha o card "Convites de dupla" da web,
                      // que fica logo após o tracker de inscrição.
                      Consumer(
                        builder: (context, ref, _) {
                          final hasReceivedInvites = (ref
                                      .watch(
                                        pendingTournamentPartnerInvitesProvider,
                                      )
                                      .valueOrNull ??
                                  const [])
                              .isNotEmpty;
                          if (!hasReceivedInvites) {
                            return const SizedBox.shrink();
                          }
                          return const Padding(
                            padding: EdgeInsets.fromLTRB(
                              AppSpacing.screenH,
                              AppSpacing.sectionGap,
                              AppSpacing.screenH,
                              0,
                            ),
                            child: PendingTournamentInviteeInvitesSection(),
                          );
                        },
                      ),
                      // Convites enviados por mim (aguardando parceiro ou
                      // pagamento pendente) — só ocupam espaço quando
                      // existem, senão o gap soma com o das competições e
                      // vira buraco.
                      Consumer(
                        builder: (context, ref, _) {
                          final hasInvites = (ref
                                      .watch(
                                        ongoingTournamentPartnerInvitesHomeProvider,
                                      )
                                      .valueOrNull ??
                                  const [])
                              .isNotEmpty;
                          if (!hasInvites) return const SizedBox.shrink();
                          return const Padding(
                            padding: EdgeInsets.fromLTRB(
                              AppSpacing.screenH,
                              AppSpacing.sectionGap,
                              AppSpacing.screenH,
                              0,
                            ),
                            child: PendingTournamentInviterInvitesSection(),
                          );
                        },
                      ),
                      const SizedBox(height: AppSpacing.sectionGap),
                      const AthleteHomeCompetitionsSection(),
                      const SizedBox(height: AppSpacing.sectionGap),
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.screenH,
                        ),
                        child: Consumer(
                          builder: (context, ref, _) {
                            final bookings =
                                ref.watch(myBookingsStreamProvider).valueOrNull ??
                                    [];
                            final now = DateTime.now();
                            final nextBooking = findNextAthleteBooking(
                              bookings,
                              now: now,
                            );
                            return AthleteHomeNextReservationCard(
                              booking: nextBooking,
                              now: now,
                              onDetailsTap: () =>
                                  context.pushNamed(AppRouteNames.myBookings),
                              onReserveTap: () =>
                                  _goToTab(ref, athleteShellReservarTabIndex),
                            );
                          },
                        ),
                      ),
                      const SizedBox(height: AppSpacing.sectionGap),
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.screenH,
                        ),
                        child: Consumer(
                          builder: (context, ref, _) {
                            final matches = ref
                                    .watch(
                                      currentAthleteMatchHistoryBundleProvider,
                                    )
                                    .valueOrNull
                                    ?.matches ??
                                const [];
                            final evolution = buildAthleteEvolutionSeries(
                              matches: matches,
                              now: DateTime.now(),
                            );
                            return AthleteHomeEvolutionChart(
                              series: evolution,
                            );
                          },
                        ),
                      ),
                      const SizedBox(height: AppSpacing.sectionGap),
                      // Mesmo racional dos convites: comunidade vazia não
                      // deixa gap duplo entre evolução e missões.
                      Consumer(
                        builder: (context, ref, _) {
                          final hasCommunityItems = (ref
                                      .watch(communityFeedProvider)
                                      .valueOrNull ??
                                  const [])
                              .isNotEmpty;
                          if (!hasCommunityItems) {
                            return const SizedBox.shrink();
                          }
                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: AppSpacing.screenH,
                                ),
                                child: AthleteHomeCommunitySection(
                                  onViewAll: () => _goToTab(
                                    ref,
                                    athleteShellCommunityTabIndex,
                                  ),
                                ),
                              ),
                              const SizedBox(height: AppSpacing.sectionGap),
                            ],
                          );
                        },
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.screenH,
                        ),
                        child: Consumer(
                          builder: (context, ref, _) {
                            final missions =
                                ref.watch(dailyMissionsProvider).valueOrNull;
                            return AthleteHomeDailyMissionsSection(
                              missions: missions,
                              onViewAll: () => context.pushNamed(
                                AppRouteNames.athleteQuest,
                              ),
                              onMissionTap: (mission) =>
                                  navigateForDailyMission(
                                context,
                                ref,
                                mission,
                              ),
                            );
                          },
                        ),
                      ),
                      const SizedBox(height: AppSpacing.sectionGap),
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.screenH,
                        ),
                        child: AthleteHomeShortcutsGrid(
                          onReserveTap: () =>
                              _goToTab(ref, athleteShellReservarTabIndex),
                          onCompeteTap: () =>
                              _goToTab(ref, athleteShellCompeteTabIndex),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  static void _goToTab(WidgetRef ref, int index) {
    ref.read(athleteShellTabIndexProvider.notifier).state = index;
  }
}

/// Tracker de inscrições em andamento — some quando não há nada pendente.
/// O espaçamento da seção mora aqui pra lista vazia não deixar buraco.
class _HomeRegistrationTrackerSection extends ConsumerStatefulWidget {
  const _HomeRegistrationTrackerSection();

  @override
  ConsumerState<_HomeRegistrationTrackerSection> createState() =>
      _HomeRegistrationTrackerSectionState();
}

class _HomeRegistrationTrackerSectionState
    extends ConsumerState<_HomeRegistrationTrackerSection> {
  bool _cancelling = false;

  void _continueRegistration(RegistrationProgress item) {
    context.pushNamed(
      AppRouteNames.tournamentRegistration,
      pathParameters: {'tournamentId': item.tournamentId},
      queryParameters: registrationProgressResumeParams(item),
    );
  }

  /// Só chega aqui item com `canCancel` (nenhum pagamento); o backend
  /// revalida e recusa paga/meio-paga.
  Future<void> _cancelRegistration(RegistrationProgress item) async {
    if (_cancelling) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancelar inscrição?'),
        content: Text(
          'Sua vaga no ${item.tournamentName} (${item.categoryName}) será '
          'liberada e outro atleta poderá se inscrever.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Cancelar inscrição'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _cancelling = true);
    try {
      await ref
          .read(tournamentPartnerInviteServiceProvider)
          .cancelRegistration(item.registrationId);
      if (!mounted) return;
      showAppSnackBar(context, 'Inscrição cancelada.');
      ref.invalidate(myTournamentRegistrationsProvider);
      ref.invalidate(athleteHomeInProgressRegistrationsProvider);
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = ref
            .watch(athleteHomeInProgressRegistrationsProvider)
            .valueOrNull ??
        const <RegistrationProgress>[];
    if (items.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sectionGap),
      child: AthleteHomeRegistrationTracker(
        items: items,
        onContinue: _continueRegistration,
        onCancel: _cancelRegistration,
      ),
    );
  }
}

class _AthleteHomeSkeleton extends StatelessWidget {
  const _AthleteHomeSkeleton();

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          MediaQuery.paddingOf(context).top,
          AppSpacing.screenH,
          0,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            SizedBox(height: AppSpacing.lg),
            NexaSkeleton(width: 160, height: 20),
            SizedBox(height: AppSpacing.lg),
            Row(
              children: [
                Expanded(child: NexaSkeleton(height: 96, radius: AppRadii.lgAll)),
                SizedBox(width: AppSpacing.md),
                Expanded(child: NexaSkeleton(height: 96, radius: AppRadii.lgAll)),
              ],
            ),
            SizedBox(height: AppSpacing.md),
            Row(
              children: [
                Expanded(child: NexaSkeleton(height: 96, radius: AppRadii.lgAll)),
                SizedBox(width: AppSpacing.md),
                Expanded(child: NexaSkeleton(height: 96, radius: AppRadii.lgAll)),
              ],
            ),
            SizedBox(height: AppSpacing.sectionGap),
            NexaSkeleton(width: 200, height: 16),
            SizedBox(height: AppSpacing.md),
            NexaSkeleton(height: 148, radius: AppRadii.lgAll),
          ],
        ),
      ),
    );
  }
}
