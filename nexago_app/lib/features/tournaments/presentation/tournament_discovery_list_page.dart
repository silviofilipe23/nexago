import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../core/layout/nexa_floating_header.dart';
import '../../../core/router/routes.dart';
import '../../../core/search/search_keywords.dart';
import '../../../core/theme/app_colors.dart';
import '../../arena/presentation/widgets/arena_dashboard_tokens.dart';
import '../data/my_tournament_registrations_repository.dart';
import '../domain/tournament_discovery_helpers.dart';
import '../domain/tournament_discovery_hub_logic.dart';
import '../domain/tournament_discovery_hub_providers.dart';
import '../domain/tournament_discovery_labels.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_discovery_providers.dart';
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
        child: tournamentsAsync.when(
          loading: () =>
              Center(child: CircularProgressIndicator(color: AppColors.brand)),
          error: (e, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                'Não foi possível carregar torneios.\n$e',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: AppColors.live,
                ),
              ),
            ),
          ),
          data: (allTournaments) {
            return leaguesAsync.when(
              loading: () => Center(
                child: CircularProgressIndicator(color: AppColors.brand),
              ),
              error: (e, _) => Center(
                child: Text(
                  'Não foi possível carregar ligas.\n$e',
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: AppColors.live,
                  ),
                ),
              ),
              data: (allLeagues) {
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
                final leagueSource = useKeywordLeagueResults
                    ? keywordLeagues
                    : allLeagues;
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
                            DiscoveryListSegmented(
                              value: _segment,
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
                                      padding:
                                          EdgeInsets.symmetric(vertical: 16),
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
                                  _DiscoveryListRowKind.sectionTitle =>
                                    Padding(
                                      padding: EdgeInsets.only(
                                        top: index == 0 ? 0 : 14,
                                        bottom: 10,
                                      ),
                                      child: DiscoveryListSectionTitle(
                                        title: row.sectionTitle!,
                                      ),
                                    ),
                                  _DiscoveryListRowKind.league =>
                                    Padding(
                                      padding:
                                          const EdgeInsets.only(bottom: 10),
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
                                  _DiscoveryListRowKind.tournament =>
                                    Padding(
                                      padding:
                                          const EdgeInsets.only(bottom: 10),
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
                                  _DiscoveryListRowKind.emptyTournaments =>
                                    Padding(
                                      padding: const EdgeInsets.symmetric(
                                        vertical: 24,
                                      ),
                                      child: Text(
                                        'Nenhum torneio encontrado com esses filtros.',
                                        textAlign: TextAlign.center,
                                        style:
                                            theme.textTheme.bodyMedium?.copyWith(
                                          color: AppColors.onSurfaceMuted,
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

class DiscoveryListSectionTitle extends StatelessWidget {
  const DiscoveryListSectionTitle({super.key, required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: Theme.of(context).textTheme.titleMedium?.copyWith(
        fontWeight: FontWeight.w800,
        color: AppColors.onSurface,
        letterSpacing: -0.3,
      ),
    );
  }
}

class DiscoveryListHeader extends StatelessWidget {
  const DiscoveryListHeader({
    super.key,
    required this.searching,
    required this.controller,
    required this.focusNode,
    required this.onBack,
    required this.onToggleSearch,
  });

  final bool searching;
  final TextEditingController controller;
  final FocusNode focusNode;
  final VoidCallback onBack;
  final VoidCallback onToggleSearch;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            IconButton(
              onPressed: onBack,
              icon: Icon(Icons.arrow_back_rounded),
              color: AppColors.onSurface,
            ),
            Expanded(
              child: Text(
                'Explorar',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w900,
                  color: AppColors.onSurface,
                  letterSpacing: -0.5,
                ),
              ),
            ),
            DiscoveryListIconSquare(
              icon: Icons.search_rounded,
              onTap: onToggleSearch,
            ),
          ],
        ),
        if (searching) ...[
          SizedBox(height: 12),
          TextField(
            controller: controller,
            focusNode: focusNode,
            style: theme.textTheme.bodyLarge?.copyWith(
              color: AppColors.onSurface,
              fontWeight: FontWeight.w700,
            ),
            decoration: InputDecoration(
              hintText: 'Buscar torneios e ligas…',
              hintStyle: theme.textTheme.bodyMedium?.copyWith(
                color: AppColors.onSurfaceMuted,
              ),
              filled: true,
              fillColor: AppColors.surfaceRaised,
              prefixIcon: Icon(
                Icons.search_rounded,
                color: AppColors.onSurfaceMuted,
              ),
              suffixIcon: IconButton(
                onPressed: () => controller.clear(),
                icon: Icon(
                  Icons.close_rounded,
                  color: AppColors.onSurfaceMuted,
                ),
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide.none,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class DiscoveryListIconSquare extends StatelessWidget {
  const DiscoveryListIconSquare({
    super.key,
    required this.icon,
    required this.onTap,
  });

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(icon, color: AppColors.onSurface),
        ),
      ),
    );
  }
}

class DiscoveryListStatsRow extends StatelessWidget {
  const DiscoveryListStatsRow({super.key, required this.stats});

  final TournamentHubStats stats;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: DiscoveryListStatTile(
            label: 'Inscritos',
            value: '${stats.subscriptions}',
            icon: Icons.emoji_events_outlined,
          ),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: DiscoveryListStatTile(
            label: 'Ao vivo',
            value: '${stats.liveNow}',
            icon: Icons.sensors_rounded,
            accent: AppColors.live,
          ),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: DiscoveryListStatTile(
            label: 'Abertos',
            value: '${stats.openRegistrations}',
            icon: Icons.person_add_outlined,
          ),
        ),
      ],
    );
  }
}

class DiscoveryListSegmented extends StatelessWidget {
  const DiscoveryListSegmented({
    super.key,
    required this.value,
    required this.onChanged,
  });

  final DiscoveryListSegment value;
  final ValueChanged<DiscoveryListSegment> onChanged;

  static const _outerRadius = 28.0;
  static const _innerRadius = 22.0;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(_outerRadius),
        border: Border.all(
          color: AppColors.onSurfaceMuted.withValues(alpha: 0.22),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(4),
        child: Row(
          children: [
            _segment(DiscoveryListSegment.all, 'Tudo'),
            _segment(DiscoveryListSegment.tournaments, 'Torneios'),
            _segment(DiscoveryListSegment.leagues, 'Ligas'),
          ],
        ),
      ),
    );
  }

  Widget _segment(DiscoveryListSegment segment, String label) {
    final selected = value == segment;
    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => onChanged(segment),
          borderRadius: BorderRadius.circular(_innerRadius),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
            padding: const EdgeInsets.symmetric(vertical: 11),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: selected ? AppColors.brand : Colors.transparent,
              borderRadius: BorderRadius.circular(_innerRadius),
            ),
            child: Text(
              label,
              style: TextStyle(
                color: selected ? AppColors.black : AppColors.onSurfaceMuted,
                fontWeight: FontWeight.w800,
                fontSize: 14,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class DiscoveryListStatTile extends StatelessWidget {
  const DiscoveryListStatTile({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    this.accent,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    final color = accent ?? AppColors.brand;

    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(
        context,
        color: AppColors.surfaceCard,
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Icon(icon, size: 13, color: color),
                const SizedBox(width: 4),
                Text(
                  value,
                  style: AppTypography.soraRegular(
                    fontWeight: FontWeight.w800,
                    color: AppColors.onSurface,
                    fontSize: 15,
                    height: 1,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.soraRegular(
                fontSize: 10,
                height: 1.2,
                color: AppColors.onSurfaceMuted,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class DiscoveryListFilterChips extends StatelessWidget {
  const DiscoveryListFilterChips({
    super.key,
    required this.category,
    required this.openOnly,
    required this.onCategoryChanged,
    required this.onOpenOnlyChanged,
  });

  final TournamentDiscoveryCategoryFilter category;
  final bool openOnly;
  final ValueChanged<TournamentDiscoveryCategoryFilter> onCategoryChanged;
  final ValueChanged<bool> onOpenOnlyChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: TournamentDiscoveryCategoryFilter.values.map((f) {
              final selected = category == f;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    onTap: () => onCategoryChanged(f),
                    borderRadius: BorderRadius.circular(20),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 9,
                      ),
                      decoration: BoxDecoration(
                        color: selected
                            ? AppColors.surfaceCard
                            : AppColors.surfaceRaised,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: selected
                              ? AppColors.onSurfaceMuted.withValues(alpha: 0.45)
                              : AppColors.onSurfaceMuted.withValues(alpha: 0.2),
                        ),
                      ),
                      child: Text(
                        tournamentDiscoveryCategoryFilterLabel(f),
                        style: theme.textTheme.labelLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: selected
                              ? AppColors.onSurface
                              : AppColors.onSurfaceMuted,
                        ),
                      ),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ),
        SizedBox(height: 12),
        Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: () => onOpenOnlyChanged(!openOnly),
            borderRadius: BorderRadius.circular(10),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: [
                  SizedBox(
                    width: 22,
                    height: 22,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: openOnly
                            ? AppColors.brand
                            : AppColors.surfaceRaised,
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(
                          color: openOnly
                              ? AppColors.brand
                              : AppColors.onSurfaceMuted.withValues(
                                  alpha: 0.35,
                                ),
                          width: 1.5,
                        ),
                      ),
                      child: openOnly
                          ? Icon(
                              Icons.check_rounded,
                              size: 16,
                              color: AppColors.black,
                            )
                          : null,
                    ),
                  ),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Só com inscrição aberta',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: AppColors.onSurfaceMuted,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
