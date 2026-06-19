import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_status_views.dart';
import '../../arenas/domain/my_bookings_providers.dart';
import '../../arenas/presentation/arena_booking_navigation.dart';
import '../../tournaments/data/my_tournament_registrations_repository.dart';
import '../../tournaments/domain/tournament_discovery_providers.dart';
import '../domain/agenda/athlete_agenda_logic.dart';
import '../domain/agenda/athlete_agenda_models.dart';
import '../domain/agenda/athlete_agenda_providers.dart';
import '../domain/athlete_notifications_providers.dart';
import '../domain/athlete_shell_providers.dart';
import 'widgets/agenda/agenda_day_strip.dart';
import 'widgets/agenda/agenda_empty_day_view.dart';
import 'widgets/agenda/agenda_empty_state.dart';
import 'widgets/agenda/agenda_filter_chips.dart';
import 'widgets/agenda/agenda_header.dart';
import 'widgets/agenda/agenda_month_view.dart';
import 'widgets/agenda/agenda_tabs.dart';
import 'widgets/agenda/agenda_timeline_widgets.dart';

/// Agenda unificada do atleta (aluguéis, torneios, desafios).
class AthleteAgendaPage extends ConsumerStatefulWidget {
  const AthleteAgendaPage({super.key});

  @override
  ConsumerState<AthleteAgendaPage> createState() => _AthleteAgendaPageState();
}

class _AthleteAgendaPageState extends ConsumerState<AthleteAgendaPage> {
  final TextEditingController _searchController = TextEditingController();

  AthleteAgendaViewMode _viewMode = AthleteAgendaViewMode.day;
  AthleteAgendaTimeTab _timeTab = AthleteAgendaTimeTab.upcoming;
  AthleteAgendaFilter _filter = AthleteAgendaFilter.all;
  late DateTime _selectedDay;
  late DateTime _visibleMonth;
  String _searchQuery = '';
  bool _searchVisible = false;

  @override
  void initState() {
    super.initState();
    _selectedDay = dateOnly(DateTime.now());
    _visibleMonth = startOfMonth(_selectedDay);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    ref.invalidate(myBookingsStreamProvider);
    ref.invalidate(myTournamentRegistrationsProvider);
    ref.invalidate(discoveryTournamentsProvider);
    try {
      await ref.read(myBookingsStreamProvider.future);
    } catch (_) {}
  }

  void _toggleViewMode() {
    setState(() {
      if (_viewMode == AthleteAgendaViewMode.day) {
        _viewMode = AthleteAgendaViewMode.month;
        _visibleMonth = startOfMonth(_selectedDay);
      } else {
        _viewMode = AthleteAgendaViewMode.day;
      }
    });
  }

  void _onMonthChanged(DateTime month) {
    setState(() {
      _visibleMonth = startOfMonth(month);
      if (_viewMode == AthleteAgendaViewMode.month) {
        _selectedDay = _visibleMonth;
      }
    });
  }

  void _openDayFromMonth(DateTime day) {
    setState(() {
      _selectedDay = dateOnly(day);
      _visibleMonth = startOfMonth(day);
      _viewMode = AthleteAgendaViewMode.day;
    });
  }

  void _onTimeTabChanged(AthleteAgendaTimeTab tab) {
    setState(() => _timeTab = tab);
  }

