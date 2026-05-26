import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../arena/presentation/widgets/arena_dashboard_tokens.dart';
import '../../athlete/domain/tournament_access_providers.dart';
import '../../athlete/presentation/widgets/tournament_access_banner.dart';
import '../data/my_tournament_registrations_repository.dart';
import '../domain/tournament_discovery_helpers.dart';
import '../domain/tournament_discovery_hub_logic.dart';
import '../domain/tournament_discovery_hub_providers.dart';
import '../domain/tournament_discovery_labels.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_discovery_providers.dart';
import 'widgets/league_discovery_card.dart';
import 'widgets/tournament_discovery_card.dart';

/// Aba Competir — descoberta de ligas e torneios.
class TournamentDiscoveryPage extends ConsumerStatefulWidget {
  const TournamentDiscoveryPage({super.key});

  @override
  ConsumerState<TournamentDiscoveryPage> createState() =>
      _TournamentDiscoveryPageState();
}

class _TournamentDiscoveryPageState
    extends ConsumerState<TournamentDiscoveryPage> {
  _HubSegment _segment = _HubSegment.all;
  TournamentDiscoveryCategoryFilter _category =
      TournamentDiscoveryCategoryFilter.all;
  bool _openOnly = false;
  bool _searching = false;
  final _searchController = TextEditingController();
  final _searchFocus = FocusNode();

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
                    const SizedBox(height: 14),
                    Text(
                      'Categoria',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: AppColors.onSurfaceMuted,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.6,
                      ),
                    ),
                    const SizedBox(height: 8),
                    for (final f in TournamentDiscoveryCategoryFilter.values)
                      _RadioRow(
                        label: tournamentDiscoveryCategoryFilterLabel(f),
                        selected: tempCategory == f,
                        onTap: () => setSheetState(() => tempCategory = f),
                      ),
                    const SizedBox(height: 8),
                    SwitchListTile(
                      value: tempOpenOnly,
                      onChanged: (v) => setSheetState(() {
                        tempOpenOnly = v;
                      }),
                      contentPadding: EdgeInsets.zero,
                      title: const Text(
                        'Só com inscrição aberta',
                        style: TextStyle(
                          color: AppColors.onSurface,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
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
                            child: const Text('Limpar'),
                          ),
                        ),
                        const SizedBox(width: 10),
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
                            child: const Text('Aplicar'),
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
    final access = ref.watch(tournamentAccessStateProvider);
    final myRegs = ref.watch(myTournamentRegistrationsProvider);
    final regsByTournament = ref.watch(myRegistrationsByTournamentProvider);

    return ColoredBox(
      color: theme.colorScheme.surfaceContainerLowest,
      child: tournamentsAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Não foi possível carregar torneios.\n$e',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge?.copyWith(color: AppColors.live),
            ),
          ),
        ),
        data: (allTournaments) {
          return leaguesAsync.when(
            loading: () => const Center(
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
              final filteredByQuery = filterTournamentsByQuery(filtered, query);
              final leagues = visibleLeaguesForTournaments(
                leagues: allLeagues,
                filteredTournaments: filteredByQuery,
              );
              final leaguesByQuery = filterLeaguesByQuery(leagues, query);
              final standalone = standaloneTournaments(
                leagues: allLeagues,
                filteredTournaments: filteredByQuery,
              );
              final filteredIds = filteredByQuery.map((t) => t.id).toSet();

              return ListView(
                padding: const EdgeInsets.fromLTRB(
                  ArenaDashboardTokens.horizontalPadding,
                  12,
                  ArenaDashboardTokens.horizontalPadding,
                  28,
                ),
                children: [
                  if (!access.canAccess)
                    TournamentAccessBanner(
                      onboardingCompleted: access.onboardingCompleted,
                      profileStepsComplete: access.profileStepsComplete,
                    ),
                  _HubHeader(
                    searching: _searching,
                    controller: _searchController,
                    focusNode: _searchFocus,
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
                  const SizedBox(height: 14),
                  _HubStatsRow(stats: stats),
                  const SizedBox(height: 14),
                  _HubSegmented(
                    value: _segment,
                    onChanged: (s) => setState(() => _segment = s),
                  ),
                  const SizedBox(height: 14),
                  _FilterChips(
                    category: _category,
                    openOnly: _openOnly,
                    onCategoryChanged: (v) => setState(() => _category = v),
                    onOpenOnlyChanged: (v) => setState(() => _openOnly = v),
                  ),
                  const SizedBox(height: 18),
                  if (_segment == _HubSegment.all ||
                      _segment == _HubSegment.leagues) ...[
                    if (leaguesByQuery.isNotEmpty) ...[
                      _SectionTitle(title: 'Ligas'),
                      const SizedBox(height: 10),
                      for (final league in leaguesByQuery) ...[
                        LeagueDiscoveryCard(
                          league: league,
                          tournamentCount: leagueTournamentCount(
                            league,
                            filteredIds,
                          ),
                          enrolled: _leagueHasRegistration(
                            league: league,
                            regs: myRegs.valueOrNull ?? const [],
                          ),
                          open: _leagueHasOpenTournaments(
                            league: league,
                            tournaments: filteredByQuery,
                          ),
                          onTap: () => context.pushNamed(
                            AppRouteNames.leagueDetail,
                            pathParameters: {'leagueId': league.id},
                          ),
                        ),
                        const SizedBox(height: 10),
                      ],
                      const SizedBox(height: 14),
                    ],
                  ],
                  if (_segment == _HubSegment.all ||
                      _segment == _HubSegment.tournaments) ...[
                    _SectionTitle(title: 'Torneios'),
                    const SizedBox(height: 10),
                    if ((_segment == _HubSegment.all
                            ? standalone
                            : filteredByQuery)
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
                          in (_segment == _HubSegment.all
                              ? standalone
                              : filteredByQuery)) ...[
                        TournamentDiscoveryCard(
                          tournament: t,
                          registration: regsByTournament[t.id],
                          onTap: () => context.pushNamed(
                            AppRouteNames.tournamentDetail,
                            pathParameters: {'tournamentId': t.id},
                          ),
                        ),
                        const SizedBox(height: 10),
                      ],
                  ],
                ],
              );
            },
          );
        },
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title});

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

