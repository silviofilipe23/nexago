import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_floating_header.dart';
import '../../../core/router/routes.dart';
import '../../../core/search/search_keywords.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/nexa_async_view.dart';
import '../../../core/ui/nexa_section_header.dart';
import '../../../core/ui/nexa_segmented_control.dart';
import '../../../core/ui/nexa_skeleton.dart';
import '../../arena/presentation/widgets/arena_dashboard_tokens.dart';
import '../data/my_tournament_registrations_repository.dart';
import '../domain/tournament_discovery_helpers.dart';
import '../domain/tournament_discovery_hub_logic.dart';
import '../domain/tournament_discovery_hub_providers.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_discovery_providers.dart';
import 'widgets/discovery_list/discovery_list_filter_chips.dart';
import 'widgets/discovery_list/discovery_list_header.dart';
import 'widgets/discovery_list/discovery_list_stats_row.dart';
import 'widgets/league_discovery_card.dart';
import 'widgets/tournament_discovery_card.dart';

void _handleDiscoveryListBack(BuildContext context) {
  if (context.canPop()) {
    context.pop();
    return;
  }
  context.go('${AppRoutes.discover}?tab=competir');
}

/// Listagem completa de ligas e torneios (busca, filtros, segmentos).
class TournamentDiscoveryListPage extends ConsumerStatefulWidget {
  const TournamentDiscoveryListPage({
    super.key,
    this.initialSearchOpen = false,
    this.initialQuery = '',
  });

  final bool initialSearchOpen;
  final String initialQuery;

  @override
  ConsumerState<TournamentDiscoveryListPage> createState() =>
      _TournamentDiscoveryListPageState();
}

