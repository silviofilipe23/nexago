import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../ranking/domain/ranking_display_helpers.dart';
import '../../domain/league_detail_logic.dart';
import '../../domain/league_ranking_logic.dart';
import '../../domain/league_ranking_models.dart';
import '../../domain/league_ranking_providers.dart';
import '../../domain/tournament_detail_logic.dart';
import '../../domain/tournament_discovery_models.dart';

class LeagueDetailRankingSection extends ConsumerStatefulWidget {
  const LeagueDetailRankingSection({
    super.key,
    required this.league,
    required this.tournamentsById,
    this.previewLimit,
    this.onViewFullRanking,
  });

  final DiscoveryLeague league;
  final Map<String, DiscoveryTournament> tournamentsById;
  final int? previewLimit;
  final VoidCallback? onViewFullRanking;

  @override
  ConsumerState<LeagueDetailRankingSection> createState() =>
      _LeagueDetailRankingSectionState();
}

class _LeagueDetailRankingSectionState
    extends ConsumerState<LeagueDetailRankingSection> {
  LeagueRankingViewMode _viewMode = LeagueRankingViewMode.teams;
  TournamentGenderCat? _genderFilter;

  @override
  void initState() {
    super.initState();
    _genderFilter = initialLeagueGenderFilter(widget.league.categories);
  }

  @override
  void didUpdateWidget(covariant LeagueDetailRankingSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.league.id != widget.league.id) {
      _genderFilter = initialLeagueGenderFilter(widget.league.categories);
    }
  }

  String? get _categoryId {
    final gender = _genderFilter;
    if (gender == null) return widget.league.categories.firstOrNull?.id;
    return categoryForGender(widget.league.categories, gender)?.id;
  }

  @override
  Widget build(BuildContext context) {
    final categories = widget.league.categories;
    final categoryId = _categoryId;

    if (categories.isEmpty || categoryId == null) {
      return const SizedBox.shrink();
    }

    final key = (leagueId: widget.league.id, categoryId: categoryId);
    final rowsAsync = _viewMode == LeagueRankingViewMode.teams
        ? ref.watch(leagueCategoryRankingRowsProvider(key))
        : ref.watch(leagueCategoryAthleteRankingRowsProvider(key));
    final viewerTeamIds =
        ref.watch(leagueViewerTeamIdsProvider).valueOrNull ?? const {};
    final currentUid = ref.watch(authServiceProvider).currentUser?.uid;
    final progressLabel = leagueCompletedStagesLabel(
      widget.league,
      widget.tournamentsById,
    );
    final entityLabel =
        _viewMode == LeagueRankingViewMode.teams ? 'DUPLA' : 'ATLETA';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'RANKING DO CIRCUITO',
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: AppColors.brand,
                      letterSpacing: 0.6,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    leagueCountingModeLabel(widget.league.countingStagesMode),
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                          height: 1.2,
                        ),
                  ),
                ],
              ),
            ),
            Text(
              progressLabel,
              style: AppTypography.mono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurfaceMuted,
                letterSpacing: 0.3,
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: _ModeChip(
                label: 'Duplas',
                selected: _viewMode == LeagueRankingViewMode.teams,
                onTap: () =>
                    setState(() => _viewMode = LeagueRankingViewMode.teams),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _ModeChip(
                label: 'Atletas',
                selected: _viewMode == LeagueRankingViewMode.athletes,
                onTap: () =>
                    setState(() => _viewMode = LeagueRankingViewMode.athletes),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final gender in TournamentGenderCat.values) ...[
                _GenderChip(
                  label: categoryGenderDisplayLabelFromTag(
                    switch (gender) {
                      TournamentGenderCat.m => 'MASCULINO',
                      TournamentGenderCat.f => 'FEMININO',
                      TournamentGenderCat.mix => 'MISTO',
                    },
                  ),
                  selected: _genderFilter == gender,
                  enabled: categoryForGender(categories, gender) != null,
                  onTap: () => setState(() => _genderFilter = gender),
                ),
                const SizedBox(width: 8),
              ],
            ],
          ),
        ),
        const SizedBox(height: 14),
        rowsAsync.when(
          loading: () => Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            ),
          ),
          error: (_, __) => Text(
            'Não foi possível carregar o ranking.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: AppColors.live,
                ),
          ),
          data: (rows) {
            if (rows.isEmpty) {
              return Text(
                'O ranking aparece aqui conforme as etapas forem encerradas.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                    ),
              );
            }

            final limit = widget.previewLimit;
            final visibleRows = limit != null && limit < rows.length
                ? rows.take(limit).toList()
                : rows;

            return Column(
              children: [
                Container(
                  decoration: BoxDecoration(
                    color: context.themeColors.surfaceCard,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: context.themeColors.outline.withValues(
                        alpha: 0.35,
                      ),
                    ),
                  ),
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
                        child: Row(
                          children: [
                            SizedBox(
                              width: 28,
                              child: Text(
                                '#',
                                style: _headerStyle(context),
                              ),
                            ),
                            Expanded(
                              child: Text(entityLabel, style: _headerStyle(context)),
                            ),
                            Text('PTS', style: _headerStyle(context)),
                          ],
                        ),
                      ),
                      for (var i = 0; i < visibleRows.length; i++) ...[
                        if (i > 0)
                          Divider(
                            height: 1,
                            color: context.themeColors.outline.withValues(
                              alpha: 0.2,
                            ),
                          ),
                        if (_viewMode == LeagueRankingViewMode.teams)
                          _TeamRankingTableRow(
                            row: visibleRows[i] as LeagueTeamRankingRow,
                            highlight: viewerTeamIds.contains(
                              (visibleRows[i] as LeagueTeamRankingRow).teamId,
                            ),
                          )
                        else
                          _AthleteRankingTableRow(
                            row: visibleRows[i] as LeagueAthleteRankingRow,
                            highlight:
                                (visibleRows[i] as LeagueAthleteRankingRow)
                                    .athleteId ==
                                currentUid,
                          ),
                      ],
                    ],
                  ),
                ),
                if (widget.previewLimit != null &&
                    widget.onViewFullRanking != null &&
                    rows.length > widget.previewLimit!) ...[
                  const SizedBox(height: 8),
                  Center(
                    child: TextButton(
                      onPressed: widget.onViewFullRanking,
                      child: Text(
                        'Ver ranking completo →',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: context.themeColors.onSurfaceMuted,
                              fontWeight: FontWeight.w600,
                            ),
                      ),
                    ),
                  ),
                ],
              ],
            );
          },
        ),
      ],
    );
  }

  TextStyle _headerStyle(BuildContext context) {
    return AppTypography.mono(
      fontSize: 10,
      fontWeight: FontWeight.w700,
      color: context.themeColors.onSurfaceMuted,
      letterSpacing: 0.5,
    );
  }
}