enum _HubSegment { all, tournaments, leagues }

bool _leagueHasRegistration({
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

bool _leagueHasOpenTournaments({
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

class _HubHeader extends StatelessWidget {
  const _HubHeader({
    required this.searching,
    required this.controller,
    required this.focusNode,
    required this.onToggleSearch,
    required this.onOpenFilters,
  });

  final bool searching;
  final TextEditingController controller;
  final FocusNode focusNode;
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
            Expanded(
              child: Text(
                'Competir',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w900,
                  color: AppColors.onSurface,
                  letterSpacing: -0.5,
                ),
              ),
            ),
            _IconSquare(icon: Icons.search_rounded, onTap: onToggleSearch),
            const SizedBox(width: 10),
            _IconSquare(icon: Icons.tune_rounded, onTap: onOpenFilters),
          ],
        ),
        if (searching) ...[
          const SizedBox(height: 12),
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
              prefixIcon: const Icon(
                Icons.search_rounded,
                color: AppColors.onSurfaceMuted,
              ),
              suffixIcon: IconButton(
                onPressed: () => controller.clear(),
                icon: const Icon(
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

class _IconSquare extends StatelessWidget {
  const _IconSquare({required this.icon, required this.onTap});

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

class _RadioRow extends StatelessWidget {
  const _RadioRow({
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
                            decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              color: AppColors.brand,
                            ),
                          ),
                        )
                      : null,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    label,
                    style: const TextStyle(
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

class _HubStatsRow extends StatelessWidget {
  const _HubStatsRow({required this.stats});

  final TournamentHubStats stats;

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: _StatTile(
              label: 'Inscritos',
              value: '${stats.subscriptions}',
              icon: Icons.emoji_events_outlined,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _StatTile(
              label: 'Ao vivo',
              value: '${stats.liveNow}',
              icon: Icons.sensors_rounded,
              accent: AppColors.live,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _StatTile(
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

class _HubSegmented extends StatelessWidget {
  const _HubSegmented({required this.value, required this.onChanged});

  final _HubSegment value;
  final ValueChanged<_HubSegment> onChanged;

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
            _segment(_HubSegment.all, 'Tudo'),
            _segment(_HubSegment.tournaments, 'Torneios'),
            _segment(_HubSegment.leagues, 'Ligas'),
          ],
        ),
      ),
    );
  }

  Widget _segment(_HubSegment segment, String label) {
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

class _StatTile extends StatelessWidget {
  const _StatTile({
    required this.label,
    required this.value,
    required this.icon,
    this.accent,
  });

  /// Altura fixa para até 2 linhas de rótulo — cards alinhados na fileira.
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
        color: AppColors.surfaceCard,
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 12, 10, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 18, color: color),
            const SizedBox(height: 8),
            Text(
              value,
              style: AppTypography.soraRegular(
                fontWeight: FontWeight.w800,
                color: AppColors.onSurface,
                fontSize: 22,
                height: 1.1,
              ),
            ),
            const SizedBox(height: 6),
            SizedBox(
              height: _StatTile._labelAreaHeight,
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

class _FilterChips extends StatelessWidget {
  const _FilterChips({
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
        const SizedBox(height: 12),
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
                          ? const Icon(
                              Icons.check_rounded,
                              size: 16,
                              color: AppColors.black,
                            )
                          : null,
                    ),
                  ),
                  const SizedBox(width: 10),
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
