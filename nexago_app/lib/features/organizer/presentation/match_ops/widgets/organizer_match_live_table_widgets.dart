import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../tournaments/domain/tournament_match.dart';
import '../../../../tournaments/domain/tournament_match_card_view_model.dart';
import '../../../../tournaments/domain/tournament_match_display.dart';
import '../../../../tournaments/domain/tournament_match_point_event.dart';
import '../../../../tournaments/domain/tournament_match_set.dart';
import '../../../domain/category_ops/category_ops_models.dart';
import '../../../domain/match_ops/match_ops_logic.dart';
import '../../../domain/match_ops/match_scoring_logic.dart';
import '../../category_ops/widgets/organizer_team_dual_avatars.dart';

/// Dados de exibição de uma dupla na mesa ao vivo.
class LiveTableTeamData {
  const LiveTableTeamData({
    required this.label,
    required this.player1,
    required this.player2,
  });

  final String label;
  final OrganizerCategoryPlayerInfo player1;
  final OrganizerCategoryPlayerInfo player2;
}

class LiveTableHeader extends StatelessWidget {
  const LiveTableHeader({
    super.key,
    required this.courtLabel,
    required this.titleLabel,
    required this.elapsedLabel,
    required this.onBack,
  });

  final String courtLabel;
  final String titleLabel;
  final String elapsedLabel;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final court = courtLabel.trim().isNotEmpty ? courtLabel.trim() : '—';
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _LiveTableIconButton(
            icon: Icons.arrow_back_ios_new_rounded,
            onPressed: onBack,
          ),
          Expanded(
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _LiveDot(color: AppColors.live),
                    const SizedBox(width: 6),
                    Text(
                      'MESA AO VIVO',
                      style: AppTypography.mono(
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                        color: AppColors.live,
                        letterSpacing: 0.8,
                      ),
                    ),
                    const SizedBox(width: 6),
                    _LiveDot(color: AppColors.live),
                    const SizedBox(width: 6),
                    Text(
                      court,
                      style: AppTypography.mono(
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                        color: AppColors.live,
                        letterSpacing: 0.8,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  titleLabel,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                    height: 1.2,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            elapsedLabel,
            style: AppTypography.mono(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: AppColors.live,
            ),
          ),
        ],
      ),
    );
  }
}

class _LiveDot extends StatelessWidget {
  const _LiveDot({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 5,
      height: 5,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    );
  }
}

class _LiveTableIconButton extends StatelessWidget {
  const _LiveTableIconButton({required this.icon, required this.onPressed});

  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(icon, size: 18, color: context.themeColors.onSurface),
        ),
      ),
    );
  }
}

class LiveTableSetStrip extends StatelessWidget {
  const LiveTableSetStrip({
    super.key,
    required this.sets,
    required this.currentSetIndex,
    this.bestOf = MatchScoringLogic.defaultBestOf,
  });