class _TournamentDiscoveryListPageState
    extends ConsumerState<TournamentDiscoveryListPage> {
  static const _pageSize = 20;
  static const _horizontalPadding = ArenaDashboardTokens.horizontalPadding;

  late DiscoveryListSegment _segment = DiscoveryListSegment.all;
  TournamentDiscoveryCategoryFilter _category =
      TournamentDiscoveryCategoryFilter.all;
  bool _openOnly = false;
  late bool _searching = widget.initialSearchOpen;
  late final TextEditingController _searchController = TextEditingController(
    text: widget.initialQuery,
  );
  late final FocusNode _searchFocus = FocusNode();
  final _scrollController = ScrollController();
  Timer? _searchDebounce;
  String _debouncedQuery = '';
  int _visibleLimit = _pageSize;

  @override
  void initState() {
    super.initState();
    _debouncedQuery = widget.initialQuery;
    _scrollController.addListener(_onScroll);
    _searchController.addListener(_onSearchChanged);
    if (widget.initialSearchOpen) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _searchFocus.requestFocus();
      });
    }
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    _searchFocus.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _resetVisibleLimit() {
    _visibleLimit = _pageSize;
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final pos = _scrollController.position;
    if (pos.pixels >= pos.maxScrollExtent - 200) {
      setState(() => _visibleLimit += _pageSize);
    }
  }

  void _onSearchChanged() {
    setState(() {});
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) {
        setState(() {
          _debouncedQuery = _searchController.text;
          _resetVisibleLimit();
        });
      }
    });
  }

  Future<void> _refresh() async {
    ref.invalidate(discoveryTournamentsProvider);
    ref.invalidate(discoveryLeaguesProvider);
    ref.invalidate(myTournamentRegistrationsProvider);
    final query = _debouncedQuery.trim();
    if (isSearchTermLongEnough(query)) {
      ref.invalidate(discoveryTournamentKeywordSearchProvider(query));
      ref.invalidate(discoveryLeagueKeywordSearchProvider(query));
    }
    setState(_resetVisibleLimit);
  }

  List<_DiscoveryListRow> _buildRows({
    required List<DiscoveryLeague> leaguesByQuery,
    required List<DiscoveryTournament> tournamentsToShow,
    required bool tournamentsEmpty,
  }) {
    final rows = <_DiscoveryListRow>[];
    if (_segment == DiscoveryListSegment.all ||
        _segment == DiscoveryListSegment.leagues) {
      if (leaguesByQuery.isNotEmpty) {
        rows.add(const _DiscoveryListRow.section('Ligas'));
        for (final league in leaguesByQuery) {
          rows.add(_DiscoveryListRow.league(league));
        }
      }
    }
    if (_segment == DiscoveryListSegment.all ||
        _segment == DiscoveryListSegment.tournaments) {
      rows.add(const _DiscoveryListRow.section('Torneios'));
      if (tournamentsEmpty) {
        rows.add(const _DiscoveryListRow.emptyTournaments());
      } else {
        for (final tournament in tournamentsToShow) {
          rows.add(_DiscoveryListRow.tournament(tournament));
        }
      }
    }
    return rows;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tournamentsAsync = ref.watch(discoveryTournamentsProvider);
    final searchQuery = _debouncedQuery;
    final useKeywordSearch = isSearchTermLongEnough(searchQuery);
    final keywordSearchAsync = useKeywordSearch
        ? ref.watch(discoveryTournamentKeywordSearchProvider(searchQuery))
        : null;
    final leagueKeywordSearchAsync = useKeywordSearch
        ? ref.watch(discoveryLeagueKeywordSearchProvider(searchQuery))
        : null;
    final leaguesAsync = ref.watch(discoveryLeaguesProvider);
    final stats = ref.watch(tournamentHubStatsProvider);
    final myRegs = ref.watch(myTournamentRegistrationsProvider);
    final regsByTournament = ref.watch(myRegistrationsByTournamentProvider);

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      body: SafeArea(
        top: false,
        bottom: false,
        child: NexaAsyncView<List<DiscoveryTournament>>(
          value: tournamentsAsync,
          skeleton: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(
              _horizontalPadding,
              24,
              _horizontalPadding,
              24,
            ),
            child: const Column(
              children: [
                NexaSkeleton(height: 210, radius: AppRadii.lgAll),
                SizedBox(height: 10),
                NexaSkeleton(height: 210, radius: AppRadii.lgAll),
                SizedBox(height: 10),
                NexaSkeleton(height: 210, radius: AppRadii.lgAll),
              ],
            ),
          ),
          onRetry: () {
            ref.invalidate(discoveryTournamentsProvider);
            ref.invalidate(discoveryLeaguesProvider);
          },
          data: (allTournaments) {
            final allLeagues = leaguesAsync.valueOrNull ?? const [];
            final leaguesFailed =
                leaguesAsync.hasError && !leaguesAsync.hasValue;
            final keywordTournaments = keywordSearchAsync?.valueOrNull;
            final useKeywordTournamentResults = useKeywordSearch &&
                keywordSearchAsync != null &&
                !keywordSearchAsync.hasError &&
                keywordTournaments != null &&
                keywordTournaments.isNotEmpty;

            final keywordLeagues = leagueKeywordSearchAsync?.valueOrNull;
            final useKeywordLeagueResults = useKeywordSearch &&
                leagueKeywordSearchAsync != null &&
                !leagueKeywordSearchAsync.hasError &&
                keywordLeagues != null &&
                keywordLeagues.isNotEmpty;

            final keywordSearchLoading = useKeywordSearch &&
                ((keywordSearchAsync?.isLoading == true &&
                        !keywordSearchAsync!.hasValue) ||
                    (leagueKeywordSearchAsync?.isLoading == true &&
                        !leagueKeywordSearchAsync!.hasValue)) &&
                !useKeywordTournamentResults &&
                !useKeywordLeagueResults;

            final tournamentPool = useKeywordTournamentResults
                ? keywordTournaments
                : allTournaments;

            final filtered = filterDiscoveryTournaments(
              tournaments: tournamentPool,
              category: _category,
              openOnly: _openOnly,
            );
            final filteredByQuery = useKeywordTournamentResults
                ? filtered
                : filterTournamentsByQuery(
                    filtered,
                    searchQuery,
                  );
            final sortedTournaments = sortDiscoveryTournamentsByDateProximity(
              filteredByQuery,
            );
            final leagueSource =
                useKeywordLeagueResults ? keywordLeagues : allLeagues;
            final leagues = visibleLeaguesForTournaments(
              leagues: leagueSource,
              filteredTournaments: sortedTournaments,
            );
            final leaguesByQuery = sortDiscoveryLeaguesByDateProximity(
              useKeywordLeagueResults
                  ? leagues
                  : filterLeaguesByQuery(leagues, searchQuery),
              sortedTournaments,
            );
            final standalone = standaloneTournaments(
              leagues: allLeagues,
              filteredTournaments: sortedTournaments,
            );
            final filteredIds = sortedTournaments.map((t) => t.id).toSet();
            final tournamentsToShow = _segment == DiscoveryListSegment.all
                ? standalone
                : sortedTournaments;
            final rows = _buildRows(
              leaguesByQuery: leaguesByQuery,
              tournamentsToShow: tournamentsToShow,
              tournamentsEmpty: tournamentsToShow.isEmpty,
            );
            final visibleRows = rows.take(_visibleLimit).toList();
            final hasMoreRows = rows.length > visibleRows.length;

            return RefreshIndicator(
              color: AppColors.brand,
              onRefresh: _refresh,
              child: CustomScrollView(
                controller: _scrollController,
                physics: const AlwaysScrollableScrollPhysics(
                  parent: BouncingScrollPhysics(),
                ),
                slivers: [
                  NexaFloatingHeaderSliver(
                    padding: const EdgeInsets.fromLTRB(
                      _horizontalPadding,
                      0,
                      _horizontalPadding,
                      12,
                    ),
                    topGap: 4,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        DiscoveryListHeader(
                          searching: _searching,
                          controller: _searchController,
                          focusNode: _searchFocus,
                          onBack: () => _handleDiscoveryListBack(context),
                          onToggleSearch: () {
                            setState(() => _searching = !_searching);
                            if (!_searching) {
                              _searchController.clear();
                              _searchFocus.unfocus();
                              _resetVisibleLimit();
                            } else {
                              _searchFocus.requestFocus();
                            }
                          },
                        ),
                        const SizedBox(height: 10),
                        DiscoveryListStatsRow(stats: stats),
                        const SizedBox(height: 10),
                        NexaSegmentedControl<DiscoveryListSegment>(
                          segments: const [
                            NexaSegment(
                              value: DiscoveryListSegment.all,
                              label: 'Tudo',
                            ),
                            NexaSegment(
                              value: DiscoveryListSegment.tournaments,
                              label: 'Torneios',
                            ),
                            NexaSegment(
                              value: DiscoveryListSegment.leagues,
                              label: 'Ligas',
                            ),
                          ],
                          selected: _segment,
                          onChanged: (s) => setState(() {
                            _segment = s;
                            _resetVisibleLimit();
                          }),
                        ),
                        const SizedBox(height: 14),
                        DiscoveryListFilterChips(
                          category: _category,
                          openOnly: _openOnly,
                          onCategoryChanged: (v) => setState(() {
                            _category = v;
                            _resetVisibleLimit();
                          }),
                          onOpenOnlyChanged: (v) => setState(() {
                            _openOnly = v;
                            _resetVisibleLimit();
                          }),
                        ),
                        if (leaguesFailed &&
                            _segment != DiscoveryListSegment.tournaments) ...[
                          const SizedBox(height: 10),
                          AppInlineErrorView(
                            message: 'Não foi possível carregar ligas.',
                            error: leaguesAsync.error,
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (keywordSearchLoading)
                    const SliverToBoxAdapter(
                      child: Padding(
                        padding: EdgeInsets.symmetric(vertical: 40),
                        child: Center(
                          child: CircularProgressIndicator(
                            color: AppColors.brand,
                          ),
                        ),
                      ),
                    )
                  else if (rows.isEmpty)
                    const SliverFillRemaining(
                      hasScrollBody: false,
                      child: AppEmptyView(
                        icon: Icons.emoji_events_outlined,
                        title: 'Nenhum torneio encontrado',
                        subtitle:
                            'Nenhum torneio encontrado com esses filtros.',
                      ),
                    )
                  else
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(
                        _horizontalPadding,
                        8,
                        _horizontalPadding,
                        24,
                      ),
                      sliver: SliverList(
                        delegate: SliverChildBuilderDelegate(
                          (context, index) {
                            if (index == visibleRows.length) {
                              if (hasMoreRows) {
                                return const Padding(
                                  padding: EdgeInsets.symmetric(vertical: 16),
                                  child: Center(
                                    child: CircularProgressIndicator(
                                      color: AppColors.brand,
                                      strokeWidth: 2,
                                    ),
                                  ),
                                );
                              }
                              return const SizedBox(height: 8);
                            }

                            final row = visibleRows[index];
                            return switch (row.kind) {
                              _DiscoveryListRowKind.sectionTitle => Padding(
                                  padding: EdgeInsets.only(
                                    top: index == 0 ? 0 : 14,
                                    bottom: 10,
                                  ),
                                  child: NexaSectionHeader(
                                    title: row.sectionTitle!,
                                    padding: EdgeInsets.zero,
                                  ),
                                ),
                              _DiscoveryListRowKind.league => Padding(
                                  padding: const EdgeInsets.only(bottom: 10),
                                  child: LeagueDiscoveryCard(
                                    league: row.league!,
                                    tournamentCount: leagueTournamentCount(
                                      row.league!,
                                      filteredIds,
                                    ),
                                    enrolled: leagueHasRegistration(
                                      league: row.league!,
                                      regs: myRegs.valueOrNull ?? const [],
                                    ),
                                    open: leagueHasOpenTournaments(
                                      league: row.league!,
                                      tournaments: sortedTournaments,
                                    ),
                                    onTap: () => context.pushNamed(
                                      AppRouteNames.leagueDetail,
                                      pathParameters: {
                                        'leagueId': row.league!.id,
                                      },
                                    ),
                                  ),
                                ),
                              _DiscoveryListRowKind.tournament => Padding(
                                  padding: const EdgeInsets.only(bottom: 10),
                                  child: TournamentDiscoveryCard(
                                    tournament: row.tournament!,
                                    registration:
                                        regsByTournament[row.tournament!.id],
                                    onTap: () => context.pushNamed(
                                      AppRouteNames.tournamentDetail,
                                      pathParameters: {
                                        'tournamentId': row.tournament!.id,
                                      },
                                    ),
                                  ),
                                ),
                              _DiscoveryListRowKind.emptyTournaments => Padding(
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 24,
                                  ),
                                  child: Text(
                                    'Nenhum torneio encontrado com esses filtros.',
                                    textAlign: TextAlign.center,
                                    style: theme.textTheme.bodyMedium?.copyWith(
                                      color: context.themeColors.onSurfaceMuted,
                                    ),
                                  ),
                                ),
                            };
                          },
                          childCount: visibleRows.length + 1,
                        ),
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

enum DiscoveryListSegment { all, tournaments, leagues }

enum _DiscoveryListRowKind {
  sectionTitle,
  league,
  tournament,
  emptyTournaments,
}

class _DiscoveryListRow {
  const _DiscoveryListRow.section(this.sectionTitle)
      : kind = _DiscoveryListRowKind.sectionTitle,
        league = null,
        tournament = null;

  const _DiscoveryListRow.league(this.league)
      : kind = _DiscoveryListRowKind.league,
        sectionTitle = null,
        tournament = null;

  const _DiscoveryListRow.tournament(this.tournament)
      : kind = _DiscoveryListRowKind.tournament,
        sectionTitle = null,
        league = null;

  const _DiscoveryListRow.emptyTournaments()
      : kind = _DiscoveryListRowKind.emptyTournaments,
        sectionTitle = null,
        league = null,
        tournament = null;

  final _DiscoveryListRowKind kind;
  final String? sectionTitle;
  final DiscoveryLeague? league;
  final DiscoveryTournament? tournament;
}

bool leagueHasRegistration({
  required DiscoveryLeague league,
  required List<MyTournamentRegistration> regs,
}) {
  final ids = regs.map((r) => r.tournamentId).toSet();
  for (final stage in league.stages) {
    for (final tid in stage.tournamentIds) {
      if (ids.contains(tid)) return true;
    }
  }
  return false;
}

bool leagueHasOpenTournaments({
  required DiscoveryLeague league,
  required List<DiscoveryTournament> tournaments,
}) {
  final inLeague = <String>{};
  for (final stage in league.stages) {
    inLeague.addAll(stage.tournamentIds);
  }
  for (final t in tournaments) {
    if (!inLeague.contains(t.id)) continue;
    if (t.status == TournamentListingStatus.open) return true;
  }
  return false;
}
