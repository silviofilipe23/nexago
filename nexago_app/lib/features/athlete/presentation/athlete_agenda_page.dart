import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/errors/friendly_error_message.dart';
import '../../../core/layout/nexa_page_header.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../arenas/domain/my_bookings_providers.dart';
import '../../arenas/presentation/arena_booking_navigation.dart';
import '../../athlete_billing/application/athlete_billing_providers.dart';
import '../../schedule_plans/presentation/widgets/schedule_plans_entry_points.dart';
import '../../tournaments/data/my_tournament_registrations_repository.dart';
import '../../tournaments/domain/tournament_discovery_providers.dart';
import '../data/class_agenda_repository.dart';
import '../domain/agenda/agenda_list_logic.dart';
import '../domain/agenda/athlete_agenda_logic.dart';
import '../domain/agenda/athlete_agenda_models.dart';
import '../domain/agenda/athlete_agenda_providers.dart';
import '../domain/agenda/class_charge_payment_watch.dart';
import '../domain/athlete_notifications_providers.dart';
import '../domain/athlete_shell_providers.dart';
import 'widgets/agenda/agenda_empty_day_view.dart';
import 'widgets/agenda/agenda_empty_state.dart';
import 'widgets/agenda/agenda_filter_chips.dart';
import 'widgets/agenda/agenda_header.dart';
import 'widgets/agenda/agenda_list_sections.dart';
import 'widgets/agenda/agenda_month_picker_sheet.dart';
import 'widgets/agenda/agenda_pendencies_section.dart';
import 'widgets/agenda/agenda_review_prompt_card.dart';
import 'widgets/agenda/agenda_tabs.dart';
import 'widgets/agenda/agenda_timeline_widgets.dart';
import 'widgets/athlete_home/athlete_account_sheet.dart';
import '../../arenas/domain/waitlist_providers.dart';

/// Agenda unificada do atleta: reservas, aulas, torneios, Clubinho e Bora
/// Jogar numa lista contínua que abre no agora ("Próximos"), com o que passou
/// agrupado por mês ("Histórico") e as pendências no topo.
class AthleteAgendaPage extends ConsumerStatefulWidget {
  const AthleteAgendaPage({super.key});

  @override
  ConsumerState<AthleteAgendaPage> createState() => _AthleteAgendaPageState();
}

class _AthleteAgendaPageState extends ConsumerState<AthleteAgendaPage> {
  final TextEditingController _searchController = TextEditingController();

  AthleteAgendaTimeTab _timeTab = AthleteAgendaTimeTab.upcoming;
  AthleteAgendaFilter _filter = AthleteAgendaFilter.all;
  String _searchQuery = '';
  bool _searchVisible = false;

  /// Um cabeçalho de bloco por aba e dia: alvo do seletor de data.
  final Map<String, GlobalKey> _sectionKeys = {};

  /// Espera de pagamento em curso — um resume novo substitui o anterior.
  int _paymentWatch = 0;
  late final AppLifecycleListener _lifecycleListener;

  @override
  void initState() {
    super.initState();
    _lifecycleListener = AppLifecycleListener(onResume: _onResume);
  }

  @override
  void dispose() {
    _lifecycleListener.dispose();
    _searchController.dispose();
    super.dispose();
  }

  /// Volta ao app com mensalidade online em aberto — pagou pelo inbox, pelo
  /// push ou pelo link do WhatsApp: relê na hora e segue relendo
  /// ~1 min, porque a baixa do webhook do Asaas pode chegar depois da volta.
  /// A agenda vive no `IndexedStack` do shell, então ouve todo resume.
  void _onResume() {
    final open = ref.read(myClassChargesProvider).valueOrNull ?? const [];
    final watched = classChargesAwaitingOnlinePayment(open);
    if (watched.isEmpty) return;
    ref.invalidate(myClassChargesProvider);
    _watchClassPayment(watched, professorChargeIds: {
      for (final c in open)
        if (c.isProfessorCharge) c.chargeId,
    });
  }

  Future<void> _watchClassPayment(
    Set<String> watched, {
    Set<String> professorChargeIds = const {},
  }) async {
    final run = ++_paymentWatch;
    bool stale() => !mounted || run != _paymentWatch;
    final paid = await watchClassChargesPaid(
      watched: watched,
      fetch: ref.read(classAgendaRepositoryProvider).fetchMyCharges,
      isCancelled: stale,
    );
    if (paid.isEmpty || stale()) return;
    ref.invalidate(myClassChargesProvider);
    // Pagou o professor independente: a tela de confirmação (B17) no lugar
    // do aviso — ela traz o comprovante.
    final professorPaid = paid.where(professorChargeIds.contains);
    if (professorPaid.isNotEmpty) {
      context.push(
        AppRoutes.lessonPaymentConfirmed
            .replaceAll(':chargeId', Uri.encodeComponent(professorPaid.first)),
      );
      return;
    }
    showAppSnackBar(
      context,
      paid.length == 1
          ? 'Pagamento da mensalidade confirmado.'
          : 'Pagamento das mensalidades confirmado.',
    );
  }

