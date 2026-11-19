import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../class_agreements/presentation/widgets/class_agreements_entry_points.dart';
import '../../../core/auth/auth_providers.dart';
import '../../../core/deep_link/app_domains.dart';
import '../../../core/errors/friendly_error_message.dart';
import '../../../core/location/user_location_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../../../core/ui/nexa_share.dart';
import '../../athlete/domain/arena_review_providers.dart';
import '../../athlete/domain/arena_reputation.dart';
import '../../athlete/domain/favorites_providers.dart';
import '../domain/arena_detail_providers.dart';
import '../domain/arena_list_item.dart';
import '../domain/arena_detail_logic.dart';
import '../domain/arena_detail_profile_logic.dart';
import '../domain/arena_booking_cancellation_policy.dart';
import '../domain/arenas_providers.dart';
import '../../athlete/domain/arena_review.dart';
import '../domain/nearby_arenas_logic.dart';
import '../../professor_links/presentation/widgets/arena_professor_link_card.dart';
import '../../professor_links/presentation/widgets/arena_public_professors_section.dart';
import '../../schedule_plans/presentation/widgets/schedule_plans_entry_points.dart';
import 'arena_booking_navigation.dart';
import '../domain/arena_detail_hours_logic.dart';
import '../domain/arena_detail_offers_logic.dart';
import '../domain/slots_page_logic.dart';
import '../../organizer_public_profile/domain/organizer_event.dart';
import 'widgets/arena_detail/arena_detail_agenda.dart';
import 'widgets/arena_detail/arena_detail_amenity_chips.dart';
import 'widgets/arena_detail/arena_detail_anchor_bar.dart';
import 'widgets/arena_detail/arena_detail_events_section.dart';
import 'widgets/arena_detail/arena_detail_hours.dart';
import 'widgets/arena_detail/arena_detail_bottom_cta.dart';
import 'widgets/arena_detail/arena_detail_club_section.dart';
import 'widgets/arena_detail/arena_detail_courts_section.dart';
import 'widgets/arena_detail/arena_detail_hero.dart';
import 'widgets/arena_detail/arena_detail_info_sections.dart';
import 'widgets/arena_detail/arena_detail_promotions.dart';
import 'widgets/arena_detail/arena_detail_metrics_bar.dart';
import 'widgets/arena_detail/arena_detail_other_offers.dart';
import 'widgets/arena_detail/arena_detail_players_count.dart';
import 'widgets/arena_detail/arena_detail_reviews_section.dart';

/// Detalhe da arena (protótipo NexaGO — dark-first).
class ArenaDetailPage extends ConsumerWidget {
  const ArenaDetailPage({
    super.key,
    required this.arenaId,
    this.initialArena,
    this.isBestPrice = false,
  });

  final String arenaId;
  final ArenaListItem? initialArena;
  final bool isBestPrice;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncArena = ref.watch(arenaByIdProvider(arenaId));
    final reputationAsync = ref.watch(arenaReputationProvider(arenaId));
    final todayAsync = ref.watch(arenaDetailTodayCourtsProvider(arenaId));
    final reviewsAsync = ref.watch(arenaReviewsStreamProvider(arenaId));

