import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

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

/// Rótulo amigável do formato (nº de sets) da partida.
String matchBestOfLabel(int bestOf) => bestOf == 1 ? '1 set' : 'Melhor de 3';

class LiveTableSetRules extends StatelessWidget {
  const LiveTableSetRules({
    super.key,
    required this.rulesLabel,
    this.setPointHint,
    this.bestOf = 3,
    this.onChangeFormat,
    this.formatEnabled = true,
  });

  final String rulesLabel;
  final String? setPointHint;
  final int bestOf;

  /// Quando não nulo, exibe um chip tocável para trocar o formato (nº de sets).
  final VoidCallback? onChangeFormat;
  final bool formatEnabled;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
      child: Column(
        children: [
          Text.rich(
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
          if (onChangeFormat != null) ...[
            const SizedBox(height: 8),
            _FormatChip(
              label: matchBestOfLabel(bestOf),
              enabled: formatEnabled,
              onTap: onChangeFormat,
            ),
          ],
        ],
      ),
    );
  }
}

class _FormatChip extends StatelessWidget {
  const _FormatChip({
    required this.label,
    required this.enabled,
    this.onTap,
  });

  final String label;
  final bool enabled;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final color = enabled
        ? AppColors.brand
        : context.themeColors.onSurfaceMuted;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: color.withValues(alpha: 0.4)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.tune_rounded, size: 14, color: color),
              const SizedBox(width: 6),
              Text(
                'Formato: $label',
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: color,
                ),
              ),
            ],
          ),
        ),
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
    this.onQuickScore,
    this.enabled = true,
  });

  final VoidCallback? onUndo;
  final VoidCallback? onSwapServe;
  final VoidCallback? onHistory;
  final VoidCallback? onQuickScore;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final mutedBorder = context.themeColors.onSurfaceMuted.withValues(
      alpha: 0.14,
    );

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Column(
        children: [
          if (onQuickScore != null) ...[
            _ActionBarButton(
              label: 'Placar completo',
              icon: Icons.edit_note_rounded,
              iconColor: AppColors.brand,
              enabled: enabled,
              onPressed: onQuickScore,
              borderColor: AppColors.brand.withValues(alpha: 0.28),
            ),
            const SizedBox(height: 8),
          ],
          Row(
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

/// Atalho na mesa ao vivo para torneios sem mesário.
class LiveTableQuickScoreEntry extends StatelessWidget {
  const LiveTableQuickScoreEntry({
    super.key,
    required this.onTap,
    this.enabled = true,
  });

  final VoidCallback onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
      child: Material(
        color: AppColors.brand.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(14),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: AppColors.brand.withValues(alpha: 0.24),
              ),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.edit_note_rounded,
                  size: 18,
                  color: AppColors.brand,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Sem mesário?',
                        style: AppTypography.soraRegular(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Informe o placar completo de uma vez',
                        style: AppTypography.soraRegular(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 20,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

typedef LiveTableQuickScoreSubmit =
    Future<void> Function(List<TournamentMatchSet> sets, int bestOf);

typedef LiveTableQuickScoreWalkover =
    Future<void> Function(String winnerTeamId);

Future<void> showLiveTableQuickScoreSheet({
  required BuildContext context,
  required TournamentMatch match,
  required LiveTableTeamData teamA,
  required LiveTableTeamData teamB,
  required LiveTableQuickScoreSubmit onSubmit,
  required LiveTableQuickScoreWalkover onWalkover,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (sheetContext) {
      final bottomInset = MediaQuery.viewInsetsOf(sheetContext).bottom;
      return Padding(
        padding: EdgeInsets.only(bottom: bottomInset),
        child: DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.88,
          minChildSize: 0.55,
          maxChildSize: 0.95,
          builder: (context, scrollController) {
            return LiveTableQuickScoreSheet(
              scrollController: scrollController,
              match: match,
              teamA: teamA,
              teamB: teamB,
              onSubmit: onSubmit,
              onWalkover: onWalkover,
            );
          },
        ),
      );
    },
  );
}

/// Lançamento do placar completo (games por set) sem ponto a ponto.
class LiveTableQuickScoreSheet extends StatefulWidget {
  const LiveTableQuickScoreSheet({
    super.key,
    required this.scrollController,
    required this.match,
    required this.teamA,
    required this.teamB,
    required this.onSubmit,
    required this.onWalkover,
  });

  final ScrollController scrollController;
  final TournamentMatch match;
  final LiveTableTeamData teamA;
  final LiveTableTeamData teamB;
  final LiveTableQuickScoreSubmit onSubmit;
  final LiveTableQuickScoreWalkover onWalkover;

  @override
  State<LiveTableQuickScoreSheet> createState() =>
      _LiveTableQuickScoreSheetState();
}

class _LiveTableQuickScoreSheetState extends State<LiveTableQuickScoreSheet> {
  late final List<TournamentMatchSet> _sets;
  late int _bestOf;
  bool _saving = false;
  Map<int, String> _setErrors = {};
  final List<GlobalKey> _setRowKeys = [];

  @override
  void initState() {
    super.initState();
    _bestOf = widget.match.bestOf;
    final existing = setsForMatch(widget.match);
    _sets = existing.isNotEmpty
        ? List<TournamentMatchSet>.from(existing)
        : [const TournamentMatchSet(a: 0, b: 0)];
    _syncSetRowKeys();
  }

  void _syncSetRowKeys() {
    while (_setRowKeys.length < _sets.length) {
      _setRowKeys.add(GlobalKey());
    }
    while (_setRowKeys.length > _sets.length) {
      _setRowKeys.removeLast();
    }
  }

  QuickScoreValidationResult _validateSubmission({
    bool requireMatchWinner = true,
  }) {
    return MatchScoringLogic.validateQuickScoreSubmission(
      sets: _sets,
      bestOf: _bestOf,
      teamAId: widget.match.teamAId,
      teamBId: widget.match.teamBId,
      requireMatchWinner: requireMatchWinner,
    );
  }

  void _revalidateSets({bool requireMatchWinner = false}) {
    setState(() {
      _setErrors =
          _validateSubmission(requireMatchWinner: requireMatchWinner)
              .errorsBySetIndex;
    });
  }

  void _scrollToFirstSetError() {
    for (var i = 0; i < _sets.length; i++) {
      if (!_setErrors.containsKey(i)) continue;
      final ctx = _setRowKeys[i].currentContext;
      if (ctx != null) {
        Scrollable.ensureVisible(
          ctx,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeInOut,
          alignment: 0.2,
        );
      }
      break;
    }
  }

  void _updateSet(int index, {int? a, int? b}) {
    setState(() {
      final current = _sets[index];
      _sets[index] = TournamentMatchSet(
        a: (a ?? current.a).clamp(0, 99),
        b: (b ?? current.b).clamp(0, 99),
      );
      _setErrors =
          _validateSubmission(requireMatchWinner: false).errorsBySetIndex;
    });
  }

  void _addSet() {
    if (_sets.length >= _bestOf) return;
    setState(() {
      _sets.add(const TournamentMatchSet(a: 0, b: 0));
      _syncSetRowKeys();
      _setErrors =
          _validateSubmission(requireMatchWinner: false).errorsBySetIndex;
    });
  }

  Future<void> _showFormatSheet() async {
    if (_saving) return;
    final choice = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Quantidade de sets',
                style: AppTypography.soraRegular(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
              ),
              const SizedBox(height: 16),
              for (final option in const [1, 3])
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(sheetContext, option),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: option == _bestOf
                          ? AppColors.brand
                          : context.themeColors.onSurface,
                      side: BorderSide(
                        color: option == _bestOf
                            ? AppColors.brand
                            : context.themeColors.onSurfaceMuted
                                .withValues(alpha: 0.3),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: Text(matchBestOfLabel(option)),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
    if (choice == null || choice == _bestOf) return;
    if (choice < _bestOf &&
        MatchScoringLogic.playedSetsCount(_sets) > choice) {
      if (mounted) {
        _showMessage(
          'Não dá para mudar para ${matchBestOfLabel(choice)}: '
          'há sets já pontuados.',
          isError: true,
        );
      }
      return;
    }
    setState(() {
      _bestOf = choice;
      if (_sets.length > choice) {
        _sets.removeRange(choice, _sets.length);
      }
      if (_sets.isEmpty) {
        _sets.add(const TournamentMatchSet(a: 0, b: 0));
      }
      _syncSetRowKeys();
      _setErrors =
          _validateSubmission(requireMatchWinner: false).errorsBySetIndex;
    });
  }

  Future<void> _showWoSheet() async {
    if (_saving) return;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Qual equipe não compareceu?',
                style: AppTypography.soraRegular(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
              ),
              const SizedBox(height: 16),
              OutlinedButton(
                onPressed: () {
                  Navigator.pop(context);
                  _declareWalkover(widget.match.teamBId);
                },
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.live,
                  side: BorderSide(
                    color: AppColors.live.withValues(alpha: 0.4),
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: Text('${widget.teamA.label} — W.O.'),
              ),
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: () {
                  Navigator.pop(context);
                  _declareWalkover(widget.match.teamAId);
                },
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.live,
                  side: BorderSide(
                    color: AppColors.live.withValues(alpha: 0.4),
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: Text('${widget.teamB.label} — W.O.'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _declareWalkover(String winnerTeamId) async {
    if (winnerTeamId.trim().isEmpty || _saving) return;
    setState(() => _saving = true);
    try {
      await widget.onWalkover(winnerTeamId);
      if (mounted) Navigator.pop(context);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _confirm() async {
    if (_saving) return;
    final result = _validateSubmission();
    if (!result.isValid) {
      setState(() => _setErrors = result.errorsBySetIndex);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _scrollToFirstSetError();
      });
      showAppSnackBar(
        context,
        result.firstMessage ?? 'Informe placar válido.',
      );
      return;
    }

    setState(() => _saving = true);
    try {
      await widget.onSubmit(
        List<TournamentMatchSet>.from(_sets),
        _bestOf,
      );
      if (mounted) Navigator.pop(context);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _showMessage(String message, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? AppColors.live : null,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final wins = MatchScoringLogic.setsWon(_sets, bestOf: _bestOf);
    final winnerId = MatchScoringLogic.matchWinnerId(
      sets: _sets,
      teamAId: widget.match.teamAId,
      teamBId: widget.match.teamBId,
      bestOf: _bestOf,
    );
    final winnerLabel = winnerId == widget.match.teamAId
        ? widget.teamA.label
        : winnerId == widget.match.teamBId
            ? widget.teamB.label
            : null;
    final hasWinner = winnerLabel != null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 8),
        Center(
          child: Container(
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.25),
              borderRadius: BorderRadius.circular(999),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'PLACAR COMPLETO',
                style: AppTypography.mono(
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                  color: AppColors.brand,
                  letterSpacing: 0.8,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Resultado da partida',
                style: AppTypography.soraRegular(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Informe os games de cada set. A partida será encerrada ao confirmar.',
                style: AppTypography.soraRegular(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: context.themeColors.onSurfaceMuted,
                  height: 1.35,
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView(
            controller: widget.scrollController,
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            children: [
              _QuickScoreSummaryCard(
                teamA: widget.teamA,
                teamB: widget.teamB,
                setsWonA: wins.a,
                setsWonB: wins.b,
              ),
              const SizedBox(height: 20),
              _QuickScoreSectionHeader(
                title: 'GAMES POR SET',
                trailing:
                    'set até ${MatchScoringLogic.defaultSetPoints} · '
                    'decisivo até ${MatchScoringLogic.tiebreakSetPoints}',
              ),
              const SizedBox(height: 12),
              _QuickScoreFormatRow(
                label: matchBestOfLabel(_bestOf),
                onTap: _saving ? null : _showFormatSheet,
              ),
              const SizedBox(height: 12),
              for (var i = 0; i < _sets.length; i++) ...[
                KeyedSubtree(
                  key: _setRowKeys[i],
                  child: _QuickScoreSetRow(
                    index: i,
                    set: _sets[i],
                    errorText: _setErrors[i],
                    onChangeA: (v) => _updateSet(i, a: v),
                    onChangeB: (v) => _updateSet(i, b: v),
                    onCommitted: _revalidateSets,
                  ),
                ),
                if (i < _sets.length - 1)
                  Divider(
                    height: 1,
                    color: context.themeColors.onSurfaceMuted.withValues(
                      alpha: 0.1,
                    ),
                  ),
              ],
              if (_sets.length < _bestOf) ...[
                const SizedBox(height: 4),
                _QuickScoreAddSetButton(
                  label: _sets.length == _bestOf - 1
                      ? 'Adicionar set decisivo'
                      : 'Adicionar set',
                  onPressed: _saving ? null : _addSet,
                ),
              ],
              const SizedBox(height: 8),
              _QuickScoreWoRow(
                onPressed: _saving ? null : _showWoSheet,
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
          decoration: BoxDecoration(
            color: context.themeColors.surfaceSheet,
            border: Border(
              top: BorderSide(
                color: context.themeColors.onSurfaceMuted.withValues(
                  alpha: 0.12,
                ),
              ),
            ),
          ),
          child: SafeArea(
            top: false,
            child: FilledButton.icon(
              onPressed: _saving ? null : _confirm,
              icon: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.black,
                      ),
                    )
                  : const Icon(Icons.check_rounded, size: 18, color: Colors.black),
              label: Text(
                _saving
                    ? 'Salvando…'
                    : hasWinner
                        ? 'Confirmar · $winnerLabel venceu'
                        : 'Confirmar placar',
              ),
              style: FilledButton.styleFrom(
                backgroundColor: hasWinner ? AppColors.win : AppColors.brand,
                foregroundColor: AppColors.black,
                minimumSize: const Size.fromHeight(52),
                textStyle: AppTypography.soraRegular(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _QuickScoreSummaryCard extends StatelessWidget {
  const _QuickScoreSummaryCard({
    required this.teamA,
    required this.teamB,
    required this.setsWonA,
    required this.setsWonB,
  });

  final LiveTableTeamData teamA;
  final LiveTableTeamData teamB;
  final int setsWonA;
  final int setsWonB;

  @override
  Widget build(BuildContext context) {
    final aWins = setsWonA > setsWonB;
    final bWins = setsWonB > setsWonA;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$setsWonA',
                  style: AppTypography.mono(
                    fontSize: 32,
                    fontWeight: FontWeight.w800,
                    color: aWins ? AppColors.win : context.themeColors.onSurface,
                  ),
                ),
                Text(
                  teamA.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ],
            ),
          ),
          Text(
            'sets',
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '$setsWonB',
                  style: AppTypography.mono(
                    fontSize: 32,
                    fontWeight: FontWeight.w800,
                    color: bWins ? AppColors.win : context.themeColors.onSurface,
                  ),
                ),
                Text(
                  teamB.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.right,
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _QuickScoreSectionHeader extends StatelessWidget {
  const _QuickScoreSectionHeader({required this.title, this.trailing});

  final String title;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          title,
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurfaceMuted,
            letterSpacing: 0.6,
          ),
        ),
        if (trailing != null) ...[
          const Spacer(),
          Flexible(
            child: Text(
              trailing!,
              textAlign: TextAlign.right,
              style: AppTypography.mono(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _QuickScoreFormatRow extends StatelessWidget {
  const _QuickScoreFormatRow({required this.label, this.onTap});

  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
        ),
        child: Row(
          children: [
            Icon(
              Icons.tune_rounded,
              size: 16,
              color: context.themeColors.onSurfaceMuted,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Formato da partida',
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ),
            Text(
              label,
              style: AppTypography.mono(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: AppColors.brand,
              ),
            ),
            Icon(
              Icons.chevron_right_rounded,
              size: 18,
              color: context.themeColors.onSurfaceMuted,
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickScoreSetRow extends StatelessWidget {
  const _QuickScoreSetRow({
    required this.index,
    required this.set,
    required this.onChangeA,
    required this.onChangeB,
    this.errorText,
    this.onCommitted,
  });

  final int index;
  final TournamentMatchSet set;
  final ValueChanged<int> onChangeA;
  final ValueChanged<int> onChangeB;
  final String? errorText;
  final VoidCallback? onCommitted;

  @override
  Widget build(BuildContext context) {
    final hasError = errorText != null && errorText!.isNotEmpty;
    final aWins = !hasError && set.a > set.b;
    final bWins = !hasError && set.b > set.a;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                'SET ${index + 1}',
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurfaceMuted,
                  letterSpacing: 0.4,
                ),
              ),
              const Spacer(),
              _QuickScoreNumericField(
                value: set.a,
                isWinning: aWins,
                hasError: hasError,
                onChanged: onChangeA,
                onCommitted: onCommitted,
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Text(
                  '×',
                  style: AppTypography.mono(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ),
              _QuickScoreNumericField(
                value: set.b,
                isWinning: bWins,
                hasError: hasError,
                onChanged: onChangeB,
                onCommitted: onCommitted,
              ),
            ],
          ),
          if (hasError) ...[
            const SizedBox(height: 6),
            Text(
              errorText!,
              textAlign: TextAlign.right,
              style: AppTypography.mono(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: AppColors.live,
                height: 1.3,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _QuickScoreNumericField extends StatefulWidget {
  const _QuickScoreNumericField({
    required this.value,
    required this.isWinning,
    required this.onChanged,
    this.hasError = false,
    this.onCommitted,
  });

  final int value;
  final bool isWinning;
  final bool hasError;
  final ValueChanged<int> onChanged;
  final VoidCallback? onCommitted;

  @override
  State<_QuickScoreNumericField> createState() => _QuickScoreNumericFieldState();
}

class _QuickScoreNumericFieldState extends State<_QuickScoreNumericField> {
  late final TextEditingController _controller;
  late final FocusNode _focusNode;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: '${widget.value}');
    _focusNode = FocusNode()..addListener(_handleFocusChange);
  }

  @override
  void didUpdateWidget(covariant _QuickScoreNumericField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value != widget.value && !_focusNode.hasFocus) {
      _controller.text = '${widget.value}';
    }
  }

  @override
  void dispose() {
    _focusNode
      ..removeListener(_handleFocusChange)
      ..dispose();
    _controller.dispose();
    super.dispose();
  }

  void _handleFocusChange() {
    if (_focusNode.hasFocus) {
      // Seleciona todo o valor ao focar para digitar o placar por cima.
      _controller.selection = TextSelection(
        baseOffset: 0,
        extentOffset: _controller.text.length,
      );
    } else {
      _commit(_controller.text);
    }
  }

  /// Validação ao vivo: propaga o valor a cada dígito sem reescrever o texto
  /// (mantém o cursor). O commit/normalização ocorre ao sair do campo.
  void _handleChanged(String raw) {
    final parsed = int.tryParse(raw.trim());
    final next = (parsed ?? 0).clamp(0, 99);
    if (next != widget.value) {
      widget.onChanged(next);
    }
    widget.onCommitted?.call();
  }

  void _commit(String raw) {
    final parsed = int.tryParse(raw.trim());
    final next = (parsed ?? 0).clamp(0, 99);
    if (next != widget.value) {
      widget.onChanged(next);
    }
    final text = '$next';
    if (_controller.text != text) {
      _controller.text = text;
      _controller.selection = TextSelection.collapsed(offset: text.length);
    }
    widget.onCommitted?.call();
  }

  @override
  Widget build(BuildContext context) {
    final borderColor = widget.hasError
        ? AppColors.live.withValues(alpha: 0.65)
        : widget.isWinning
            ? AppColors.win.withValues(alpha: 0.45)
            : context.themeColors.onSurfaceMuted.withValues(alpha: 0.22);

    return SizedBox(
      width: 56,
      child: TextField(
        controller: _controller,
        focusNode: _focusNode,
        keyboardType: TextInputType.number,
        textAlign: TextAlign.center,
        maxLength: 2,
        style: AppTypography.mono(
          fontSize: 24,
          fontWeight: FontWeight.w800,
          color: widget.hasError
              ? AppColors.live
              : widget.isWinning
                  ? AppColors.win
                  : context.themeColors.onSurface,
          height: 1.1,
        ),
        decoration: InputDecoration(
          counterText: '',
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(vertical: 10),
          filled: true,
          fillColor: context.themeColors.surfaceRaised,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: borderColor),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: borderColor),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(
              color: widget.hasError ? AppColors.live : AppColors.brand,
              width: 1.5,
            ),
          ),
        ),
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        onChanged: _handleChanged,
        onSubmitted: _commit,
        onEditingComplete: () => _commit(_controller.text),
      ),
    );
  }
}

class _QuickScoreAddSetButton extends StatelessWidget {
  const _QuickScoreAddSetButton({required this.label, this.onPressed});

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.2),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.add_rounded,
              size: 16,
              color: context.themeColors.onSurfaceMuted,
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickScoreWoRow extends StatelessWidget {
  const _QuickScoreWoRow({this.onPressed});

  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
        ),
        child: Row(
          children: [
            Icon(
              Icons.flag_rounded,
              size: 16,
              color: context.themeColors.onSurfaceMuted,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Encerrar por W.O. ou abandono',
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ),
            Icon(
              Icons.chevron_right_rounded,
              size: 18,
              color: context.themeColors.onSurfaceMuted,
            ),
          ],
        ),
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