  void _onFilteredEmptyPrimaryAction(BuildContext context) {
    if (_searchQuery.isNotEmpty) {
      openDiscoverReservarTab(context, ref: ref);
      return;
    }
    switch (_filter) {
      case AthleteAgendaFilter.rentals:
        openDiscoverReservarTab(context, ref: ref);
      case AthleteAgendaFilter.tournaments:
        openDiscoverCompeteTab(context, ref: ref);
      case AthleteAgendaFilter.challenges:
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(
            const SnackBar(content: Text('Desafios em breve no app.')),
          );
      case AthleteAgendaFilter.all:
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
    final now = DateTime.now();
    final bookingsAsync = ref.watch(myBookingsStreamProvider);
    final pageState = ref.watch(athleteAgendaItemsProvider);
    final unreadNotifications = ref.watch(
      athleteUnreadNotificationsCountProvider,
    );

    final isMonthMode = _viewMode == AthleteAgendaViewMode.month;
    final isPastTab = _timeTab == AthleteAgendaTimeTab.past;
    final timeTabCounts = countAgendaTimeTabs(pageState.allItems, now: now);

    final scopedItems = filterAgendaItems(
      items: pageState.allItems,
      filter: AthleteAgendaFilter.all,
      viewMode: _viewMode,
      selectedDay: _selectedDay,
      visibleMonth: _visibleMonth,
      timeTab: _timeTab,
      now: now,
    );
    final filterCounts = countAgendaFilters(scopedItems);

    final stripItems = filterAgendaItemsForWeekStrip(
      items: pageState.allItems,
      selectedDay: _selectedDay,
      timeTab: _timeTab,
      now: now,
    );
    final stripDays = buildWeekDayStrip(
      selectedDay: _selectedDay,
      items: stripItems,
      now: now,
    );

    final filtered = filterAgendaItems(
      items: pageState.allItems,
      filter: _filter,
      viewMode: _viewMode,
      selectedDay: _selectedDay,
      visibleMonth: _visibleMonth,
      timeTab: _timeTab,
      query: _searchQuery,
      now: now,
    );

    final monthDays = buildAgendaMonthDayMarkers(
      visibleMonth: _visibleMonth,
      selectedDay: _selectedDay,
      items: filtered,
      now: now,
    );
    final summaryRows = buildAgendaMonthSummaryRows(
      visibleMonth: _visibleMonth,
      items: filtered,
      now: now,
      timeTab: _timeTab,
      reverseDays: isPastTab,
    );
    final freeDaysCount = countFreeDaysInMonth(
      _visibleMonth,
      filtered,
      now: now,
      timeTab: _timeTab,
    );

    final nextItem = findNextAgendaItem(filtered, now: now);
    final highlightNextId = nextItem?.id;
    final isEmptyDayHero =
        !isPastTab &&
        !isMonthMode &&
        _filter == AthleteAgendaFilter.all &&
        _searchQuery.isEmpty &&
        filtered.isEmpty;

    final headerEyebrow = isMonthMode
        ? formatAgendaMonthEyebrow(_visibleMonth)
        : formatAgendaHeaderEyebrow(_selectedDay);
    final headerTitle = isMonthMode ? formatAgendaMonthTitle() : 'Agenda';

    return SafeArea(
      bottom: false,
      child: ColoredBox(
        color: context.themeColors.canvas,
        child: bookingsAsync.when(
          loading: () => const AppLoadingView(message: 'Carregando agenda...'),
          error: (e, _) => AppErrorView(
            title: 'Não foi possível carregar agenda',
            message: e.toString().replaceFirst('Exception: ', ''),
            onRetry: () => ref.invalidate(myBookingsStreamProvider),
          ),
          data: (_) {
            final timelineChildren = isMonthMode
                ? const <Widget>[]
                : _buildTimelineChildren(
                    context: context,
                    now: now,
                    filtered: filtered,
                    highlightNextId: highlightNextId,
                  );

            final hasActiveFilter =
                _filter != AthleteAgendaFilter.all || _searchQuery.isNotEmpty;
            final showFilteredEmpty =
                !isEmptyDayHero && hasActiveFilter && filtered.isEmpty;
            final showMonthView =
                isMonthMode && !isEmptyDayHero && !showFilteredEmpty;
            final showDayTimeline = !isMonthMode &&
                !isEmptyDayHero &&
                !showFilteredEmpty &&
                filtered.isNotEmpty;

            return Stack(
              children: [
                RefreshIndicator(
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
                      SliverToBoxAdapter(
                        child: AgendaHeader(
                          eyebrow: headerEyebrow,
                          title: headerTitle,
                          monthModeActive: isMonthMode,
                          unreadNotificationCount: unreadNotifications,
                          searchVisible: _searchVisible,
                          onSearchTap: _toggleSearch,
                          onCalendarTap: _toggleViewMode,
                          onNotificationsTap: () => context.pushNamed(
                            AppRouteNames.athleteNotifications,
                          ),
                        ),
                      ),
                      if (_searchVisible)
                        SliverToBoxAdapter(
                          child: AgendaSearchField(
                            controller: _searchController,
                            onChanged: (value) =>
                                setState(() => _searchQuery = value),
                          ),
                        ),
                      SliverToBoxAdapter(
                        child: AgendaTabs(
                          selected: _timeTab,
                          upcomingCount: timeTabCounts.upcoming,
                          pastCount: timeTabCounts.past,
                          onChanged: _onTimeTabChanged,
                        ),
                      ),
                      if (!isMonthMode)
                        SliverToBoxAdapter(
                          child: AgendaDayStrip(
                            days: stripDays,
                            onSelect: (day) =>
                                setState(() => _selectedDay = dateOnly(day)),
                          ),
                        ),
                      if (!isEmptyDayHero)
                        SliverToBoxAdapter(
                          child: Padding(
                            padding: const EdgeInsets.only(top: 12, bottom: 8),
                            child: AgendaFilterChips(
                              selected: _filter,
                              counts: filterCounts,
                              onSelected: (value) =>
                                  setState(() => _filter = value),
                            ),
                          ),
                        ),
                      if (isEmptyDayHero)
                        SliverToBoxAdapter(
                          child: AgendaEmptyDayView(
                            selectedDay: _selectedDay,
                            onDropInTap: () {
                              ScaffoldMessenger.of(context)
                                ..hideCurrentSnackBar()
                                ..showSnackBar(
                                  const SnackBar(
                                    content: Text('Drop-in em breve no app.'),
                                  ),
                                );
                            },
                            onRestDayTap: () {
                              ScaffoldMessenger.of(context)
                                ..hideCurrentSnackBar()
                                ..showSnackBar(
                                  const SnackBar(
                                    content: Text(
                                      'Dia marcado como descanso.',
                                    ),
                                  ),
                                );
                            },
                          ),
                        )
                      else if (showMonthView)
                        SliverToBoxAdapter(
                          child: AgendaMonthView(
                            visibleMonth: _visibleMonth,
                            monthDays: monthDays,
                            summaryRows: summaryRows,
                            freeDaysCount: freeDaysCount,
                            onMonthChanged: _onMonthChanged,
                            onDaySelected: _openDayFromMonth,
                          ),
                        )
                      else if (showFilteredEmpty)
                        SliverToBoxAdapter(
                          child: AgendaEmptyState(
                            filter: _filter,
                            monthMode: isMonthMode,
                            pastTab: isPastTab,
                            searchQuery: _searchQuery,
                            onPrimaryAction: () =>
                                _onFilteredEmptyPrimaryAction(context),
                          ),
                        )
                      else if (showDayTimeline)
                        SliverList(
                          delegate: SliverChildBuilderDelegate(
                            (context, index) => timelineChildren[index],
                            childCount: timelineChildren.length,
                          ),
                        ),
                      const SliverToBoxAdapter(child: SizedBox(height: 88)),
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

  List<Widget> _buildTimelineChildren({
    required BuildContext context,
    required DateTime now,
    required List<AthleteAgendaItem> filtered,
    required String? highlightNextId,
  }) {
    final isPastTab = _timeTab == AthleteAgendaTimeTab.past;
    final sectionTitle = formatSectionTitle(_selectedDay, now: now);
    final sectionSubtitle = formatSectionSubtitle(
      filtered,
      now: now,
      pastOnly: isPastTab,
    );
    final rows = buildAgendaTimelineRows(items: filtered);

    return [
      AgendaTimelineSectionHeader(
        title: sectionTitle,
        subtitle: sectionSubtitle,
      ),
      for (var i = 0; i < rows.length; i++)
        AgendaTimelineRow(
          key: ValueKey('day-row-$i'),
          row: rows[i],
          highlightNextId: isPastTab ? null : highlightNextId,
          onCancelBooking: (rental) =>
              cancelAgendaBooking(ref, context, rental),
        ),
    ];
  }
}
