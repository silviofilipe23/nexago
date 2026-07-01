import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/match_ops/match_ops_providers.dart';
import '../../../domain/tournament_ops/tournament_ops_providers.dart';
import '../../../domain/category_ops/category_ops_models.dart';
import '../../category_ops/widgets/organizer_team_dual_avatars.dart';
import '../../../../tournaments/domain/tournament_match.dart';
import '../../../../tournaments/domain/tournament_match_set.dart';
import '../../../../tournaments/domain/tournament_match_display.dart';
import '../../../../tournaments/domain/tournament_match_card_view_model.dart';

enum OrganizerMatchCardVariant { standard, center }

class OrganizerMatchCard extends ConsumerWidget {
  const OrganizerMatchCard({
    super.key,
    required this.row,
    this.onTap,
    this.trailing,
    this.variant = OrganizerMatchCardVariant.standard,
    this.enriched,
  });

  final OrganizerMatchRow row;
  final VoidCallback? onTap;
  final Widget? trailing;
  final OrganizerMatchCardVariant variant;

  /// Quando omitido, resolve via [organizerMatchCardsByIdProvider].
  final TournamentMatchCardViewModel? enriched;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cardVm =
        enriched ??
        ref
            .watch(organizerMatchCardsByIdProvider(row.match.tournamentId))
            .valueOrNull?[row.match.id];
    final categories =
        ref
            .watch(organizerTournamentDetailProvider(row.match.tournamentId))
            .valueOrNull
            ?.categories ??
        const [];
    final categoryLabel = MatchOpsLogic.categoryCompactLabel(
      categoryId: row.match.categoryId,
      categories: categories,
    );

    return _CenterMatchCard(
      row: row,
      enriched: cardVm,
      categoryLabel: categoryLabel,
      onTap: onTap,
      trailing: variant == OrganizerMatchCardVariant.standard ? trailing : null,
    );
  }
}

enum _MatchCardPhase { live, onCourt, finished, scheduled, unscheduled }

class _MatchCardPresentation {
  const _MatchCardPresentation._({
    required this.phase,
    required this.statusLabel,
    required this.statusColor,
    required this.borderColor,
    required this.showCurrentSetScores,
    required this.showSetsWon,
    required this.showSetColumns,
    required this.courtBadgeAccent,
  });

  final _MatchCardPhase phase;
  final String statusLabel;
  final Color statusColor;
  final Color borderColor;
  final bool showCurrentSetScores;
  final bool showSetsWon;
  final bool showSetColumns;
  final bool courtBadgeAccent;

  factory _MatchCardPresentation.of(
    OrganizerMatchRow row,
    AppThemeColors colors,
  ) {
    final match = row.match;
    if (row.isLive) {
      return _MatchCardPresentation._(
        phase: _MatchCardPhase.live,
        statusLabel: 'AO VIVO',
        statusColor: AppColors.live,
        borderColor: AppColors.live.withValues(alpha: 0.38),
        showCurrentSetScores: true,
        showSetsWon: false,
        showSetColumns: true,
        courtBadgeAccent: true,
      );
    }
    if (row.isFinished) {
      return _MatchCardPresentation._(
        phase: _MatchCardPhase.finished,
        statusLabel: 'ENCERRADA',
        statusColor: AppColors.win,
        borderColor: colors.onSurfaceMuted.withValues(alpha: 0.14),
        showCurrentSetScores: false,
        showSetsWon: true,
        showSetColumns: true,
        courtBadgeAccent: false,
      );
    }
    if (match.isOnCourt) {
      return _MatchCardPresentation._(
        phase: _MatchCardPhase.onCourt,
        statusLabel: 'EM QUADRA',
        statusColor: AppColors.brand,
        borderColor: AppColors.brand.withValues(alpha: 0.38),
        showCurrentSetScores: true,
        showSetsWon: false,
        showSetColumns: match.sets.isNotEmpty,
        courtBadgeAccent: true,
      );
    }
    final hasCourt = match.effectiveCourtLabel.trim().isNotEmpty;
    final hasSchedule = match.scheduleTime != null;
    if (!hasCourt && !hasSchedule) {
      return _MatchCardPresentation._(
        phase: _MatchCardPhase.unscheduled,
        statusLabel: 'A PROGRAMAR',
        statusColor: colors.onSurfaceMuted,
        borderColor: colors.onSurfaceMuted.withValues(alpha: 0.14),
        showCurrentSetScores: false,
        showSetsWon: false,
        showSetColumns: false,
        courtBadgeAccent: false,
      );
    }
    return _MatchCardPresentation._(
      phase: _MatchCardPhase.scheduled,
      statusLabel: 'AGENDADA',
      statusColor: AppColors.pending,
      borderColor: colors.onSurfaceMuted.withValues(alpha: 0.14),
      showCurrentSetScores: false,
      showSetsWon: false,
      showSetColumns: false,
      courtBadgeAccent: false,
    );
  }
}

