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
import '../../../core/ui/trailing_gap_if_visible.dart';
import '../../../core/ui/nexa_skeleton.dart';
import '../../arenas/domain/booking_story.dart';
import '../../arenas/domain/my_booking_item.dart';
import '../../arenas/domain/my_bookings_providers.dart';
import '../../arenas/presentation/booking_story_page.dart';
import '../../cashback/presentation/widgets/cashback_balance_pill.dart';
import '../../store/application/store_providers.dart';
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
import '../../home_banners/presentation/widgets/home_news_section.dart';
import '../../messages/application/messages_providers.dart';
import '../domain/athlete_booking_helpers.dart';
import '../domain/athlete_display_name.dart';
import '../domain/athlete_home_taglines.dart';
import '../domain/athlete_home_dashboard_logic.dart';
import '../domain/athlete_home_registration_progress_providers.dart';
import '../domain/athlete_notifications_providers.dart';
import '../domain/athlete_profile_providers.dart';
import '../domain/athlete_shell_providers.dart';
import '../domain/booking_invite_providers.dart';
import '../domain/booking_played_today.dart';
import '../domain/community/community_feed_providers.dart';
import '../domain/gamification_providers.dart';
import '../domain/sand_rank/sand_rank_providers.dart';
import '../domain/match_history/athlete_match_history_providers.dart';
import 'booking_details_page.dart';
import 'daily_mission_navigation.dart';
import 'widgets/athlete_home/athlete_account_sheet.dart';
import 'widgets/athlete_home/athlete_home_tour.dart';
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
                        // Piada do esporte do atleta, uma por dia.
                        tagline: athleteHomeTaglineFor(
                          sport: profile?.primarySportFirestoreId ??
                              profile?.sport,
                          now: DateTime.now(),
                          seed: profile?.id ?? '',
                        ),
                        // O avatar não está no mockup, mas é a ÚNICA entrada
                        // para o perfil e os ajustes em todas as cinco abas — a grade de
                        // atalhos já não é renderizada. Sem ele o atleta fica
                        // sem caminho para o próprio cadastro.
                        leading: AthleteHomeTourAnchor(
                          target: AthleteHomeTourTarget.account,
                          child: _HeroAvatar(
                          initials: profile != null
                              ? athleteInitials(profile)
                              : '?',
                          imageUrl: profile?.avatarUrl,
                          sandRankEnabled:
                              ref.watch(sandRankEnabledProvider).valueOrNull ??
                              false,
                          sandRankFrameId: ref
                              .watch(sandRankCosmeticsProvider)
                              .valueOrNull
                              ?.frameId,
                          ),
                        ),
                        // Menu da conta: perfil, configurações e trocar papel
                        // (igual ao avatar do Professor). Avatar e saudação
                        // são um alvo só, com a seta ⌄ dizendo que abre menu.
                        onIdentityTap: () => openAthleteAccountMenu(context, ref),
                        identitySemanticLabel: athleteAccountMenuSemanticLabel,
                        // A primeira seção sobe para cima da arte: a caixa do
                        // hero encolhe, a pintura não.
                        bleedBelow: _heroOverlap,
                        topRight: _HeroActions(
                          unreadNotifications: unreadNotifications,
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
                      // Cards dinâmicos (convites, avaliações, próximo treino,
                      // próxima reserva): 12 entre eles; o grupo fecha com o
                      // respiro de seção só quando algum aparece.
                      TrailingGapIfVisible(
                        gap: AppSpacing.sectionGap - _dynamicCardGap,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
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
                                      _dynamicCardGap,
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
                                      _dynamicCardGap,
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
                                      _dynamicCardGap,
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
                                      _dynamicCardGap,
                                    ),
                                    child: PendingTournamentInviterInvitesSection(),
                                  );
                                },
                              ),
                              // Próximo treino com o professor (aula da turma ou
                              // particular): hora marcada, como os convites acima.
                              // Some para quem não treina com professor.
                              const AthleteTrainingHomeEntry(bottomGap: _dynamicCardGap),
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
                                      _dynamicCardGap,
                                    ),
                                    child: AthleteHomeNextReservationCard(
                                      key: const Key('home-next-booking'),
                                      booking: nextBooking,
                                      now: now,
                                      // Compacto na Início; a seta expande.
                                      initiallyExpanded: false,
                                      onDetailsTap: () => _openBookingDetails(
                                        context,
                                        nextBooking,
                                      ),
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
                          ],
                        ),
                      ),
                      // Atalhos abaixo do que é dinâmico.
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
                      // Novidades do app (backoffice): segundo assunto da
                      // Home, logo abaixo dos atalhos. Sem novidade, some.
                      const HomeNewsSection(),
                      const AthleteHomeFocusButton(),
                      const AthleteHomeFollowingMatchesSection(),
                      const Padding(
                        padding: EdgeInsets.symmetric(
                          horizontal: AppSpacing.screenH,
                        ),
                        child: _HomeRegistrationTrackerSection(),
                      ),
                      const AthleteHomeCompetitionsSection(),
                      // Loja: sem card na Home — fica na aba da barra.
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

  /// Detalhes da reserva (tela cheia) — sem passar pela lista de Minhas reservas.
  static void _openBookingDetails(BuildContext context, MyBookingItem booking) {
    final start = parseBookingStartAt(booking);
    if (start == null) {
      context.pushNamed(AppRouteNames.myBookings);
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => BookingDetailsPage(
          bookingId: booking.id,
          arenaId: booking.arenaId,
          arenaName: booking.arenaName,
          courtName: booking.courtName ?? '',
          startAt: start,
          endAt:
              parseBookingEndAt(booking) ?? start.add(const Duration(hours: 1)),
          status: booking.rawStatus,
          confirmedParticipants: booking.confirmedParticipants,
          amountReais: booking.amountReais,
          paymentType: booking.paymentType,
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

/// Espaço entre os cards dinâmicos do topo da Home (convites, treino,
/// reserva) — mais justo que o respiro entre seções.
const double _dynamicCardGap = AppSpacing.md;

/// Quanto a primeira seção da home sobe para cima da arte do hero.
const double _heroOverlap = 56;

/// Primeiro nome do atleta, mesma regra que o header antigo usava.
String _firstName(String displayName) {
  final parts = displayName.trim().split(RegExp(r'\s+'));
  if (parts.isEmpty || parts.first.isEmpty) return 'Atleta';
  return parts.first;
}

/// Mensagens com os professores (fase 7) e sino numa cápsula só, com um
/// divisor fino no meio: colados, ocupam menos que dois botões soltos e o
/// alvo de cada um continua de 40×42.
///
/// Fundo preto translúcido em vez de `surfaceRaised`: a cápsula cai sobre a
/// parte mais clara da arte (medi p95 164 no masculino) e no tema claro uma
/// superfície de tema clarearia ainda mais.
class _HeroActions extends ConsumerWidget {
  const _HeroActions({required this.unreadNotifications});

  final int unreadNotifications;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unreadMessages = ref.watch(unreadMessagesCountProvider);
    return Material(
      color: AppColors.black.withValues(alpha: 0.45),
      shape: StadiumBorder(
        side: BorderSide(color: AppColors.white.withValues(alpha: 0.14)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _HeroActionButton(
            key: const Key('athlete-home-messages'),
            icon: Icons.chat_bubble_outline_rounded,
            iconSize: 20,
            semanticLabel: 'Mensagens',
            unreadCount: unreadMessages,
            onTap: () => context.pushNamed(AppRouteNames.athleteMessages),
          ),
          Container(
            width: 1,
            height: 20,
            color: AppColors.white.withValues(alpha: 0.14),
          ),
          AthleteHomeTourAnchor(
            target: AthleteHomeTourTarget.notifications,
            child: _HeroActionButton(
              key: const Key('athlete-home-notifications'),
              icon: Icons.notifications_outlined,
              iconSize: 22,
              semanticLabel: 'Notificações',
              unreadCount: unreadNotifications,
              onTap: () =>
                  context.pushNamed(AppRouteNames.athleteNotifications),
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroActionButton extends StatelessWidget {
  const _HeroActionButton({
    super.key,
    required this.icon,
    required this.iconSize,
    required this.semanticLabel,
    required this.unreadCount,
    required this.onTap,
  });

  final IconData icon;
  final double iconSize;
  final String semanticLabel;
  final int unreadCount;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // O badge fica no canto de cima, montado na borda da cápsula: dentro dela
    // ele cobria o ícone — era assim no header antigo e com duas casas
    // ficava ilegível.
    return InkWell(
      onTap: onTap,
      customBorder: const StadiumBorder(),
      child: SizedBox(
        width: 40,
        height: 42,
        child: Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.center,
          children: [
            Icon(
              icon,
              size: iconSize,
              color: AppColors.white,
              semanticLabel: semanticLabel,
            ),
            if (unreadCount > 0)
              Positioned(
                right: 0,
                top: -6,
                child: _HeroNotificationBadge(count: unreadCount),
              ),
          ],
        ),
      ),
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
                  // Só o "30/100" não dizia pra onde a pílula levava.
                  const SizedBox(width: 6),
                  Text(
                    'Desafios',
                    style: AppTypography.bodyS.copyWith(
                      color: AppColors.white.withValues(alpha: 0.72),
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(width: 2),
                  Icon(
                    Icons.chevron_right_rounded,
                    size: 16,
                    color: AppColors.white.withValues(alpha: 0.72),
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

/// Avatar do hero, com a moldura do Sand Rank quando ele está ligado. Sem o
/// escudo de nível no canto (pedido do dono): o nível já aparece no perfil e
/// na pílula de XP. O toque é do hero ([AthleteHomeHero.onIdentityTap]):
/// avatar e nome abrem o menu da conta juntos.
class _HeroAvatar extends StatelessWidget {
  const _HeroAvatar({
    required this.initials,
    required this.sandRankEnabled,
    this.imageUrl,
    this.sandRankFrameId,
  });

  static const double _avatarSize = 48;

  final String initials;
  final String? imageUrl;
  final bool sandRankEnabled;
  final String? sandRankFrameId;

  @override
  Widget build(BuildContext context) {
    final avatar = AthleteProfileAvatar(
      size: _avatarSize,
      initials: initials,
      imageUrl: imageUrl,
    );
    return KeyedSubtree(
      key: const Key('athlete-home-avatar'),
      child: sandRankEnabled
          ? SandRankAvatarFrame(
              frameId: sandRankFrameId,
              size: _avatarSize,
              child: avatar,
            )
          : avatar,
    );
  }
}

