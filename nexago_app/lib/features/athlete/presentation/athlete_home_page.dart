import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_bottom_nav_bar.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_motion.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/nexa_async_view.dart';
import '../../../core/ui/nexa_skeleton.dart';
import '../../arenas/domain/booking_story.dart';
import '../../arenas/domain/my_bookings_providers.dart';
import '../../arenas/presentation/booking_story_page.dart';
import '../../cashback/presentation/widgets/cashback_balance_pill.dart';
import '../../store/application/store_providers.dart';
import '../../store/presentation/widgets/store_home_entry.dart';
import '../../tournaments/data/my_tournament_registrations_repository.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart';
import '../../tournaments/domain/registration_progress_logic.dart';
import '../../tournaments/domain/tournament_partner_invite_providers.dart';
import '../../tournaments/domain/tournament_review_providers.dart';
import '../../tournaments/domain/tournament_registration_navigation.dart';
import '../../tournaments/presentation/widgets/my_tournaments_home_section.dart';
import '../../tournaments/presentation/widgets/pending_tournament_invitee_invites_section.dart';
import '../../tournaments/presentation/widgets/pending_tournament_inviter_invites_section.dart';
import '../../tournaments/presentation/widgets/pending_tournament_reviews_section.dart';
import '../../athlete_training/presentation/widgets/athlete_training_home_entry.dart';
import '../../messages/application/messages_providers.dart';
import '../domain/athlete_booking_helpers.dart';
import '../domain/athlete_display_name.dart';
import '../domain/athlete_home_dashboard_logic.dart';
import '../domain/athlete_home_registration_progress_providers.dart';
import '../domain/athlete_notifications_providers.dart';
import '../domain/athlete_quest/athlete_quest_logic.dart';
import '../domain/athlete_profile_providers.dart';
import '../domain/athlete_shell_providers.dart';
import '../domain/booking_invite_providers.dart';
import '../domain/community/community_feed_providers.dart';
import '../domain/gamification_models.dart';
import '../domain/gamification_providers.dart';
import '../domain/sand_rank/sand_rank_catalog.dart';
import '../domain/sand_rank/sand_rank_providers.dart';
import '../domain/match_history/athlete_match_history_providers.dart';
import 'daily_mission_navigation.dart';
import 'widgets/athlete_home/athlete_account_sheet.dart';
import 'widgets/athlete_home/athlete_home_community_section.dart';
import 'widgets/athlete_home/athlete_home_competitions_section.dart';
import 'widgets/athlete_home/athlete_home_daily_missions_section.dart';
import 'widgets/athlete_home/athlete_home_evolution_chart.dart';
import 'widgets/athlete_home/athlete_home_focus_button.dart';
import 'widgets/athlete_home/athlete_home_following_matches_section.dart';
import 'widgets/athlete_home/athlete_home_hero.dart';
import 'widgets/athlete_profile_avatar.dart';
import 'widgets/pending_booking_invites_section.dart';
import 'sand_rank/widgets/sand_rank_avatar_frame.dart';
import 'sand_rank/widgets/sand_rank_emblem.dart';
import 'widgets/athlete_home/athlete_home_next_reservation_card.dart';
import 'widgets/athlete_home/athlete_home_registration_tracker.dart';
import 'widgets/athlete_home/athlete_home_shortcuts_grid.dart';