class _CenterMatchCard extends StatelessWidget {
  const _CenterMatchCard({
    required this.row,
    required this.categoryLabel,
    this.enriched,
    this.onTap,
    this.trailing,
  });

  final OrganizerMatchRow row;
  final String categoryLabel;
  final TournamentMatchCardViewModel? enriched;
  final VoidCallback? onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final match = row.match;
    final presentation = _MatchCardPresentation.of(row, context.themeColors);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
      child: Material(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: presentation.borderColor),
            ),
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        _matchMetaLabel(match, categoryLabel: categoryLabel),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.mono(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: context.themeColors.onSurfaceMuted,
                          letterSpacing: 0.4,
                        ),
                      ),
                    ),
                    _MatchStatusBadge(presentation: presentation),
                  ],
                ),
                const SizedBox(height: 10),
                Divider(
                  height: 1,
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.12,
                  ),
                ),
                const SizedBox(height: 12),
                _CenterTeamRow(
                  teamLabel: _teamDisplayLabel(
                    match: match,
                    sideA: true,
                    enrichedTeam: enriched?.teamA,
                  ),
                  players: enriched != null
                      ? MatchOpsLogic.teamPlayersFromCardTeam(
                          team: enriched!.teamA,
                          teamId: match.teamAId,
                        )
                      : null,
                  seed: _teamSeed(match, sideA: true),
                  isServing: _isServing(match, sideA: true),
                  primaryScore: _primaryScore(
                    match,
                    sideA: true,
                    presentation: presentation,
                  ),
                  primaryScoreIsWin:
                      presentation.showSetsWon &&
                      _setsWon(match, sideA: true) >
                          _setsWon(match, sideA: false),
                ),
                const SizedBox(height: 10),
                _CenterTeamRow(
                  teamLabel: _teamDisplayLabel(
                    match: match,
                    sideA: false,
                    enrichedTeam: enriched?.teamB,
                  ),
                  players: enriched != null
                      ? MatchOpsLogic.teamPlayersFromCardTeam(
                          team: enriched!.teamB,
                          teamId: match.teamBId,
                        )
                      : null,
                  seed: _teamSeed(match, sideA: false),
                  isServing: _isServing(match, sideA: false),
                  primaryScore: _primaryScore(
                    match,
                    sideA: false,
                    presentation: presentation,
                  ),
                  primaryScoreIsWin:
                      presentation.showSetsWon &&
                      _setsWon(match, sideA: false) >
                          _setsWon(match, sideA: true),
                ),
                const SizedBox(height: 12),
                _MatchCardFooter(row: row, presentation: presentation),
                if (trailing != null) ...[
                  const SizedBox(height: 10),
                  trailing!,
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _matchMetaLabel(
    TournamentMatch match, {
    required String categoryLabel,
  }) {
    final parts = <String>[];
    final category = categoryLabel.trim();
    final round = matchRoundLabel(match).toUpperCase();
    final matchNumber = matchNumberLabelForCard(match).toUpperCase();
    if (matchNumber.isNotEmpty) parts.add(matchNumber);
    if (category.isNotEmpty) parts.add(category);
    if (round.isNotEmpty) parts.add(round);

    if (parts.isEmpty) return '';
    return parts.join(' · ');
  }

  String _teamDisplayLabel({
    required TournamentMatch match,
    required bool sideA,
    TournamentMatchCardTeamViewModel? enrichedTeam,
  }) {
    final enrichedName = enrichedTeam?.displayName.trim() ?? '';
    if (enrichedName.isNotEmpty &&
        enrichedName != 'Equipe A' &&
        enrichedName != 'Equipe B') {
      return enrichedName;
    }
    return _teamLabel(
      sideA ? match.teamADescription : match.teamBDescription,
      sideA ? match.teamAId : match.teamBId,
    );
  }

  String _teamLabel(String? description, String teamId) {
    final desc = description?.trim();
    if (desc != null && desc.isNotEmpty) return desc;
    if (teamId.trim().isNotEmpty) return teamId.trim();
    return 'A definir';
  }

  bool _isServing(TournamentMatch match, {required bool sideA}) {
    final servingId = match.servingTeamId.trim();
    if (servingId.isEmpty) return sideA;
    return sideA ? servingId == match.teamAId : servingId == match.teamBId;
  }

  int? _teamSeed(TournamentMatch match, {required bool sideA}) {
    final desc = sideA ? match.teamADescription : match.teamBDescription;
    return _seedFromDescription(desc);
  }

  int? _seedFromDescription(String? description) {
    final d = description?.trim() ?? '';
    if (d.isEmpty) return null;
    final leading = RegExp(r'^(\d+)').firstMatch(d);
    if (leading != null) return int.tryParse(leading.group(1)!);
    final hash = RegExp(r'#\s*(\d+)').firstMatch(d);
    if (hash != null) return int.tryParse(hash.group(1)!);
    return null;
  }

  int _setsWon(TournamentMatch match, {required bool sideA}) {
    var wins = 0;
    for (final set in match.sets) {
      if (sideA && set.a > set.b) wins++;
      if (!sideA && set.b > set.a) wins++;
    }
    if (match.sets.isEmpty) {
      final raw = sideA ? match.resultA : match.resultB;
      return int.tryParse(raw.trim()) ?? 0;
    }
    return wins;
  }

  int? _primaryScore(
    TournamentMatch match, {
    required bool sideA,
    required _MatchCardPresentation presentation,
  }) {
    if (presentation.showSetsWon) {
      return _setsWon(match, sideA: sideA);
    }
    if (presentation.showCurrentSetScores) {
      return _currentSetScore(match, sideA: sideA);
    }
    return null;
  }

  int _currentSetScore(TournamentMatch match, {required bool sideA}) {
    final idx =
        match.currentSetIndex ??
        (match.sets.isEmpty ? 0 : match.sets.length - 1);
    if (match.sets.isEmpty || idx < 0 || idx >= match.sets.length) return 0;
    final set = match.sets[idx];
    return sideA ? set.a : set.b;
  }
}