    return asyncArena.when(
      data: (remote) {
        final arena = remote ?? initialArena;
        if (arena == null) {
          return Scaffold(
            backgroundColor: context.themeColors.canvas,
            body: AppEmptyView(
              icon: Icons.search_off_rounded,
              title: 'Arena não encontrada',
              subtitle:
                  'Este link pode estar desatualizado ou a arena foi removida.',
              actionLabel: 'Voltar',
              onAction: () => context.pop(),
            ),
          );
        }
        // Nenhum card leva ao detalhe de arena pré-cadastrada, mas a rota aceita
        // id por deep link. Sem isso a página abriria com preço, nota e agenda
        // zerados, parecendo arena quebrada.
        if (arena.isUnclaimed) {
          return Scaffold(
            backgroundColor: context.themeColors.canvas,
            body: AppEmptyView(
              icon: Icons.storefront_outlined,
              title: 'Ainda não reserva pela nexaGO',
              subtitle:
                  'Esta arena está na busca para você encontrar e falar com ela, '
                  'mas ainda não aceita reserva pelo app.',
              actionLabel: 'Voltar',
              onAction: () => context.pop(),
            ),
          );
        }
        return FadeSlideIn(
          child: _ArenaDetailBody(
            arena: arena,
            isBestPrice: isBestPrice,
            reputation: reputationAsync.valueOrNull,
            todaySummary: todayAsync.valueOrNull,
            todayLoading: todayAsync.isLoading,
            reviews: reviewsAsync.valueOrNull ?? const [],
            reviewsLoading: reviewsAsync.isLoading,
          ),
        );
      },
      loading: () {
        if (initialArena != null) {
          return FadeSlideIn(
            child: _ArenaDetailBody(
              arena: initialArena!,
              isBestPrice: isBestPrice,
              reputation: reputationAsync.valueOrNull,
              todaySummary: todayAsync.valueOrNull,
              todayLoading: todayAsync.isLoading,
              reviews: reviewsAsync.valueOrNull ?? const [],
              reviewsLoading: reviewsAsync.isLoading,
            ),
          );
        }
        return Scaffold(
          backgroundColor: context.themeColors.canvas,
          body: AppLoadingView(message: 'Carregando detalhes…'),
        );
      },
      error: (e, _) => Scaffold(
        backgroundColor: context.themeColors.canvas,
        body: AppErrorView(
          title: 'Não foi possível carregar',
          message: friendlyErrorMessage(
            e,
            action: 'Não foi possível abrir a arena',
            logReason: 'arena_detail:load',
          ),
          onRetry: () => ref.invalidate(arenaByIdProvider(arenaId)),
        ),
      ),
    );
  }
}

class _ArenaDetailBody extends ConsumerStatefulWidget {
  const _ArenaDetailBody({
    required this.arena,
    required this.isBestPrice,
    required this.reputation,
    required this.todaySummary,
    required this.todayLoading,
    required this.reviews,
    required this.reviewsLoading,
  });

  final ArenaListItem arena;
  final bool isBestPrice;
  final ArenaReputation? reputation;
  final ArenaDetailTodaySummary? todaySummary;
  final bool todayLoading;
  final List<ArenaReview> reviews;
  final bool reviewsLoading;

  @override
  ConsumerState<_ArenaDetailBody> createState() => _ArenaDetailBodyState();
}

class _ArenaDetailBodyState extends ConsumerState<_ArenaDetailBody> {
  bool? _favoriteOverride;
  bool _favoritePending = false;

  /// Dia e horário escolhidos na agenda (a barra de baixo segue isso).
  ArenaDetailAgendaReport? _agenda;

  final ScrollController _scroll = ScrollController();
  final GlobalKey _anchorsKey = GlobalKey();
  final GlobalKey _agendaKey = GlobalKey();
  final GlobalKey _offersKey = GlobalKey();
  final GlobalKey _eventsKey = GlobalKey();
  final GlobalKey _courtsKey = GlobalKey();
  final GlobalKey _plansKey = GlobalKey();
  final GlobalKey _clubKey = GlobalKey();
  final GlobalKey _classesKey = GlobalKey();
  final GlobalKey _infoKey = GlobalKey();
  final GlobalKey _reviewsKey = GlobalKey();

  /// Os atalhos do conteúdo saíram pelo topo: mostra a cópia grudada.
  bool _pinAnchors = false;

