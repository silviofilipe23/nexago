import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../core/router/routes.dart';
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
  late DiscoveryListSegment _segment = DiscoveryListSegment.all;
  TournamentDiscoveryCategoryFilter _category =
      TournamentDiscoveryCategoryFilter.all;
  bool _openOnly = false;
  late bool _searching = widget.initialSearchOpen;
  late final TextEditingController _searchController = TextEditingController(
    text: widget.initialQuery,
  );
  late final FocusNode _searchFocus = FocusNode();

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() => setState(() {}));
    if (widget.initialSearchOpen) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _searchFocus.requestFocus();
      });
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  String get _query => _searchController.text;

  void _openFilterSheet() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (sheetContext) {
        var tempCategory = _category;
        var tempOpenOnly = _openOnly;
        return StatefulBuilder(
          builder: (context, setSheetState) {
            return SafeArea(
              child: Container(
                margin: const EdgeInsets.fromLTRB(
                  ArenaDashboardTokens.horizontalPadding,
                  0,
                  ArenaDashboardTokens.horizontalPadding,
                  16,
                ),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.surfaceCard,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(
                    color: AppColors.onSurfaceMuted.withValues(alpha: 0.15),
                  ),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Filtros',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: AppColors.onSurface,
                      ),
                    ),
                    SizedBox(height: 14),
                    Text(
                      'Categoria',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: AppColors.onSurfaceMuted,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.6,
                      ),
                    ),
                    SizedBox(height: 8),
                    for (final f in TournamentDiscoveryCategoryFilter.values)
                      DiscoveryListRadioRow(
                        label: tournamentDiscoveryCategoryFilterLabel(f),
                        selected: tempCategory == f,
                        onTap: () => setSheetState(() => tempCategory = f),
                      ),
                    SizedBox(height: 8),
                    SwitchListTile(
                      value: tempOpenOnly,
                      onChanged: (v) => setSheetState(() {
                        tempOpenOnly = v;
                      }),
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        'Só com inscrição aberta',
                        style: TextStyle(
                          color: AppColors.onSurface,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    SizedBox(height: 14),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () {
                              setState(() {
                                _category =
                                    TournamentDiscoveryCategoryFilter.all;
                                _openOnly = false;
                              });
                              Navigator.of(sheetContext).pop();
                            },
                            style: OutlinedButton.styleFrom(
                              foregroundColor: AppColors.onSurface,
                              side: BorderSide(
                                color: AppColors.onSurfaceMuted.withValues(
                                  alpha: 0.25,
                                ),
                              ),
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            child: Text('Limpar'),
                          ),
                        ),
                        SizedBox(width: 10),
                        Expanded(
                          child: FilledButton(
                            onPressed: () {
                              setState(() {
                                _category = tempCategory;
                                _openOnly = tempOpenOnly;
                              });
                              Navigator.of(sheetContext).pop();
                            },
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.brand,
                              foregroundColor: AppColors.black,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            child: Text('Aplicar'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tournamentsAsync = ref.watch(discoveryTournamentsProvider);
    final leaguesAsync = ref.watch(discoveryLeaguesProvider);
    final stats = ref.watch(tournamentHubStatsProvider);
    final myRegs = ref.watch(myTournamentRegistrationsProvider);
    final regsByTournament = ref.watch(myRegistrationsByTournamentProvider);

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      body: SafeArea(
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
                final query = _query;
                final filtered = filterDiscoveryTournaments(
                  tournaments: allTournaments,
                  category: _category,
                  openOnly: _openOnly,
                );
                final filteredByQuery = filterTournamentsByQuery(
                  filtered,
                  query,
                );
                final sortedTournaments = sortDiscoveryTournamentsByDateProximity(
                  filteredByQuery,
                );
                final leagues = visibleLeaguesForTournaments(
                  leagues: allLeagues,
                  filteredTournaments: sortedTournaments,
                );
                final leaguesByQuery = sortDiscoveryLeaguesByDateProximity(
                  filterLeaguesByQuery(leagues, query),
                  sortedTournaments,
                );
                final standalone = standaloneTournaments(
                  leagues: allLeagues,
                  filteredTournaments: sortedTournaments,
                );
                final filteredIds = sortedTournaments.map((t) => t.id).toSet();

                return ListView(
                  padding: const EdgeInsets.fromLTRB(
                    ArenaDashboardTokens.horizontalPadding,
                    8,
                    ArenaDashboardTokens.horizontalPadding,
                    28,
                  ),
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
                        } else {
                          _searchFocus.requestFocus();
                        }
                      },
                      onOpenFilters: _openFilterSheet,
                    ),
                    SizedBox(height: 14),
                    DiscoveryListStatsRow(stats: stats),
                    SizedBox(height: 14),
                    DiscoveryListSegmented(
                      value: _segment,
                      onChanged: (s) => setState(() => _segment = s),
                    ),
                    SizedBox(height: 14),
                    DiscoveryListFilterChips(
                      category: _category,
                      openOnly: _openOnly,
                      onCategoryChanged: (v) => setState(() => _category = v),
                      onOpenOnlyChanged: (v) => setState(() => _openOnly = v),
                    ),
                    SizedBox(height: 18),
                    if (_segment == DiscoveryListSegment.all ||
                        _segment == DiscoveryListSegment.leagues) ...[
                      if (leaguesByQuery.isNotEmpty) ...[
                        const DiscoveryListSectionTitle(title: 'Ligas'),
                        SizedBox(height: 10),
                        for (final league in leaguesByQuery) ...[
                          LeagueDiscoveryCard(
                            league: league,
                            tournamentCount: leagueTournamentCount(
                              league,
                              filteredIds,
                            ),
                            enrolled: leagueHasRegistration(
                              league: league,
                              regs: myRegs.valueOrNull ?? const [],
                            ),
                            open: leagueHasOpenTournaments(
                              league: league,
                              tournaments: sortedTournaments,
                            ),
                            onTap: () => context.pushNamed(
                              AppRouteNames.leagueDetail,
                              pathParameters: {'leagueId': league.id},
                            ),
                          ),
                          SizedBox(height: 10),
                        ],
                        SizedBox(height: 14),
                      ],
                    ],
                    if (_segment == DiscoveryListSegment.all ||
                        _segment == DiscoveryListSegment.tournaments) ...[
                      const DiscoveryListSectionTitle(title: 'Torneios'),
                      SizedBox(height: 10),
                      if ((_segment == DiscoveryListSegment.all
                              ? standalone
                              : sortedTournaments)
                          .isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 24),
                          child: Text(
                            'Nenhum torneio encontrado com esses filtros.',
                            textAlign: TextAlign.center,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: AppColors.onSurfaceMuted,
                            ),
                          ),
                        )
                      else
                        for (final t
                            in (_segment == DiscoveryListSegment.all
                                ? standalone
                                : sortedTournaments)) ...[
                          TournamentDiscoveryCard(
                            tournament: t,
                            registration: regsByTournament[t.id],
                            onTap: () => context.pushNamed(
                              AppRouteNames.tournamentDetail,
                              pathParameters: {'tournamentId': t.id},
                            ),
                          ),
                          SizedBox(height: 10),
                        ],
                    ],
                  ],
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
    required this.onOpenFilters,
  });

  final bool searching;
  final TextEditingController controller;
  final FocusNode focusNode;
  final VoidCallback onBack;
  final VoidCallback onToggleSearch;
  final VoidCallback onOpenFilters;

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
            SizedBox(width: 10),
            DiscoveryListIconSquare(
              icon: Icons.tune_rounded,
              onTap: onOpenFilters,
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

class DiscoveryListRadioRow extends StatelessWidget {
  const DiscoveryListRadioRow({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(
              children: [
                Container(
                  width: 18,
                  height: 18,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: selected
                          ? AppColors.brand
                          : AppColors.onSurfaceMuted.withValues(alpha: 0.35),
                      width: 2,
                    ),
                  ),
                  child: selected
                      ? Center(
                          child: Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: AppColors.brand,
                            ),
                          ),
                        )
                      : null,
                ),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      color: AppColors.onSurface,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ),
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
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: DiscoveryListStatTile(
              label: 'Inscritos',
              value: '${stats.subscriptions}',
              icon: Icons.emoji_events_outlined,
            ),
          ),
          SizedBox(width: 8),
          Expanded(
            child: DiscoveryListStatTile(
              label: 'Ao vivo',
              value: '${stats.liveNow}',
              icon: Icons.sensors_rounded,
              accent: AppColors.live,
            ),
          ),
          SizedBox(width: 8),
          Expanded(
            child: DiscoveryListStatTile(
              label: 'Abertos p/ inscrição',
              value: '${stats.openRegistrations}',
              icon: Icons.person_add_outlined,
            ),
          ),
        ],
      ),
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

  static const double _labelAreaHeight = 32;

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
        padding: const EdgeInsets.fromLTRB(10, 12, 10, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 18, color: color),
            SizedBox(height: 8),
            Text(
              value,
              style: AppTypography.soraRegular(
                fontWeight: FontWeight.w800,
                color: AppColors.onSurface,
                fontSize: 22,
                height: 1.1,
              ),
            ),
            SizedBox(height: 6),
            SizedBox(
              height: _labelAreaHeight,
              child: Align(
                alignment: Alignment.topLeft,
                child: Text(
                  label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    height: 1.25,
                    color: AppColors.onSurfaceMuted,
                    fontWeight: FontWeight.w500,
                  ),
                ),
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