class _MatchStatusBadge extends StatelessWidget {
  const _MatchStatusBadge({required this.presentation});

  final _MatchCardPresentation presentation;

  @override
  Widget build(BuildContext context) {
    final showDot =
        presentation.phase == _MatchCardPhase.live ||
        presentation.phase == _MatchCardPhase.onCourt;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: presentation.statusColor.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: presentation.statusColor.withValues(alpha: 0.28),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (showDot) ...[
            Container(
              width: 5,
              height: 5,
              decoration: BoxDecoration(
                color: presentation.statusColor,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 4),
          ],
          Text(
            presentation.statusLabel,
            style: AppTypography.mono(
              color: presentation.statusColor,
              fontSize: 9,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _CenterTeamRow extends StatelessWidget {
  const _CenterTeamRow({
    required this.teamLabel,
    required this.isServing,
    this.players,
    this.seed,
    this.primaryScore,
    this.primaryScoreIsWin = false,
  });

  final String teamLabel;
  final bool isServing;
  final (OrganizerCategoryPlayerInfo, OrganizerCategoryPlayerInfo)? players;
  final int? seed;
  final int? primaryScore;
  final bool primaryScoreIsWin;

  @override
  Widget build(BuildContext context) {
    final avatarPlayers = players ?? _playersFromTeamLabel(teamLabel);
    final displayLabel = _displayLabel(teamLabel, avatarPlayers);

    return Row(
      children: [
        OrganizerTeamDualAvatars(
          player1: avatarPlayers.$1,
          player2: avatarPlayers.$2,
          avatarSize: 28,
          overlapRingColor: context.themeColors.surfaceRaised,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Row(
            children: [
              Flexible(
                child: Text(
                  displayLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ),
              if (seed != null) ...[
                const SizedBox(width: 8),
                Text(
                  '#$seed',
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: AppColors.brand,
                  ),
                ),
              ],
              if (isServing) ...[
                const SizedBox(width: 6),
                Container(
                  width: 6,
                  height: 6,
                  decoration: const BoxDecoration(
                    color: AppColors.brand,
                    shape: BoxShape.circle,
                  ),
                ),
              ],
            ],
          ),
        ),
        if (primaryScore != null)
          Text(
            '$primaryScore',
            style: AppTypography.mono(
              fontSize: 28,
              fontWeight: FontWeight.w800,
              color: primaryScoreIsWin
                  ? AppColors.win
                  : context.themeColors.onSurface,
              height: 1,
            ),
          ),
      ],
    );
  }

  String _displayLabel(
    String fallback,
    (OrganizerCategoryPlayerInfo, OrganizerCategoryPlayerInfo) players,
  ) {
    final n1 = players.$1.name.trim();
    final n2 = players.$2.name.trim();
    if (n1.isNotEmpty && n2.isNotEmpty) return '$n1 / $n2';
    if (n1.isNotEmpty) return n1;
    if (n2.isNotEmpty) return n2;
    return fallback;
  }

  (OrganizerCategoryPlayerInfo, OrganizerCategoryPlayerInfo)
  _playersFromTeamLabel(String teamLabel) {
    final names = teamLabel
        .split('/')
        .map((p) => p.trim())
        .where((p) => p.isNotEmpty)
        .toList();
    final key = teamLabel.hashCode;

    OrganizerCategoryPlayerInfo playerAt(int index, String name) {
      return OrganizerCategoryPlayerInfo(uid: 'match-$key-$index', name: name);
    }

    if (names.isEmpty) {
      return (playerAt(0, '?'), playerAt(1, ''));
    }
    if (names.length == 1) {
      return (playerAt(0, names.first), playerAt(1, ''));
    }
    return (playerAt(0, names[0]), playerAt(1, names[1]));
  }
}

class _MatchCardFooter extends StatelessWidget {
  const _MatchCardFooter({required this.row, required this.presentation});

  final OrganizerMatchRow row;
  final _MatchCardPresentation presentation;

  @override
  Widget build(BuildContext context) {
    final match = row.match;
    final court = match.effectiveCourtLabel.trim();
    final time = _formatScheduleTime(match.scheduleTime);
    final elapsed = row.isLive ? _elapsedLabel(match) : null;
    final scheduleHint = _scheduleHint(match, presentation.phase);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 10,
            runSpacing: 4,
            children: [
              if (presentation.phase == _MatchCardPhase.unscheduled)
                Text(
                  'Sem quadra —',
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                )
              else ...[
                if (court.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: presentation.courtBadgeAccent
                          ? AppColors.brand.withValues(alpha: 0.08)
                          : context.themeColors.onSurfaceMuted.withValues(
                              alpha: 0.08,
                            ),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                        color: presentation.courtBadgeAccent
                            ? AppColors.brand.withValues(alpha: 0.45)
                            : context.themeColors.onSurfaceMuted.withValues(
                                alpha: 0.18,
                              ),
                      ),
                    ),
                    child: Text(
                      '# $court',
                      style: AppTypography.mono(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: presentation.courtBadgeAccent
                            ? AppColors.brand
                            : context.themeColors.onSurfaceMuted,
                      ),
                    ),
                  ),
                if (time != '--:--')
                  Text(
                    time,
                    style: AppTypography.mono(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: context.themeColors.onSurfaceMuted,
                    ),
                  ),
                if (elapsed != null)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 5,
                        height: 5,
                        decoration: const BoxDecoration(
                          color: AppColors.live,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        elapsed,
                        style: AppTypography.mono(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: AppColors.live,
                        ),
                      ),
                    ],
                  ),
              ],
            ],
          ),
        ),
        // if (scheduleHint != null)
        //   Text(
        //     scheduleHint,
        //     style: AppTypography.mono(
        //       fontSize: 10,
        //       fontWeight: FontWeight.w600,
        //       color: context.themeColors.onSurfaceMuted,
        //     ),
        //   )
        // else if (presentation.showSetColumns && match.sets.isNotEmpty)
        //   _SetScoreColumns(
        //     match: match,
        //     highlightCurrent:
        //         presentation.phase == _MatchCardPhase.live ||
        //         presentation.phase == _MatchCardPhase.onCourt,
        //   ),
      ],
    );
  }

  String? _scheduleHint(TournamentMatch match, _MatchCardPhase phase) {
    if (phase != _MatchCardPhase.scheduled) return null;
    final desc = match.description?.trim();
    if (desc != null && desc.isNotEmpty) return desc;
    if (match.isWaitingQueue && match.effectiveCourtLabel.isNotEmpty) {
      return 'Após ${match.effectiveCourtLabel} atual';
    }
    return null;
  }

  String _formatScheduleTime(DateTime? time) {
    if (time == null) return '--:--';
    final local = toNexagoEventLocal(time);
    final h = local.hour.toString().padLeft(2, '0');
    final m = local.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  String? _elapsedLabel(TournamentMatch match) {
    if (match.matchStartedAt != null) {
      final sec = MatchScoringLogic.elapsedSecondsFromStart(
        match.matchStartedAt,
        DateTime.now(),
      );
      return MatchScoringLogic.formatElapsedMmSs(sec);
    }
    if (match.liveElapsedSec > 0) {
      return MatchScoringLogic.formatElapsedMmSs(match.liveElapsedSec);
    }
    return null;
  }
}

