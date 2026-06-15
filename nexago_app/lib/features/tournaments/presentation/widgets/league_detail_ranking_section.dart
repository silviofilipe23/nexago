import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../ranking/domain/ranking_display_helpers.dart';
import '../../domain/league_ranking_logic.dart';
import '../../domain/league_ranking_models.dart';
import '../../domain/league_ranking_providers.dart';
import '../../domain/tournament_discovery_models.dart';

class LeagueDetailRankingSection extends ConsumerStatefulWidget {
  const LeagueDetailRankingSection({super.key, required this.league});

  final DiscoveryLeague league;

  @override
  ConsumerState<LeagueDetailRankingSection> createState() =>
      _LeagueDetailRankingSectionState();
}

class _LeagueDetailRankingSectionState
    extends ConsumerState<LeagueDetailRankingSection> {
  String? _selectedCategoryId;
  LeagueRankingViewMode _viewMode = LeagueRankingViewMode.teams;

  @override
  void initState() {
    super.initState();
    _selectedCategoryId = _initialCategoryId(widget.league);
  }

  @override
  void didUpdateWidget(covariant LeagueDetailRankingSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.league.id != widget.league.id) {
      _selectedCategoryId = _initialCategoryId(widget.league);
    }
  }

  String? _initialCategoryId(DiscoveryLeague league) {
    if (league.categories.isEmpty) return null;
    return league.categories.first.id;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final categories = widget.league.categories;
    final categoryId = _selectedCategoryId;

    if (categories.isEmpty || categoryId == null) {
      return const SizedBox.shrink();
    }

    final key = (leagueId: widget.league.id, categoryId: categoryId);
    final rowsAsync = _viewMode == LeagueRankingViewMode.teams
        ? ref.watch(leagueCategoryRankingRowsProvider(key))
        : ref.watch(leagueCategoryAthleteRankingRowsProvider(key));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Ranking do circuito',
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          leagueCountingModeLabel(widget.league.countingStagesMode),
          style: theme.textTheme.bodySmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
        const SizedBox(height: 12),
        SegmentedButton<LeagueRankingViewMode>(
          segments: const [
            ButtonSegment(
              value: LeagueRankingViewMode.teams,
              label: Text('Duplas'),
            ),
            ButtonSegment(
              value: LeagueRankingViewMode.athletes,
              label: Text('Atletas'),
            ),
          ],
          selected: {_viewMode},
          onSelectionChanged: (selection) {
            setState(() => _viewMode = selection.first);
          },
        ),
        if (categories.length > 1) ...[
          const SizedBox(height: 12),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final category in categories) ...[
                  ChoiceChip(
                    label: Text(category.name),
                    selected: category.id == categoryId,
                    selectedColor: AppColors.brand.withValues(alpha: 0.18),
                    onSelected: (_) {
                      setState(() => _selectedCategoryId = category.id);
                    },
                  ),
                  const SizedBox(width: 8),
                ],
              ],
            ),
          ),
        ],
        const SizedBox(height: 12),
        rowsAsync.when(
          loading: () => Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            ),
          ),
          error: (error, _) => Text(
            'Não foi possível carregar o ranking.',
            style: theme.textTheme.bodyMedium?.copyWith(color: AppColors.live),
          ),
          data: (rows) {
            if (rows.isEmpty) {
              return Text(
                'O ranking aparece aqui conforme as etapas forem encerradas.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
              );
            }

            if (_viewMode == LeagueRankingViewMode.teams) {
              return Column(
                children: [
                  for (final row in rows.cast<LeagueTeamRankingRow>())
                    _LeagueTeamRankingRow(row: row),
                ],
              );
            }

            return Column(
              children: [
                for (final row in rows.cast<LeagueAthleteRankingRow>())
                  _LeagueAthleteRankingRow(row: row),
              ],
            );
          },
        ),
        const SizedBox(height: 20),
      ],
    );
  }
}

class _LeagueTeamRankingRow extends StatelessWidget {
  const _LeagueTeamRankingRow({required this.row});

  final LeagueTeamRankingRow row;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: context.themeColors.outline.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 28,
            child: Text(
              '#${row.rank}',
              style: AppTypography.mono(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: row.rank <= 3
                    ? AppColors.brand
                    : context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
          Expanded(
            child: Text(
              row.displayName,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                formatRankingPoints(row.effectivePoints),
                style: AppTypography.soraRegular(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: row.rank == 1
                      ? AppColors.brand
                      : context.themeColors.onSurface,
                ),
              ),
              Text(
                row.stagesPlayed == 1
                    ? '1 etapa'
                    : '${row.stagesPlayed} etapas',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _LeagueAthleteRankingRow extends StatelessWidget {
  const _LeagueAthleteRankingRow({required this.row});

  final LeagueAthleteRankingRow row;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: context.themeColors.outline.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 28,
            child: Text(
              '#${row.rank}',
              style: AppTypography.mono(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: row.rank <= 3
                    ? AppColors.brand
                    : context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
          Expanded(
            child: Text(
              row.displayName,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                formatRankingPoints(row.effectivePoints),
                style: AppTypography.soraRegular(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: row.rank == 1
                      ? AppColors.brand
                      : context.themeColors.onSurface,
                ),
              ),
              Text(
                row.stagesPlayed == 1
                    ? '1 etapa'
                    : '${row.stagesPlayed} etapas',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