  final List<TournamentMatchSet> sets;
  final int currentSetIndex;
  final int bestOf;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          for (var index = 0; index < bestOf; index++) ...[
            if (index > 0) const SizedBox(width: 8),
            Expanded(
              child: _SetStripCard(
                index: index,
                set: index < sets.length ? sets[index] : null,
                isActive: index == currentSetIndex,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _SetStripCard extends StatelessWidget {
  const _SetStripCard({
    required this.index,
    required this.set,
    required this.isActive,
  });

  final int index;
  final TournamentMatchSet? set;
  final bool isActive;

  @override
  Widget build(BuildContext context) {
    final hasStarted = set != null && (set!.a > 0 || set!.b > 0);
    final scoreA = hasStarted ? set!.a : null;
    final scoreB = hasStarted ? set!.b : null;
    final aWins = hasStarted && scoreA! > scoreB!;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isActive
              ? AppColors.live.withValues(alpha: 0.55)
              : context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        children: [
          Text(
            'SET ${index + 1}',
            style: AppTypography.mono(
              fontSize: 9,
              fontWeight: FontWeight.w800,
              color: isActive ? AppColors.live : context.themeColors.onSurfaceMuted,
              letterSpacing: 0.4,
            ),
          ),
          const SizedBox(height: 6),
          if (!hasStarted)
            Text(
              '– · –',
              style: AppTypography.mono(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurfaceMuted,
              ),
            )
          else
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  '$scoreA',
                  style: AppTypography.mono(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: aWins ? AppColors.win : context.themeColors.onSurface,
                  ),
                ),
                Text(
                  ' – ',
                  style: AppTypography.mono(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
                Text(
                  '$scoreB',
                  style: AppTypography.mono(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: !aWins && scoreB! > scoreA!
                        ? AppColors.win
                        : context.themeColors.onSurface,
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class LiveTableTeamScoreBoard extends StatelessWidget {
  const LiveTableTeamScoreBoard({
    super.key,
    required this.teamA,
    required this.teamB,
    required this.scoreA,
    required this.scoreB,
    required this.isServingA,
    required this.isServingB,
    required this.onAddPointA,
    required this.onAddPointB,
    this.onSubtractA,
    this.onSubtractB,
    this.seedA,
    this.seedB,
    this.enabled = true,
  });

  final LiveTableTeamData teamA;
  final LiveTableTeamData teamB;
  final int scoreA;
  final int scoreB;
  final bool isServingA;
  final bool isServingB;
  final VoidCallback? onAddPointA;
  final VoidCallback? onAddPointB;
  final VoidCallback? onSubtractA;
  final VoidCallback? onSubtractB;
  final int? seedA;
  final int? seedB;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
      child: Row(
        children: [
          Expanded(
            child: LiveTableTeamScoreCard(
              team: teamA,
              score: scoreA,
              isServing: isServingA,
              seed: seedA,
              enabled: enabled,
              onAddPoint: onAddPointA,
              onSubtract: onSubtractA,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: LiveTableTeamScoreCard(
              team: teamB,
              score: scoreB,
              isServing: isServingB,
              seed: seedB,
              enabled: enabled,
              onAddPoint: onAddPointB,
              onSubtract: onSubtractB,
            ),
          ),
        ],
      ),
    );
  }
}

class LiveTableTeamScoreCard extends StatelessWidget {
  const LiveTableTeamScoreCard({
    super.key,
    required this.team,
    required this.score,
    required this.isServing,
    this.seed,
    this.onAddPoint,
    this.onSubtract,
    this.enabled = true,
  });

  final LiveTableTeamData team;
  final int score;
  final bool isServing;
  final int? seed;
  final VoidCallback? onAddPoint;
  final VoidCallback? onSubtract;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isServing
              ? AppColors.brand.withValues(alpha: 0.55)
              : context.themeColors.onSurfaceMuted.withValues(alpha: 0.14),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (isServing)
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 5,
                  height: 5,
                  decoration: const BoxDecoration(
                    color: AppColors.brand,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 5),
                Text(
                  'SAQUE',
                  style: AppTypography.mono(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    color: AppColors.brand,
                    letterSpacing: 0.6,
                  ),
                ),
              ],
            )
          else
            const SizedBox(height: 14),
          const SizedBox(height: 6),
          Row(
            children: [
              OrganizerTeamDualAvatars(
                player1: team.player1,
                player2: team.player2,
                avatarSize: 26,
                overlapRingColor: context.themeColors.surfaceRaised,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  team.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ),
            ],
          ),
          if (seed != null) ...[
            const SizedBox(height: 4),
            Text(
              'cabeça #$seed',
              style: AppTypography.mono(
                fontSize: 9,
                fontWeight: FontWeight.w700,
                color: AppColors.brand,
              ),
            ),
          ],
          const SizedBox(height: 12),
          Text(
            '$score',
            textAlign: TextAlign.center,
            style: AppTypography.mono(
              fontSize: 44,
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
              height: 1,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _ScoreControlButton(
                icon: Icons.remove_rounded,
                filled: false,
                enabled: enabled,
                onPressed: onSubtract,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _ScoreControlButton(
                  icon: Icons.add_rounded,
                  filled: true,
                  enabled: enabled,
                  onPressed: onAddPoint,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ScoreControlButton extends StatelessWidget {
  const _ScoreControlButton({
    required this.icon,
    required this.filled,
    required this.enabled,
    this.onPressed,
  });

  final IconData icon;
  final bool filled;
  final bool enabled;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final height = filled ? 44.0 : 36.0;
    final width = filled ? null : 36.0;

    return SizedBox(
      width: width,
      height: height,
      child: Material(
        color: filled
            ? (enabled ? AppColors.brand : AppColors.brand.withValues(alpha: 0.35))
            : context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: enabled ? onPressed : null,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: filled
                  ? null
                  : Border.all(
                      color: context.themeColors.onSurfaceMuted.withValues(
                        alpha: 0.22,
                      ),
                    ),
            ),
            alignment: Alignment.center,
            child: Icon(
              icon,
              size: filled ? 22 : 18,
              color: filled ? AppColors.black : context.themeColors.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}

class LiveTableSetRules extends StatelessWidget {
  const LiveTableSetRules({
    super.key,
    required this.rulesLabel,
    this.setPointHint,
  });

  final String rulesLabel;
  final String? setPointHint;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
      child: Text.rich(
        TextSpan(
          style: AppTypography.mono(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: context.themeColors.onSurfaceMuted,
          ),
          children: [
            TextSpan(text: rulesLabel),
            if (setPointHint != null) ...[
              const TextSpan(text: ' · '),
              TextSpan(
                text: setPointHint,
                style: const TextStyle(
                  color: AppColors.brand,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ],
        ),
        textAlign: TextAlign.center,
      ),
    );
  }
}

class LiveTableActionBar extends StatelessWidget {
  const LiveTableActionBar({
    super.key,
    required this.onUndo,
    required this.onSwapServe,
    this.onHistory,
    this.enabled = true,
  });

  final VoidCallback? onUndo;
  final VoidCallback? onSwapServe;
  final VoidCallback? onHistory;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final mutedBorder = context.themeColors.onSurfaceMuted.withValues(
      alpha: 0.14,
    );

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Row(
        children: [
          Expanded(
            child: _ActionBarButton(
              label: 'Desfazer',
              icon: Icons.undo_rounded,
              enabled: enabled,
              onPressed: onUndo,
              borderColor: mutedBorder,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _ActionBarButton(
              label: 'Trocar saque',
              icon: Icons.circle,
              iconColor: AppColors.brand,
              enabled: enabled,
              onPressed: onSwapServe,
              borderColor: mutedBorder,
            ),
          ),
          const SizedBox(width: 8),
          _LiveTableIconButton(
            icon: Icons.schedule_rounded,
            onPressed: enabled ? (onHistory ?? () {}) : () {},
          ),
        ],
      ),
    );
  }
}

class _ActionBarButton extends StatelessWidget {
  const _ActionBarButton({
    required this.label,
    required this.icon,
    required this.enabled,
    required this.onPressed,
    required this.borderColor,
    this.iconColor,
  });

  final String label;
  final IconData icon;
  final bool enabled;
  final VoidCallback? onPressed;
  final Color borderColor;
  final Color? iconColor;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: enabled ? onPressed : null,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          height: 44,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: borderColor),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: icon == Icons.circle ? 8 : 16,
                color: iconColor ?? context.themeColors.onSurfaceMuted,
              ),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class LiveTablePointFeed extends StatelessWidget {
  const LiveTablePointFeed({
    super.key,
    required this.setIndex,
    required this.events,
    required this.teamA,
    required this.teamB,
  });

  final int setIndex;
  final List<TournamentMatchPointEvent> events;
  final LiveTableTeamData teamA;
  final LiveTableTeamData teamB;

  @override
  Widget build(BuildContext context) {
    final filtered = events
        .where((e) => e.setIndex == setIndex)
        .where((e) => e.isPoint || e.isUndoPoint)
        .toList()
        .reversed
        .take(8)
        .toList();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'ÚLTIMOS PONTOS · SET ${setIndex + 1}',
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 10),
          if (filtered.isEmpty)
            Text(
              'Nenhum ponto registrado neste set.',
              style: AppTypography.soraRegular(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: context.themeColors.onSurfaceMuted,
              ),
            )
          else
            for (final event in filtered)
              _PointFeedRow(
                event: event,
                team: _teamForEvent(event),
                isSideA: event.side?.trim().toUpperCase() != 'B',
              ),
        ],
      ),
    );
  }

  LiveTableTeamData _teamForEvent(TournamentMatchPointEvent event) {
    final side = event.side?.trim().toUpperCase();
    if (side == 'B') return teamB;
    return teamA;
  }
}

class _PointFeedRow extends StatelessWidget {
  const _PointFeedRow({
    required this.event,
    required this.team,
    required this.isSideA,
  });

  final TournamentMatchPointEvent event;
  final LiveTableTeamData team;
  final bool isSideA;

  @override
  Widget build(BuildContext context) {
    final playerName = team.player1.name.trim().isNotEmpty
        ? team.player1.name.trim().split(' ').first
        : team.label.split('/').first.trim();
    final actionLabel = event.isUndoPoint ? 'Desfeito' : 'Ponto';
    final description = playerName.isNotEmpty
        ? '$actionLabel · $playerName'
        : actionLabel;
    final dotColor =
        isSideA ? AppColors.brand : context.themeColors.onSurfaceMuted;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(
              color: dotColor,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 10),
          Text(
            '${event.scoreA}-${event.scoreB}',
            style: AppTypography.mono(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              description,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.soraRegular(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
          Text(
            MatchScoringLogic.formatPointEventTime(event.ts),
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
        ],
      ),
    );
  }
}

/// Helpers para montar labels da mesa ao vivo.
String liveTableTeamLabel(String? description, String teamId) {
  final desc = description?.trim();
  if (desc != null && desc.isNotEmpty) return desc;
  final id = teamId.trim();
  return id.isNotEmpty ? id : 'A definir';
}

LiveTableTeamData liveTableTeamData({
  required TournamentMatch match,
  required bool sideA,
  TournamentMatchCardTeamViewModel? enrichedTeam,
}) {
  final teamId = sideA ? match.teamAId : match.teamBId;
  final fallbackLabel = liveTableTeamLabel(
    sideA ? match.teamADescription : match.teamBDescription,
    teamId,
  );
  final label = _liveTableEnrichedTeamLabel(enrichedTeam, fallbackLabel);
  final players = enrichedTeam != null
      ? MatchOpsLogic.teamPlayersFromCardTeam(
          team: enrichedTeam,
          teamId: teamId,
        )
      : _liveTablePlayersFromLabel(fallbackLabel, teamId);

  return LiveTableTeamData(
    label: label,
    player1: players.$1,
    player2: players.$2,
  );
}

LiveTableTeamData liveTableServingTeamData(
  TournamentMatch match,
  TournamentMatchCardViewModel? enriched,
) {
  final servingId = match.servingTeamId.trim();
  if (servingId.isNotEmpty && servingId == match.teamBId) {
    return liveTableTeamData(
      match: match,
      sideA: false,
      enrichedTeam: enriched?.teamB,
    );
  }
  return liveTableTeamData(
    match: match,
    sideA: true,
    enrichedTeam: enriched?.teamA,
  );
}

String liveTableTitleLabel({
  required TournamentMatch match,
  required String categoryLabel,
}) {
  final parts = <String>[];
  final category = categoryLabel.trim();
  if (category.isNotEmpty) parts.add(category);
  final round = matchRoundLabel(match);
  if (round.isNotEmpty) parts.add(round);
  return parts.isNotEmpty ? parts.join(' · ') : 'Partida';
}

String liveTableMetaLabel({
  required TournamentMatch match,
  required String categoryLabel,
}) {
  final parts = <String>[];
  final matchNumber = matchNumberLabelForCard(match);
  if (matchNumber.isNotEmpty) parts.add(matchNumber);
  final category = categoryLabel.trim();
  if (category.isNotEmpty) parts.add(category);
  final round = matchRoundLabel(match);
  if (round.isNotEmpty) parts.add(round);
  return parts.isNotEmpty ? parts.join(' · ') : 'Partida';
}

String _liveTableEnrichedTeamLabel(
  TournamentMatchCardTeamViewModel? enrichedTeam,
  String fallback,
) {
  final enrichedName = enrichedTeam?.displayName.trim() ?? '';
  if (enrichedName.isNotEmpty &&
      enrichedName != 'Equipe A' &&
      enrichedName != 'Equipe B') {
    return enrichedName;
  }
  return fallback;
}

(OrganizerCategoryPlayerInfo, OrganizerCategoryPlayerInfo)
    _liveTablePlayersFromLabel(String teamLabel, String teamId) {
  final names = teamLabel
      .split('/')
      .map((p) => p.trim())
      .where((p) => p.isNotEmpty)
      .toList();
  final key = teamLabel.hashCode;
  final id = teamId.trim();

  OrganizerCategoryPlayerInfo at(int index, String name) {
    return OrganizerCategoryPlayerInfo(
      uid: id.isEmpty ? 'live-$key-$index' : '$id-$index',
      name: name,
    );
  }

  if (names.isEmpty) {
    return (at(0, '?'), at(1, ''));
  }
  if (names.length == 1) {
    return (at(0, names.first), at(1, ''));
  }
  return (at(0, names[0]), at(1, names[1]));
}

String liveTableServingTeamLabel(TournamentMatch match) {
  final servingId = match.servingTeamId.trim();
  if (servingId.isEmpty) {
    return liveTableTeamLabel(match.teamADescription, match.teamAId);
  }
  if (servingId == match.teamAId) {
    return liveTableTeamLabel(match.teamADescription, match.teamAId);
  }
  if (servingId == match.teamBId) {
    return liveTableTeamLabel(match.teamBDescription, match.teamBId);
  }
  return liveTableTeamLabel(match.teamADescription, match.teamAId);
}

bool liveTableIsServing(TournamentMatch match, {required bool sideA}) {
  final servingId = match.servingTeamId.trim();
  if (servingId.isEmpty) return sideA;
  return sideA ? servingId == match.teamAId : servingId == match.teamBId;
}

int? liveTableTeamSeed(TournamentMatch match, {required bool sideA}) {
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

List<int> liveTableCompletedSetScores(
  TournamentMatch match, {
  required bool sideA,
}) {
  final idx = match.currentSetIndex ?? match.sets.length;
  if (match.sets.isEmpty) return const [];
  final end = idx.clamp(0, match.sets.length);
  return [
    for (var i = 0; i < end; i++)
      if (_isCompletedSet(match.sets[i]))
        sideA ? match.sets[i].a : match.sets[i].b,
  ];
}

bool _isCompletedSet(TournamentMatchSet set) {
  return set.endedAt != null ||
      MatchScoringLogic.isSetWon(set.a, set.b) ||
      MatchScoringLogic.isSetWon(set.b, set.a);
}

int liveTableCurrentSetScore(TournamentMatch match, {required bool sideA}) {
  final idx = match.currentSetIndex ??
      (match.sets.isEmpty ? 0 : match.sets.length - 1);
  if (match.sets.isEmpty || idx < 0 || idx >= match.sets.length) return 0;
  final set = match.sets[idx];
  return sideA ? set.a : set.b;
}