/// Aba Início do atleta — convites de dupla recebidos aparecem primeiro,
/// logo após o header (pedido do dono, 27/08); em seguida convites enviados
/// por mim (aguardando parceiro) e o próximo treino com professor. Depois o
/// mesmo padrão de layout do painel
/// do portal web no mobile: meus torneios (quando ativa, em destaque no
/// topo) → Modo Focus (no dia do evento) → KPIs → acompanhamento de
/// inscrição → competições → próxima reserva → evolução → comunidade →
/// missões → atalhos.
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
                nexaBottomNavBarHeight(context) +
                MediaQuery.viewPaddingOf(context).bottom +
                16;

            return CustomScrollView(
              controller: ref
                  .watch(athleteShellScrollRegistryProvider)
                  .controllerFor(0),
              slivers: [
                // O hero sangra até o topo e rola junto com o conteúdo, fora
                // do NexaPageHeader: ele aplicaria o recorte da
                // barra de status uma segunda vez (o hero já soma o seu) e
                // faria a arte voltar inteira a cada rolagem para cima.
                SliverToBoxAdapter(
                  child: Consumer(
                    builder: (context, ref, _) {
                      final profile = ref
                          .watch(athleteProfileProvider)
                          .valueOrNull;
                      final unreadNotifications = ref.watch(
                        athleteUnreadNotificationsCountProvider,
                      );
                      return AthleteHomeHero(
                        name: _firstName(
                          profile != null
                              ? athleteDisplayName(profile)
                              : 'Atleta',
                        ),
                        gender: profile?.gender,
                        sport:
                            profile?.primarySportFirestoreId ?? profile?.sport,
                        tagline: 'O esporte conecta.',
                        // O avatar não está no mockup, mas é a ÚNICA entrada
                        // para o perfil e os ajustes em todas as cinco abas — a grade de
                        // atalhos já não é renderizada. Sem ele o atleta fica
                        // sem caminho para o próprio cadastro.
                        leading: _HeroAvatar(
                          initials: profile != null
                              ? athleteInitials(profile)
                              : '?',
                          imageUrl: profile?.avatarUrl,
                          summary: summary,
                          sandRankEnabled:
                              ref.watch(sandRankEnabledProvider).valueOrNull ??
                              false,
                          sandRankFrameId: ref
                              .watch(sandRankCosmeticsProvider)
                              .valueOrNull
                              ?.frameId,
                          // Menu da conta: perfil, configurações e
                          // trocar papel (igual ao avatar do Professor).
                          onTap: () => openAthleteAccountMenu(context, ref),
                        ),
                        // A primeira seção sobe para cima da arte: a caixa do
                        // hero encolhe, a pintura não.
                        bleedBelow: _heroOverlap,
                        topRight: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            // Conversas com os professores (fase 7).
                            const _HeroMessages(),
                            const SizedBox(width: 8),
                            _HeroBell(
                              unreadCount: unreadNotifications,
                              onTap: () => context.pushNamed(
                                AppRouteNames.athleteNotifications,
                              ),
                            ),
                          ],
                        ),
                        // Pílula do cashback à esquerda da de XP; o encaixe
                        // some sozinho com o recurso desligado ou sem saldo.
                        bottomRight: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const CashbackHeroPillSlot(),
                            _HeroXpPill(
                              current: summary.xpInCurrentLevel,
                              goal: 100,
                              onTap: () =>
                                  context.pushNamed(AppRouteNames.athleteQuest),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
                SliverPadding(
                  padding: EdgeInsets.only(bottom: bottomClearance),
                  sliver: SliverList.list(
                    children: [
                      // Convites para jogar numa reserva (recebidos e sem
                      // resposta): o jogo tem hora marcada, então vêm antes
                      // dos convites de dupla.
                      Consumer(
                        builder: (context, ref, _) {
                          final hasBookingInvites =
                              (ref
                                          .watch(pendingBookingInvitesProvider)
                                          .valueOrNull ??
                                      const [])
                                  .isNotEmpty;
                          if (!hasBookingInvites) {
                            return const SizedBox.shrink();
                          }
                          return const Padding(
                            padding: EdgeInsets.fromLTRB(
                              AppSpacing.screenH,
                              0,
                              AppSpacing.screenH,
                              AppSpacing.sectionGap,
                            ),
                            child: PendingBookingInvitesSection(),
                          );
                        },
                      ),
                      // Convites recebidos ainda pendentes — o atleta precisa
                      // responder. Aparecem primeiro na home, logo após o
                      // header, à frente até de "meus torneios".
                      Consumer(
                        builder: (context, ref, _) {
                          final hasReceivedInvites =
                              (ref
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
                              0,
                              AppSpacing.screenH,
                              AppSpacing.sectionGap,
                            ),
                            child: PendingTournamentInviteeInvitesSection(),
                          );
                        },
                      ),
                      // Torneios esperando avaliação — perto dos convites recebidos: é a
                      // outra coisa que só o atleta pode responder.
                      Consumer(
                        builder: (context, ref, _) {
                          final hasPendingReviews =
                              (ref
                                          .watch(
                                            pendingTournamentReviewsProvider,
                                          )
                                          .valueOrNull ??
                                      const [])
                                  .isNotEmpty;
                          if (!hasPendingReviews)
                            return const SizedBox.shrink();
                          return const Padding(
                            padding: EdgeInsets.fromLTRB(
                              AppSpacing.screenH,
                              0,
                              AppSpacing.screenH,
                              AppSpacing.sectionGap,
                            ),
                            child: PendingTournamentReviewsSection(),
                          );
                        },
                      ),
                      // Convites enviados por mim (aguardando parceiro ou
                      // pagamento pendente) — logo abaixo dos recebidos,
                      // sempre no topo quando existem.
                      Consumer(
                        builder: (context, ref, _) {
                          final hasInvites =
                              (ref
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
                              0,
                              AppSpacing.screenH,
                              AppSpacing.sectionGap,
                            ),
                            child: PendingTournamentInviterInvitesSection(),
                          );
                        },
                      ),
                      // Próximo treino com o professor (aula da turma ou
                      // particular): hora marcada, como os convites acima.
                      // Some para quem não treina com professor.
                      const AthleteTrainingHomeEntry(),
                      // const Padding(
                      //   padding: EdgeInsets.symmetric(
                      //     horizontal: AppSpacing.screenH,
                      //   ),
                      //   child: MyTournamentsHomeSection(),
                      // ),
                      // Atalhos (Reservar, Ranking, Treinos, Meus torneios, Squad) abaixo
                      // do que é dinâmico — convites, próximo treino e meus
                      // torneios vêm primeiro.
                      // Próxima reserva: sem reserva (ou carregando) não
                      // aparece nem deixa vão — o atalho Reservar já cobre.
                      Consumer(
                        builder: (context, ref, _) {
                          final bookings =
                              ref.watch(myBookingsStreamProvider).valueOrNull ??
                              [];
                          final now = DateTime.now();
                          final nextBooking = findNextAthleteBooking(
                            bookings,
                            now: now,
                          );
                          if (nextBooking == null) {
                            return const SizedBox.shrink();
                          }
                          return Padding(
                            padding: const EdgeInsets.fromLTRB(
                              AppSpacing.screenH,
                              0,
                              AppSpacing.screenH,
                              AppSpacing.sectionGap,
                            ),
                            child: AthleteHomeNextReservationCard(
                              key: const Key('home-next-booking'),
                              booking: nextBooking,
                              now: now,
                              // Compacto na Início; a seta expande.
                              initiallyExpanded: false,
                              onDetailsTap: () =>
                                  context.pushNamed(AppRouteNames.myBookings),
                              onReserveTap: () =>
                                  _goToTab(ref, athleteShellReservarTabIndex),
                              onStoryTap:
                                  isBookingStoryShareable(nextBooking.rawStatus)
                                  ? () => openBookingStory(
                                      context,
                                      BookingStoryArgs.fromBooking(nextBooking),
                                    )
                                  : null,
                            ),
                          );
                        },
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(
                          AppSpacing.screenH,
                          0,
                          AppSpacing.screenH,
                          AppSpacing.sectionGap,
                        ),
                        child: AthleteHomeShortcutsGrid(
                          onReserveTap: () =>
                              _goToTab(ref, athleteShellReservarTabIndex),
                        ),
                      ),
                      const AthleteHomeFocusButton(),
                      const AthleteHomeFollowingMatchesSection(),
                      const Padding(
                        padding: EdgeInsets.symmetric(
                          horizontal: AppSpacing.screenH,
                        ),
                        child: _HomeRegistrationTrackerSection(),
                      ),
                      const AthleteHomeCompetitionsSection(),
                      // Atalho da Loja: só com appConfig/store.enabled; traz o
                      // próprio respiro de baixo (desligado não deixa vão).
                      StoreHomeEntry(
                        onTap: () => _goToTab(ref, athleteShellStoreTabIndex),
                      ),
                      // NexaSquad: na Home, só o atalho da linha de atalhos
                      // (o card segue no perfil).
                      // Evolução só quando há histórico de partidas — evita
                      // card vazio para quem ainda não jogou.
                      Consumer(
                        builder: (context, ref, _) {
                          final matches =
                              ref
                                  .watch(
                                    currentAthleteMatchHistoryBundleProvider,
                                  )
                                  .valueOrNull
                                  ?.matches ??
                              const [];
                          if (matches.isEmpty) {
                            return const SizedBox.shrink();
                          }
                          final evolution = buildAthleteEvolutionSeries(
                            matches: matches,
                            now: DateTime.now(),
                          );
                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: AppSpacing.screenH,
                                ),
                                child: AthleteHomeEvolutionChart(
                                  series: evolution,
                                ),
                              ),
                              const SizedBox(height: AppSpacing.sectionGap),
                            ],
                          );
                        },
                      ),
                      // Mesmo racional dos convites: comunidade vazia não
                      // deixa gap duplo entre evolução e missões.
                      // Consumer(
                      //   builder: (context, ref, _) {
                      //     final hasCommunityItems =
                      //         (ref.watch(communityFeedProvider).valueOrNull ??
                      //                 const [])
                      //             .isNotEmpty;
                      //     if (!hasCommunityItems) {
                      //       return const SizedBox.shrink();
                      //     }
                      //     return Column(
                      //       crossAxisAlignment: CrossAxisAlignment.stretch,
                      //       children: [
                      //         Padding(
                      //           padding: const EdgeInsets.symmetric(
                      //             horizontal: AppSpacing.screenH,
                      //           ),
                      //           child: AthleteHomeCommunitySection(
                      //             // Com a Loja na barra, a Comunidade não é
                      //             // mais aba: abre a página própria.
                      //             onViewAll: () =>
                      //                 ref.read(storeEnabledProvider)
                      //                 ? context.pushNamed(
                      //                     AppRouteNames.community,
                      //                   )
                      //                 : _goToTab(
                      //                     ref,
                      //                     athleteShellCommunityTabIndex,
                      //                   ),
                      //           ),
                      //         ),
                      //         const SizedBox(height: AppSpacing.sectionGap),
                      //       ],
                      //     );
                      //   },
                      // ),
                      // Padding(
                      //   padding: const EdgeInsets.symmetric(
                      //     horizontal: AppSpacing.screenH,
                      //   ),
                      //   child: Consumer(
                      //     builder: (context, ref, _) {
                      //       final missions = ref
                      //           .watch(dailyMissionsProvider)
                      //           .valueOrNull;
                      //       return AthleteHomeDailyMissionsSection(
                      //         missions: missions,
                      //         onViewAll: () =>
                      //             context.pushNamed(AppRouteNames.athleteQuest),
                      //         onMissionTap: (mission) =>
                      //             navigateForDailyMission(
                      //               context,
                      //               ref,
                      //               mission,
                      //             ),
                      //       );
                      //     },
                      //   ),
                      // ),
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
    final items =
        ref.watch(athleteHomeInProgressRegistrationsProvider).valueOrNull ??
        const <RegistrationProgress>[];
    if (items.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sectionGap),
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
                Expanded(
                  child: NexaSkeleton(height: 96, radius: AppRadii.lgAll),
                ),
                SizedBox(width: AppSpacing.md),
                Expanded(
                  child: NexaSkeleton(height: 96, radius: AppRadii.lgAll),
                ),
              ],
            ),
            SizedBox(height: AppSpacing.md),
            Row(
              children: [
                Expanded(
                  child: NexaSkeleton(height: 96, radius: AppRadii.lgAll),
                ),
                SizedBox(width: AppSpacing.md),
                Expanded(
                  child: NexaSkeleton(height: 96, radius: AppRadii.lgAll),
                ),
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

/// Quanto a primeira seção da home sobe para cima da arte do hero.
const double _heroOverlap = 56;

/// Primeiro nome do atleta, mesma regra que o header antigo usava.
String _firstName(String displayName) {
  final parts = displayName.trim().split(RegExp(r'\s+'));
  if (parts.isEmpty || parts.first.isEmpty) return 'Atleta';
  return parts.first;
}

/// Sino do hero. Fundo preto translúcido em vez de `surfaceRaised`: ele cai
/// sobre a parte mais clara da arte (medi p95 164 no masculino) e no tema
/// claro uma superfície de tema clarearia ainda mais.
/// Mensagens com os professores, ao lado do sino — mesmo desenho, com o
/// contador de não lidas.
class _HeroMessages extends ConsumerWidget {
  const _HeroMessages();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(unreadMessagesCountProvider);
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Material(
          color: AppColors.black.withValues(alpha: 0.45),
          borderRadius: AppRadii.mdAll,
          child: InkWell(
            key: const Key('athlete-home-messages'),
            onTap: () => context.pushNamed(AppRouteNames.athleteMessages),
            borderRadius: AppRadii.mdAll,
            child: Container(
              width: 42,
              height: 42,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                borderRadius: AppRadii.mdAll,
                border: Border.all(
                  color: AppColors.white.withValues(alpha: 0.14),
                ),
              ),
              child: const Icon(
                Icons.chat_bubble_outline_rounded,
                size: 20,
                color: AppColors.white,
                semanticLabel: 'Mensagens',
              ),
            ),
          ),
        ),
        if (unread > 0)
          Positioned(
            right: -5,
            top: -5,
            child: _HeroNotificationBadge(count: unread),
          ),
      ],
    );
  }
}