class _SetScoreColumns extends StatelessWidget {
  const _SetScoreColumns({required this.match, required this.highlightCurrent});

  final TournamentMatch match;
  final bool highlightCurrent;

  @override
  Widget build(BuildContext context) {
    final sets = match.sets;
    if (sets.isEmpty) return const SizedBox.shrink();

    final currentIdx = match.currentSetIndex ?? sets.length - 1;

    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        for (var i = 0; i < sets.length; i++) ...[
          if (i > 0) const SizedBox(width: 6),
          _SetColumn(
            set: sets[i],
            isCurrent: highlightCurrent && i == currentIdx,
            teamAWon: sets[i].a > sets[i].b,
          ),
        ],
      ],
    );
  }
}

class _SetColumn extends StatelessWidget {
  const _SetColumn({
    required this.set,
    required this.isCurrent,
    required this.teamAWon,
  });

  final TournamentMatchSet set;
  final bool isCurrent;
  final bool teamAWon;

  @override
  Widget build(BuildContext context) {
    final borderColor = isCurrent
        ? AppColors.live.withValues(alpha: 0.35)
        : Colors.transparent;
    final bg = isCurrent
        ? AppColors.live.withValues(alpha: 0.06)
        : Colors.transparent;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: borderColor),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '${set.a}',
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: isCurrent
                  ? context.themeColors.onSurface
                  : teamAWon
                  ? AppColors.win
                  : context.themeColors.onSurfaceMuted,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            '${set.b}',
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: isCurrent
                  ? context.themeColors.onSurface
                  : !teamAWon && set.b > set.a
                  ? AppColors.win
                  : context.themeColors.onSurfaceMuted,
            ),
          ),
        ],
      ),
    );
  }
}

