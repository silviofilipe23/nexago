import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../arena/presentation/widgets/arena_dashboard_tokens.dart';
import '../../athlete/domain/tournament_access_providers.dart';
import '../../athlete/presentation/widgets/tournament_access_banner.dart';
import '../domain/tournament_discovery_helpers.dart';
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
  TournamentDiscoveryCategoryFilter _category =
      TournamentDiscoveryCategoryFilter.all;
  bool _openOnly = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tournamentsAsync = ref.watch(discoveryTournamentsProvider);
    final leaguesAsync = ref.watch(discoveryLeaguesProvider);
    final stats = ref.watch(discoveryLiveStatsProvider);
    final access = ref.watch(tournamentAccessStateProvider);

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
              style: theme.textTheme.bodyLarge?.copyWith(
                color: AppColors.live,
              ),
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
              final filtered = filterDiscoveryTournaments(
                tournaments: allTournaments,
                category: _category,
                openOnly: _openOnly,
              );
              final leagues = visibleLeaguesForTournaments(
                leagues: allLeagues,
                filteredTournaments: filtered,
              );
              final standalone = standaloneTournaments(
                leagues: allLeagues,
                filteredTournaments: filtered,
              );
              final filteredIds = filtered.map((t) => t.id).toSet();

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
                  _LiveStatsRow(stats: stats),
                  const SizedBox(height: 18),
                  _FilterChips(
                    category: _category,
                    openOnly: _openOnly,
                    onCategoryChanged: (v) => setState(() => _category = v),
                    onOpenOnlyChanged: (v) => setState(() => _openOnly = v),
                  ),
                  if (leagues.isNotEmpty) ...[
                    const SizedBox(height: 22),
                    _SectionTitle(title: 'Ligas e circuitos'),
                    const SizedBox(height: 10),
                    for (final league in leagues) ...[
                      LeagueDiscoveryCard(
                        league: league,
                        tournamentCount:
                            leagueTournamentCount(league, filteredIds),
                        onTap: () => context.pushNamed(
                          AppRouteNames.leagueDetail,
                          pathParameters: {'leagueId': league.id},
                        ),
                      ),
                      const SizedBox(height: 10),
                    ],
                  ],
                  const SizedBox(height: 8),
                  _SectionTitle(
                    title: leagues.isEmpty ? 'Torneios' : 'Torneios avulsos',
                  ),
                  const SizedBox(height: 10),
                  if (standalone.isEmpty && leagues.isEmpty)
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
                    for (final t in standalone) ...[
                      TournamentDiscoveryCard(
                        tournament: t,
                        onTap: () => context.pushNamed(
                          AppRouteNames.tournamentDetail,
                          pathParameters: {'tournamentId': t.id},
                        ),
                      ),
                      const SizedBox(height: 10),
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

class _LiveStatsRow extends StatelessWidget {
  const _LiveStatsRow({required this.stats});

  final TournamentDiscoveryLiveStats stats;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _StatTile(
            label: 'Torneios ativos',
            value: '${stats.activeTournaments}',
            icon: Icons.emoji_events_outlined,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _StatTile(
            label: 'Ao vivo',
            value: '${stats.matchesLiveNow}',
            icon: Icons.sensors_rounded,
            accent: AppColors.live,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _StatTile(
            label: 'Inscrições abertas',
            value: '${stats.openRegistrations}',
            icon: Icons.how_to_reg_outlined,
          ),
        ),
      ],
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

  final String label;
  final String value;
  final IconData icon;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = accent ?? AppColors.brand;

    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(
        color: AppColors.surfaceCard,
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 18, color: color),
            const SizedBox(height: 8),
            Text(
              value,
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.onSurface,
              ),
            ),
            Text(
              label,
              style: theme.textTheme.labelSmall?.copyWith(
                color: AppColors.onSurfaceMuted,
                fontWeight: FontWeight.w600,
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
                child: FilterChip(
                  label: Text(
                    tournamentDiscoveryCategoryFilterLabel(f),
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: selected
                          ? AppColors.black
                          : AppColors.onSurface,
                    ),
                  ),
                  selected: selected,
                  onSelected: (_) => onCategoryChanged(f),
                  selectedColor: AppColors.brand,
                  backgroundColor: AppColors.surfaceRaised,
                  side: BorderSide(
                    color: selected
                        ? AppColors.brand
                        : AppColors.onSurfaceMuted.withValues(alpha: 0.25),
                  ),
                  showCheckmark: false,
                ),
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 8),
        FilterChip(
          label: Text(
            'Só com inscrição aberta',
            style: TextStyle(
              fontWeight: FontWeight.w700,
              color: openOnly ? AppColors.black : AppColors.onSurface,
            ),
          ),
          selected: openOnly,
          onSelected: onOpenOnlyChanged,
          selectedColor: AppColors.brand,
          backgroundColor: AppColors.surfaceRaised,
          side: BorderSide(
            color: openOnly
                ? AppColors.brand
                : AppColors.onSurfaceMuted.withValues(alpha: 0.25),
          ),
          showCheckmark: false,
        ),
      ],
    );
  }
}