class _HeroBell extends StatelessWidget {
  const _HeroBell({required this.unreadCount, required this.onTap});

  final int unreadCount;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // O badge fica FORA da cápsula, no canto. Dentro dela ele cobria o
    // sino — era assim no header antigo (right: 4 / top: 4 sobre um ícone
    // de 22 centralizado em 40x40) e com duas casas ficava ilegível.
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Material(
          color: AppColors.black.withValues(alpha: 0.45),
          borderRadius: AppRadii.mdAll,
          child: InkWell(
            onTap: onTap,
            borderRadius: AppRadii.mdAll,
            child: Container(
              width: 42,
              height: 42,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                borderRadius: AppRadii.mdAll,
                border: Border.all(
                  color: AppColors.white.withValues(alpha: 0.14),
                ),
              ),
              child: const Icon(
                Icons.notifications_outlined,
                size: 22,
                color: AppColors.white,
              ),
            ),
          ),
        ),
        if (unreadCount > 0)
          Positioned(
            right: -5,
            top: -5,
            child: _HeroNotificationBadge(count: unreadCount),
          ),
      ],
    );
  }
}

/// Contador de não lidas — mesmo desenho do header antigo, para o atleta não
/// estranhar a troca.
class _HeroNotificationBadge extends StatelessWidget {
  const _HeroNotificationBadge({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.brand,
        borderRadius: AppRadii.smAll,
        border: Border.all(color: AppColors.black, width: 1.5),
      ),
      child: Text(
        count > 99 ? '99+' : '$count',
        style: const TextStyle(
          color: AppColors.black,
          fontSize: 10,
          fontWeight: FontWeight.w900,
          height: 1,
        ),
      ),
    );
  }
}