  Future<void> _refresh() async {
    refreshAthleteBilling(ref);
    ref.invalidate(myBookingsStreamProvider);
    ref.invalidate(discoveryTournamentsProvider);
    ref.invalidate(myTournamentRegistrationsProvider);
    try {
      await ref.read(myBookingsStreamProvider.future);
    } catch (_) {}
  }

  GlobalKey _sectionKey(AthleteAgendaTimeTab tab, DateTime day) =>
      _sectionKeys.putIfAbsent('${tab.name}-${dateOnly(day)}', GlobalKey.new);

  /// Itens da aba depois do filtro e da busca.
  List<AthleteAgendaItem> _visible(List<AthleteAgendaItem> scope) => [
        for (final i in scope)
          if (matchesAgendaFilter(i, _filter) &&
              matchesAgendaQuery(i, _searchQuery))
            i,
      ];

  /// Abre o mês e leva a lista ao dia tocado (ou ao bloco mais perto dele).
  /// Limpa filtro e busca: o dia escolhido pode ter só o que eles escondem.
  Future<void> _openDatePicker(List<AthleteAgendaItem> allItems) async {
    final now = DateTime.now();
    final picked = await showAgendaMonthPicker(
      context,
      items: [
        for (final i in allItems)
          if (!i.isCanceled) i,
      ],
      now: now,
    );
    if (picked == null || !mounted) return;

    final target = agendaJumpTarget(
      picked,
      upcoming: buildUpcomingAgendaSections(allItems, now: now),
      history: buildHistoryAgendaSections(allItems, now: now),
      now: now,
    );
    setState(() {
      _timeTab = target.tab;
      _filter = AthleteAgendaFilter.all;
      _searchQuery = '';
      _searchController.clear();
    });

    final label = DateFormat('dd/MM', 'pt_BR').format(picked);
    final sectionDay = target.sectionDay;
    if (sectionDay == null) {
      showAppSnackBar(context, 'Nada marcado a partir de $label.');
      return;
    }
    if (!target.exact) {
      showAppSnackBar(
        context,
        'Nada marcado em $label. Mostrando a data mais perto.',
      );
    }
    final key = _sectionKey(target.tab, sectionDay);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ctx = key.currentContext;
      if (ctx == null) return;
      Scrollable.ensureVisible(
        ctx,
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOutCubic,
      );
    });
  }

  void _onFilteredEmptyPrimaryAction(BuildContext context) {
    switch (_filter) {
      case AthleteAgendaFilter.trainings:
        context.pushNamed(AppRouteNames.athleteTrainings);
      case AthleteAgendaFilter.tournaments:
        openDiscoverCompeteTab(context, ref: ref);
      case AthleteAgendaFilter.all:
      case AthleteAgendaFilter.rentals:
      case AthleteAgendaFilter.challenges:
        openDiscoverReservarTab(context, ref: ref);
    }
  }

  void _toggleSearch() {
    setState(() {
      _searchVisible = !_searchVisible;
      if (!_searchVisible) {
        _searchQuery = '';
        _searchController.clear();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final bookingsAsync = ref.watch(myBookingsStreamProvider);
    // Só mantém o snapshot das mensalidades em aberto para a espera de
    // pagamento do [_onResume]; elas aparecem em "Precisa de você".
    ref.watch(myClassChargesProvider);
    final pendencies = ref.watch(athleteAgendaPendenciesProvider);
    final waitlistView = ref.watch(myWaitlistViewProvider);
    final unreadNotifications = ref.watch(
      athleteUnreadNotificationsCountProvider,
    );
    final allItems = ref.watch(athleteAgendaItemsProvider).allItems;
    final topInset = MediaQuery.paddingOf(context).top;

    return SafeArea(
      top: false,
      bottom: false,
      child: ColoredBox(
        color: context.themeColors.canvas,
        child: bookingsAsync.when(
          loading: () => Padding(
            padding: EdgeInsets.only(top: topInset),
            child: const AppLoadingView(message: 'Carregando agenda...'),
          ),
          error: (e, _) => Padding(
            padding: EdgeInsets.only(top: topInset),
            child: AppErrorView(
              title: 'Não foi possível carregar agenda',
              message: friendlyErrorMessage(
                e,
                action: 'Não foi possível carregar a agenda',
                logReason: 'agenda:carregar',
              ),
              onRetry: () => ref.invalidate(myBookingsStreamProvider),
            ),
          ),
          data: (_) => NexaPageHeader(
            topGap: 8,
            header: AgendaHeader(
              leading: const AthleteAccountButton(origin: 'agenda'),
              eyebrow: formatAgendaHeaderEyebrow(DateTime.now()),
              title: 'Agenda',
              unreadNotificationCount: unreadNotifications,
              searchVisible: _searchVisible,
              onSearchTap: _toggleSearch,
              onCalendarTap: () => _openDatePicker(allItems),
              onNotificationsTap: () => context.pushNamed(
                AppRouteNames.athleteNotifications,
              ),
              waitlistActiveCount: waitlistView.activeCount,
              waitlistHasOffer: waitlistView.hasOffer,
              onWaitlistTap: () =>
                  context.pushNamed(AppRouteNames.athleteWaitlist),
            ),
            child: RefreshIndicator(
              onRefresh: _refresh,
              color: AppColors.brand,
              child: CustomScrollView(
                controller: ref
                    .watch(athleteShellScrollRegistryProvider)
                    .controllerFor(athleteShellAgendaTabIndex),
                physics: const AlwaysScrollableScrollPhysics(
                  parent: BouncingScrollPhysics(),
                ),
                slivers: [
                  if (_searchVisible)
                    SliverToBoxAdapter(
                      child: AgendaSearchField(
                        controller: _searchController,
                        onChanged: (value) =>
                            setState(() => _searchQuery = value),
                      ),
                    ),
                  // Plano de horário (assinatura viva ou vaga oferecida).
                  const SliverToBoxAdapter(
                    child: MySchedulePlansAgendaTile(),
                  ),
                  // Pix, mensalidades e convites esperando o atleta.
                  if (pendencies.isNotEmpty)
                    SliverToBoxAdapter(
                      child: AgendaPendenciesSection(items: pendencies),
                    ),
                  // "Como foi o jogo?" da reserva concluída mais recente.
                  const SliverToBoxAdapter(
                    child: AgendaReviewPromptCard(),
                  ),
                  ..._buildListSlivers(context, allItems),
                  const SliverToBoxAdapter(child: SizedBox(height: 88)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _buildListSlivers(
    BuildContext context,
    List<AthleteAgendaItem> allItems,
  ) {
    final now = DateTime.now();
    final isPastTab = _timeTab == AthleteAgendaTimeTab.past;
    final upcomingScope = agendaUpcomingScope(allItems, now: now);
    final historyScope = agendaHistoryScope(allItems, now: now);
    final scope = isPastTab ? historyScope : upcomingScope;
    final visible = _visible(scope);
    final sections = isPastTab
        ? buildHistoryAgendaSections(visible, now: now)
        : buildUpcomingAgendaSections(visible, now: now);

    final hasActiveFilter =
        _filter != AthleteAgendaFilter.all || _searchQuery.isNotEmpty;
    final nothingUpcoming = !isPastTab && scope.isEmpty && !hasActiveFilter;

    return [
      SliverToBoxAdapter(
        child: AgendaTabs(
          selected: _timeTab,
          upcomingCount: upcomingScope.length,
          pastCount: historyScope.length,
          onChanged: (tab) => setState(() => _timeTab = tab),
        ),
      ),
      if (scope.isNotEmpty || hasActiveFilter)
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.only(top: 12, bottom: 4),
            child: AgendaFilterChips(
              selected: _filter,
              counts: countAgendaFilters(scope),
              onSelected: (value) => setState(() => _filter = value),
            ),
          ),
        ),
      if (nothingUpcoming)
        SliverToBoxAdapter(
          child: AgendaEmptyDayView(
            selectedDay: now,
            label: 'AGENDA LIVRE',
            onDropInTap: () {},
            onRestDayTap: () {},
          ),
        )
      else if (sections.isEmpty)
        SliverToBoxAdapter(
          child: AgendaEmptyState(
            filter: _filter,
            pastTab: isPastTab,
            searchQuery: _searchQuery,
            onPrimaryAction: () => _onFilteredEmptyPrimaryAction(context),
          ),
        )
      else
        SliverToBoxAdapter(
          child: AgendaListSections(
            sections: sections,
            sectionKey: (day) => _sectionKey(_timeTab, day),
            highlightNextId:
                isPastTab ? null : findNextAgendaItem(visible, now: now)?.id,
            onCancelBooking: (rental) =>
                cancelAgendaBooking(ref, context, rental),
          ),
        ),
    ];
  }
}