class _ModeChip extends StatelessWidget {
  const _ModeChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected
          ? AppColors.brand
          : context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (selected) ...[
                Icon(
                  Icons.check_rounded,
                  size: 16,
                  color: AppColors.black,
                ),
                const SizedBox(width: 6),
              ],
              Text(
                label,
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 14,
                  color: selected
                      ? AppColors.black
                      : context.themeColors.onSurface,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GenderChip extends StatelessWidget {
  const _GenderChip({
    required this.label,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: enabled ? 1 : 0.4,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(999),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: selected
                    ? AppColors.brand
                    : context.themeColors.outline.withValues(alpha: 0.45),
              ),
              color: selected
                  ? AppColors.brand.withValues(alpha: 0.12)
                  : context.themeColors.surfaceRaised,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (selected) ...[
                  Icon(Icons.check_rounded, size: 14, color: AppColors.brand),
                  const SizedBox(width: 4),
                ],
                Text(
                  label,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                    color: selected
                        ? AppColors.brand
                        : context.themeColors.onSurface,
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

class _TeamRankingTableRow extends StatelessWidget {
  const _TeamRankingTableRow({
    required this.row,
    required this.highlight,
  });

  final LeagueTeamRankingRow row;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return _RankingTableRowShell(
      highlight: highlight,
      rank: row.rank,
      name: row.displayName,
      points: formatRankingPoints(row.effectivePoints),
    );
  }
}

class _AthleteRankingTableRow extends StatelessWidget {
  const _AthleteRankingTableRow({
    required this.row,
    required this.highlight,
  });

  final LeagueAthleteRankingRow row;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return _RankingTableRowShell(
      highlight: highlight,
      rank: row.rank,
      name: row.displayName,
      points: formatRankingPoints(row.effectivePoints),
    );
  }
}

class _RankingTableRowShell extends StatelessWidget {
  const _RankingTableRowShell({
    required this.highlight,
    required this.rank,
    required this.name,
    required this.points,
  });

  final bool highlight;
  final int rank;
  final String name;
  final String points;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: highlight
          ? AppColors.brand.withValues(alpha: 0.08)
          : Colors.transparent,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Row(
        children: [
          SizedBox(
            width: 28,
            child: Text(
              '$rank',
              style: AppTypography.mono(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: rank <= 3
                    ? AppColors.brand
                    : context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
          Expanded(
            child: Row(
              children: [
                Flexible(
                  child: Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: context.themeColors.onSurface,
                        ),
                  ),
                ),
                if (highlight) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.brand,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      'VOCÊ',
                      style: AppTypography.mono(
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                        color: AppColors.black,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          Text(
            points,
            style: AppTypography.soraRegular(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: highlight || rank == 1
                  ? AppColors.brand
                  : context.themeColors.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}