/// Pílula de XP do hero — leva aos Desafios, como levava no header.
class _HeroXpPill extends StatefulWidget {
  const _HeroXpPill({
    required this.current,
    required this.goal,
    required this.onTap,
  });

  final int current;
  final int goal;
  final VoidCallback onTap;

  @override
  State<_HeroXpPill> createState() => _HeroXpPillState();
}

class _HeroXpPillState extends State<_HeroXpPill> {
  var _pressed = false;

  void _setPressed(bool value) {
    if (_pressed == value) return;
    setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: 'Ver seus Desafios',
      child: AnimatedScale(
        scale: _pressed ? 0.94 : 1,
        duration: AppMotion.fast,
        curve: AppMotion.curve,
        // No claro o pé da capa é o canvas: a 55% o selo vira cinza médio e
        // o raio laranja some (1,7:1). Mais fechado lá, ele passa de 4:1.
        child: Material(
          color: AppColors.black.withValues(
            alpha: context.themeColors.isDark ? 0.55 : 0.8,
          ),
          borderRadius: AppRadii.pillAll,
          child: InkWell(
            onTap: widget.onTap,
            onHighlightChanged: _setPressed,
            borderRadius: AppRadii.pillAll,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                borderRadius: AppRadii.pillAll,
                border: Border.all(
                  color: AppColors.brand.withValues(alpha: 0.55),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.bolt_rounded,
                    size: 16,
                    color: AppColors.brand,
                  ),
                  const SizedBox(width: 5),
                  Text(
                    '${widget.current}/${widget.goal}',
                    style: AppTypography.titleS.copyWith(
                      color: AppColors.white,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Avatar do hero — leva ao perfil, com moldura e emblema do Sand Rank.
/// Fora do mockup de propósito: sem ele nenhuma das cinco abas leva ao
/// cadastro do atleta.
class _HeroAvatar extends StatelessWidget {
  const _HeroAvatar({
    required this.initials,
    required this.summary,
    required this.sandRankEnabled,
    required this.onTap,
    this.imageUrl,
    this.sandRankFrameId,
  });

  static const double _avatarSize = 48;
  static const double _slotSize = 56;

  final String initials;
  final String? imageUrl;
  final GamificationSummary summary;
  final bool sandRankEnabled;
  final String? sandRankFrameId;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final avatar = AthleteProfileAvatar(
      size: _avatarSize,
      initials: initials,
      imageUrl: imageUrl,
    );
    final step = sandRankStepFromXp(summary.xp);

    return Tooltip(
      message: 'Sua conta',
      child: InkWell(
        key: const Key('athlete-home-avatar'),
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: SizedBox(
          width: _slotSize,
          height: _slotSize,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Positioned(
                left: 0,
                top: 0,
                child: sandRankEnabled
                    ? SandRankAvatarFrame(
                        frameId: sandRankFrameId,
                        size: _avatarSize,
                        child: avatar,
                      )
                    : avatar,
              ),
              Positioned(
                right: 0,
                bottom: 0,
                child: sandRankEnabled
                    ? SandRankEmblem(
                        rankCode: step.rankCode,
                        division: step.division,
                        size: SandRankEmblemSize.badgeCompact,
                      )
                    : _HeroLevelBadge(level: gamificationDisplayLevel(summary)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Nível numérico — fallback de quando o Sand Rank está desligado, mesmo
/// desenho que o header antigo usava.
class _HeroLevelBadge extends StatelessWidget {
  const _HeroLevelBadge({required this.level});

  final int level;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.brand,
        borderRadius: AppRadii.smAll,
        border: Border.all(color: AppColors.black, width: 2),
      ),
      child: Text(
        '$level',
        style: const TextStyle(
          color: AppColors.black,
          fontSize: 10,
          fontWeight: FontWeight.w900,
          letterSpacing: 0.3,
          height: 1,
        ),
      ),
    );
  }
}