  static final _kmFormat = NumberFormat.decimalPattern('pt_BR');

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scroll.removeListener(_onScroll);
    _scroll.dispose();
    super.dispose();
  }

  double get _pinnedTop => MediaQuery.paddingOf(context).top;

  void _onScroll() {
    final box = _anchorsKey.currentContext?.findRenderObject();
    if (box is! RenderBox || !box.attached) return;
    final pin = box.localToGlobal(Offset.zero).dy < _pinnedTop;
    if (pin != _pinAnchors) setState(() => _pinAnchors = pin);
  }

  /// Rola até a seção [key], deixando-a logo abaixo dos atalhos grudados.
  void _scrollTo(GlobalKey key) {
    final box = key.currentContext?.findRenderObject();
    if (box is! RenderBox || !box.attached || !_scroll.hasClients) return;
    final dy = box.localToGlobal(Offset.zero).dy;
    final target = _scroll.offset +
        dy -
        (_pinnedTop + ArenaDetailAnchorBar.height + 8);
    _scroll.animateTo(
      target.clamp(0.0, _scroll.position.maxScrollExtent),
      duration: const Duration(milliseconds: 420),
      curve: Curves.easeOutCubic,
    );
  }

  void _onAgendaReport(ArenaDetailAgendaReport report) {
    setState(() => _agenda = report);
  }

  void _openOffer(ArenaOfferKind kind) {
    _scrollTo(switch (kind) {
      ArenaOfferKind.schedulePlan => _plansKey,
      ArenaOfferKind.club => _clubKey,
      ArenaOfferKind.classes => _classesKey,
    });
  }

  List<ArenaDetailAnchor> _anchors({
    required bool hasOffers,
    required bool hasEvents,
  }) =>
      [
        ArenaDetailAnchor(
          label: 'Horários',
          onTap: () => _scrollTo(_agendaKey),
        ),
        if (hasOffers)
          ArenaDetailAnchor(
            label: 'Planos e aulas',
            onTap: () => _scrollTo(_offersKey),
          ),
        if (hasEvents)
          ArenaDetailAnchor(
            label: 'Torneios',
            onTap: () => _scrollTo(_eventsKey),
          ),
        ArenaDetailAnchor(
          label: 'Quadras',
          onTap: () => _scrollTo(_courtsKey),
        ),
        ArenaDetailAnchor(
          label: 'Sobre e contato',
          onTap: () => _scrollTo(_infoKey),
        ),
        ArenaDetailAnchor(
          label: 'Avaliações',
          onTap: () => _scrollTo(_reviewsKey),
        ),
      ];

  /// Abre a grade no dia que o atleta está olhando na agenda (hoje, antes de
  /// ele mexer).
  void _openSlots({String? courtId, String? sport}) {
    final now = DateTime.now();
    final day = _agenda?.day ?? DateTime(now.year, now.month, now.day);
    openArenaBookingSlots(
      context,
      arena: widget.arena,
      date: day,
      courtId: courtId,
      sport: sport,
    );
  }

  String _locationLine() {
    final arena = widget.arena;
    final city = arena.city?.trim() ?? '';
    final state = arena.state?.trim() ?? '';
    String base;
    if (city.isNotEmpty && state.isNotEmpty) {
      base = '$city, $state';
    } else if (city.isNotEmpty) {
      base = city;
    } else {
      base = arena.locationLabel;
    }

    final location = ref.watch(userLocationProvider).valueOrNull;
    final km = location != null ? kmFromUserToArena(arena, location) : null;
    if (km != null) {
      final kmLabel = _kmFormat.format(km);
      return '$base · $kmLabel km';
    }
    return base;
  }

  Future<void> _toggleFavorite() async {
    final userId = ref.read(authProvider).valueOrNull?.uid;
    if (userId == null || userId.isEmpty) {
      showAppSnackBar(context, 'Faça login para favoritar arenas.',
          isError: true);
      return;
    }
    if (_favoritePending) return;

    final favoriteIds =
        ref.read(favoriteArenaIdsProvider).valueOrNull ?? const <String>[];
    final isFavorite =
        _favoriteOverride ?? favoriteIds.contains(widget.arena.id);
    final next = !isFavorite;

    setState(() {
      _favoriteOverride = next;
      _favoritePending = true;
    });

    try {
      await ref.read(favoritesServiceProvider).toggleFavoriteArena(
            userId: userId,
            arenaId: widget.arena.id,
            isFavorite: isFavorite,
          );
      if (!mounted) return;
      setState(() {
        _favoritePending = false;
        _favoriteOverride = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _favoritePending = false;
        _favoriteOverride = null;
      });
      showAppSnackBar(
        context,
        'Não foi possível atualizar seus favoritos agora.',
        isError: true,
      );
    }
  }

  Future<void> _share() async {
    final arena = widget.arena;
    final url = AppShareLinks.arenaBooking(arena.id);
    try {
      await nexaShareText(
        context,
        arenaShareMessage(arena, url: url),
        subject: arena.name,
      );
    } on Exception {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível abrir o compartilhar agora.',
        isError: true,
      );
    }
  }

  /// Abre [url] fora do app; avisa com [failureMessage] se nada abrir.
  Future<void> _openExternal(String url, String failureMessage) async {
    final uri = Uri.parse(url);
    var opened = false;
    try {
      opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    } on Exception {
      opened = false;
    }
    if (!opened && mounted) {
      showAppSnackBar(context, failureMessage, isError: true);
    }
  }

  void _openEvent(OrganizerEvent event) {
    context.pushNamed(
      AppRouteNames.tournamentDetail,
      pathParameters: {'tournamentId': event.id},
    );
  }

  void _openReviews(ArenaListItem arena) {
    final city = arena.city?.trim() ?? '';
    context.pushNamed(
      AppRouteNames.arenaReviews,
      pathParameters: {'arenaId': arena.id},
      queryParameters: {
        'arenaName': arena.name,
        if (city.isNotEmpty) 'arenaCity': city,
      },
    );
  }

  List<ArenaDetailRule> _rules(ArenaListItem arena) {
    final policy = arena.athleteCancelPolicy;
    final payment = arenaPaymentMethodsLabel(
      online: arena.onlinePaymentEnabled,
      onsite: arena.onsitePaymentEnabled,
    );
    return [
      ArenaDetailRule(
        icon: Icons.event_busy_outlined,
        title: ArenaBookingCancellationPolicy.cancellationTitle(policy),
        subtitle: ArenaBookingCancellationPolicy.cancellationSubtitle(
          arena.name,
          policy,
        ),
      ),
      if (payment != null)
        ArenaDetailRule(
          icon: Icons.payments_outlined,
          title: 'Formas de pagamento',
          subtitle: payment,
        ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final arena = widget.arena;
    final reputation = widget.reputation;
    final today = widget.todaySummary;
    final reviews = widget.reviews;

    final favoriteIds =
        ref.watch(favoriteArenaIdsProvider).valueOrNull ?? const <String>[];
    final isFavorite = _favoriteOverride ?? favoriteIds.contains(arena.id);

    final rating = reputation?.ratingAverage ?? arena.ratingAverage;
    final reviewsCount = reputation?.reviewsCount ?? arena.reviewsCount;
    final totalCourts = today?.totalActiveCourts ?? 0;
    final freeCourts = today?.freeCourtsToday ?? 0;
    final entryPrice = arenaEntryPricePerHour(
      courts: [
        for (final summary in today?.courts ?? const <ArenaCourtDaySummary>[])
          summary.court,
      ],
      arenaFallbackPerHour: arena.pricePerHourReais,
    );
    final description = arena.description?.trim() ?? '';
    final whatsAppUrl = arenaPartnerWhatsAppUrl(arena);

    final now = DateTime.now();
    final hasOffers =
        ref.watch(arenaDetailOtherOffersProvider(arena.id)).isNotEmpty;
    final hasEvents =
        arenaDetailUpcomingEvents(ref, arena.id, now).isNotEmpty;
    final anchors = _anchors(hasOffers: hasOffers, hasEvents: hasEvents);
    final hours = ref.watch(arenaDetailHoursProvider(
      (arenaId: arena.id, today: slotDayOnly(now)),
    ));
    final openStatus =
        hours == null ? null : arenaOpenStatus(hours.today, now);
    const side = 20.0;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: Column(
        children: [
          Expanded(
            child: Stack(
              children: [
                CustomScrollView(
                  controller: _scroll,
                  physics: const BouncingScrollPhysics(),
                  slivers: [
                    SliverToBoxAdapter(
                      child: ArenaDetailHero(
                        arenaId: arena.id,
                        photos: arenaGalleryUrls(arena),
                        onShare: _share,
                        isBestPrice: widget.isBestPrice,
                        isFavorite: isFavorite,
                        isFavoritePending: _favoritePending,
                        onBack: () => context.pop(),
                        onToggleFavorite: _toggleFavorite,
                      ),
                    ),
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(side, 16, side, 0),
                      sliver: SliverList(
                        delegate: SliverChildListDelegate([
                          Text(
                            arena.name,
                            style: theme.textTheme.headlineSmall?.copyWith(
                              fontWeight: FontWeight.w900,
                              color: context.themeColors.onSurface,
                              letterSpacing: -0.5,
                              height: 1.15,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(
                                Icons.place_outlined,
                                size: 18,
                                color: context.themeColors.onSurfaceMuted,
                              ),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  _locationLine(),
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                    color: context.themeColors.onSurfaceMuted,
                                    fontWeight: FontWeight.w600,
                                    height: 1.35,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          if (openStatus != null) ...[
                            const SizedBox(height: 6),
                            ArenaDetailOpenStatusLine(status: openStatus),
                          ],
                          const SizedBox(height: 16),
                          ArenaDetailMetricsBar(
                            rating: rating,
                            reviewsCount: reviewsCount,
                            entryPricePerHour: entryPrice,
                            totalCourts: totalCourts,
                            freeCourtsToday: freeCourts,
                          ),
                          ArenaDetailPromotions(
                            arenaId: arena.id,
                            onOpenSlots: _openSlots,
                          ),
                          const SizedBox(height: 8),
                        ]),
                      ),
                    ),
                    SliverToBoxAdapter(
                      child: Visibility(
                        visible: !_pinAnchors,
                        maintainSize: true,
                        maintainAnimation: true,
                        maintainState: true,
                        child: KeyedSubtree(
                          key: _anchorsKey,
                          child: ArenaDetailAnchorBar(anchors: anchors),
                        ),
                      ),
                    ),
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: KeyedSubtree(
                          key: _agendaKey,
                          child: ArenaDetailAgenda(
                            arena: arena,
                            onReport: _onAgendaReport,
                          ),
                        ),
                      ),
                    ),
                    SliverToBoxAdapter(
                      child: KeyedSubtree(
                        key: _offersKey,
                        child: Padding(
                          padding: EdgeInsets.only(top: hasOffers ? 28 : 0),
                          child: ArenaDetailOtherOffers(
                            arenaId: arena.id,
                            onTap: _openOffer,
                          ),
                        ),
                      ),
                    ),
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(side, 0, side, 120),
                      sliver: SliverList(
                        delegate: SliverChildListDelegate([
                          KeyedSubtree(
                            key: _eventsKey,
                            child: ArenaDetailEventsSection(
                              arenaId: arena.id,
                              now: now,
                              onOpen: _openEvent,
                            ),
                          ),
                          ArenaDetailPlayersCount(arenaId: arena.id),
                          if (arena.amenities.hasAny) ...[
                            const SizedBox(height: 28),
                            ArenaDetailAmenityChips(
                              amenities: arena.amenities,
                            ),
                          ],
                          const SizedBox(height: 28),
                          KeyedSubtree(
                            key: _courtsKey,
                            child: ArenaDetailCourtsSection(
                              arena: arena,
                              today: today,
                              loading: widget.todayLoading,
                              onOpenCourt: (courtId) =>
                                  _openSlots(courtId: courtId),
                              onOpenSport: (sport) => _openSlots(sport: sport),
                            ),
                          ),
                          // Horário fixo vendido como plano (só com plano
                          // publicado): é a outra forma de reservar.
                          KeyedSubtree(
                            key: _plansKey,
                            child: ArenaDetailSchedulePlansSection(
                              arenaId: arena.id,
                            ),
                          ),
                          // Plano de aulas e professores com vínculo público.
                          KeyedSubtree(
                            key: _classesKey,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                ArenaDetailClassPlansSection(
                                  arenaId: arena.id,
                                ),
                                ArenaPublicProfessorsSection(
                                  arenaId: arena.id,
                                ),
                              ],
                            ),
                          ),
                          KeyedSubtree(
                            key: _clubKey,
                            child: ArenaDetailClubSection(arenaId: arena.id),
                          ),
                          KeyedSubtree(
                            key: _infoKey,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                if (description.isNotEmpty) ...[
                                  const SizedBox(height: 28),
                                  ArenaDetailAboutSection(
                                    description: description,
                                  ),
                                ],
                                const SizedBox(height: 28),
                                ArenaDetailLocationSection(
                                  address: arenaFullAddress(arena),
                                  onDirections: arenaHasDirections(arena)
                                      ? () => _openExternal(
                                            arenaDirectionsUrl(arena),
                                            'Não foi possível abrir o mapa.',
                                          )
                                      : null,
                                  onWhatsApp: whatsAppUrl == null
                                      ? null
                                      : () => _openExternal(
                                            whatsAppUrl,
                                            'Não foi possível abrir o '
                                            'WhatsApp.',
                                          ),
                                ),
                                if (hours != null &&
                                    hours.week.isNotEmpty) ...[
                                  const SizedBox(height: 20),
                                  ArenaDetailWeekHours(rows: hours.week),
                                ],
                                const SizedBox(height: 28),
                                ArenaDetailRulesSection(rules: _rules(arena)),
                              ],
                            ),
                          ),
                          const SizedBox(height: 28),
                          KeyedSubtree(
                            key: _reviewsKey,
                            child: widget.reviewsLoading && reviews.isEmpty
                                ? const Center(
                                    child: Padding(
                                      padding: EdgeInsets.all(16),
                                      child: CircularProgressIndicator(
                                        color: AppColors.brand,
                                        strokeWidth: 2,
                                      ),
                                    ),
                                  )
                                : ArenaDetailReviewsSection(
                                    reviews: reviews,
                                    now: now,
                                    onViewAll: reviews.isNotEmpty
                                        ? () => _openReviews(arena)
                                        : null,
                                  ),
                          ),
                          // "Você é professor?" — por último, depois do que é
                          // da reserva; com vínculo em aberto vira o status.
                          ArenaProfessorLinkCard(
                            arenaId: arena.id,
                            arenaName: arena.name,
                            arenaLogoUrl: arena.logoUrl,
                          ),
                        ]),
                      ),
                    ),
                  ],
                ),
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: IgnorePointer(
                    ignoring: !_pinAnchors,
                    child: AnimatedOpacity(
                      opacity: _pinAnchors ? 1 : 0,
                      duration: const Duration(milliseconds: 160),
                      child: ColoredBox(
                        color: context.themeColors.canvas,
                        child: Padding(
                          padding: EdgeInsets.only(top: _pinnedTop),
                          child: ArenaDetailAnchorBar(anchors: anchors),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          ArenaDetailBottomCta(
            onPressed: () => _openSlots(),
            entryPricePerHour: entryPrice,
            freeSlotsToday: today?.totalFreeSlotsToday,
            selection: _agenda?.selection,
          ),
        ],
      ),
    );
  }
}