/// Badge de status exportado para outros contextos (fila, etc.).
class OrganizerMatchStatusBadge extends StatelessWidget {
  const OrganizerMatchStatusBadge({super.key, required this.row});

  final OrganizerMatchRow row;

  @override
  Widget build(BuildContext context) {
    final presentation = _MatchCardPresentation.of(row, context.themeColors);
    return _MatchStatusBadge(presentation: presentation);
  }
}

class OrganizerCourtStatusChip extends StatelessWidget {
  const OrganizerCourtStatusChip({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        border: Border.all(color: context.themeColors.outline),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(label, style: Theme.of(context).textTheme.labelSmall),
    );
  }
}

class OrganizerCourtKpiRow extends StatelessWidget {
  const OrganizerCourtKpiRow({super.key, required this.kpis});

  final CourtPanelKpis kpis;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _KpiTile(label: 'Quadras', value: '${kpis.totalCourts}'),
        _KpiTile(label: 'Ao vivo', value: '${kpis.activeCourts}'),
        _KpiTile(label: 'Livres', value: '${kpis.freeCourts}'),
        _KpiTile(label: 'Fila', value: '${kpis.waitingQueue}'),
      ],
    );
  }
}

class _KpiTile extends StatelessWidget {
  const _KpiTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              color: AppColors.brand,
              fontWeight: FontWeight.bold,
            ),
          ),
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
        ],
      ),
    );
  }
}
