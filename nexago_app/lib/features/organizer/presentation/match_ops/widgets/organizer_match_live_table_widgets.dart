import 'dart:math' as math;
import 'dart:ui' as ui;

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
    this.fullModeActive = false,
    this.onToggleFullMode,
  });

  final String courtLabel;
  final String titleLabel;
  final String elapsedLabel;
  final VoidCallback onBack;

  /// Quando [onToggleFullMode] é informado, exibe um botão pra ligar/desligar
  /// as ferramentas extras da mesa (Quadra, Tempo, Modo exibição) — pensadas
  /// pro mesário que também é o próprio árbitro, sem ninguém mais na mesa.
  final bool fullModeActive;
  final VoidCallback? onToggleFullMode;

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
          if (onToggleFullMode != null) ...[
            const SizedBox(width: 8),
            _LiveTableIconButton(
              icon: Icons.tune_rounded,
              tooltip: 'Modo full',
              active: fullModeActive,
              onPressed: onToggleFullMode!,
            ),
          ],
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
  const _LiveTableIconButton({
    required this.icon,
    required this.onPressed,
    this.tooltip,
    this.active = false,
  });

  final IconData icon;
  final VoidCallback onPressed;
  final String? tooltip;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final button = Material(
      color: active
          ? AppColors.brand.withValues(alpha: 0.16)
          : context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(
            icon,
            size: 18,
            color: active ? AppColors.brand : context.themeColors.onSurface,
          ),
        ),
      ),
    );
    return tooltip == null ? button : Tooltip(message: tooltip!, child: button);
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

/// Mesa dedicada do modo full — pro mesário que também é o próprio árbitro,
/// sem mais ninguém ajudando: dois painéis gigantes, o toque em qualquer
/// lugar de um deles marca ponto (ou escolhe quem saca, antes do 1º ponto).
/// Sem cabeçalho nem coluna central — só os painéis e a barra de baixo; o
/// resto das ações antigas (formato, placar completo, histórico, modo
/// exibição, sair do modo full) mora atrás do botão "⋮".
/// Fase do tempo técnico em andamento — `ended` é estado terminal (chegou a
/// 0s), fica exibido até o mesário fechar, não fecha sozinho.
enum LiveTableTimeoutPhase { running, paused, ended }

/// Instantâneo do tempo técnico ativo — `null` em [LiveTableFullModeMesa]
/// significa nenhum tempo rodando (mesa liberada).
class LiveTableActiveTimeout {
  const LiveTableActiveTimeout({
    required this.teamLabel,
    required this.timeoutNumber,
    required this.remainingSeconds,
    required this.totalSeconds,
    required this.phase,
  });

  final String teamLabel;
  final int timeoutNumber;
  final int remainingSeconds;
  final int totalSeconds;
  final LiveTableTimeoutPhase phase;
}

class LiveTableFullModeMesa extends StatelessWidget {
  const LiveTableFullModeMesa({
    super.key,
    required this.teamA,
    required this.teamB,
    required this.scoreA,
    required this.scoreB,
    required this.isServingA,
    required this.isServingB,
    required this.timeoutsA,
    required this.timeoutsB,
    required this.enabled,
    required this.onTapA,
    required this.onTapB,
    required this.onRemoveTimeoutA,
    required this.onRemoveTimeoutB,
    required this.onSwapServe,
    required this.onSwapSides,
    required this.onAddTimeout,
    required this.onUndo,
    required this.onMore,
    this.activeTimeout,
    this.onPauseTimeout,
    this.onResumeTimeout,
    this.onEndTimeout,
  });

  final LiveTableTeamData teamA;
  final LiveTableTeamData teamB;
  final int scoreA;
  final int scoreB;
  final bool isServingA;
  final bool isServingB;
  final int timeoutsA;
  final int timeoutsB;
  final bool enabled;
  final VoidCallback onTapA;
  final VoidCallback onTapB;
  final VoidCallback onRemoveTimeoutA;
  final VoidCallback onRemoveTimeoutB;
  final VoidCallback onSwapServe;
  final VoidCallback onSwapSides;
  final VoidCallback onAddTimeout;
  final VoidCallback onUndo;
  final VoidCallback onMore;

  final LiveTableActiveTimeout? activeTimeout;
  final VoidCallback? onPauseTimeout;
  final VoidCallback? onResumeTimeout;
  final VoidCallback? onEndTimeout;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: context.themeColors.canvas,
      child: SafeArea(
        child: Stack(
          children: [
            Column(
              children: [
                Expanded(
                  child: Row(
                    children: [
                      Expanded(
                        child: _FullModeTeamPanel(
                          team: teamA,
                          score: scoreA,
                          isServing: isServingA,
                          timeouts: timeoutsA,
                          enabled: enabled,
                          onTap: onTapA,
                          onRemoveTimeout: onRemoveTimeoutA,
                        ),
                      ),
                      Container(
                        width: 1,
                        color: context.themeColors.onSurfaceMuted.withValues(
                          alpha: 0.14,
                        ),
                      ),
                      Expanded(
                        child: _FullModeTeamPanel(
                          team: teamB,
                          score: scoreB,
                          isServing: isServingB,
                          timeouts: timeoutsB,
                          enabled: enabled,
                          onTap: onTapB,
                          onRemoveTimeout: onRemoveTimeoutB,
                        ),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: _ActionBarButton(
                          label: 'Trocar saque',
                          icon: Icons.circle,
                          iconColor: AppColors.brand,
                          enabled: enabled,
                          onPressed: onSwapServe,
                          borderColor: context.themeColors.onSurfaceMuted
                              .withValues(alpha: 0.14),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _ActionBarButton(
                          label: 'Trocar quadra',
                          icon: Icons.swap_horiz_rounded,
                          enabled: enabled,
                          onPressed: onSwapSides,
                          borderColor: context.themeColors.onSurfaceMuted
                              .withValues(alpha: 0.14),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _ActionBarButton(
                          label: 'Tempo técnico',
                          icon: Icons.timer_outlined,
                          enabled: enabled,
                          onPressed: onAddTimeout,
                          borderColor: context.themeColors.onSurfaceMuted
                              .withValues(alpha: 0.14),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _ActionBarButton(
                          label: 'Desfazer',
                          icon: Icons.undo_rounded,
                          enabled: enabled,
                          onPressed: onUndo,
                          borderColor: context.themeColors.onSurfaceMuted
                              .withValues(alpha: 0.14),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            Positioned(
              top: 8,
              right: 8,
              child: _LiveTableIconButton(
                icon: Icons.more_vert_rounded,
                tooltip: 'Mais opções',
                onPressed: onMore,
              ),
            ),
            // Por último no Stack: pinta por cima e absorve todo toque nos
            // painéis/barra/⋮ embaixo enquanto o tempo técnico roda — não
            // precisa desabilitar cada um deles à parte.
            if (activeTimeout != null)
              Positioned.fill(
                child: LiveTableTechnicalTimeoutOverlay(
                  timeout: activeTimeout!,
                  onPause: onPauseTimeout,
                  onResume: onResumeTimeout,
                  onEnd: onEndTimeout,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _FullModeTeamPanel extends StatelessWidget {
  const _FullModeTeamPanel({
    required this.team,
    required this.score,
    required this.isServing,
    required this.timeouts,
    required this.enabled,
    required this.onTap,
    required this.onRemoveTimeout,
  });

  final LiveTableTeamData team;
  final int score;
  final bool isServing;
  final int timeouts;
  final bool enabled;
  final VoidCallback onTap;
  final VoidCallback onRemoveTimeout;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: isServing
          ? AppColors.brand.withValues(alpha: 0.06)
          : Colors.transparent,
      child: InkWell(
        onTap: enabled ? onTap : null,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    team.label,
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.soraRegular(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                    ),
                  ),
                  if (isServing) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.brand,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        'SAQUE',
                        style: AppTypography.mono(
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          color: AppColors.black,
                          letterSpacing: 0.6,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              Expanded(
                child: FittedBox(
                  child: Text(
                    '$score',
                    style: AppTypography.mono(
                      fontSize: 160,
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                      height: 1,
                    ),
                  ),
                ),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    'TEMPO',
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurfaceMuted,
                      letterSpacing: 0.6,
                    ),
                  ),
                  const SizedBox(width: 8),
                  for (var i = 0; i < 2; i++) ...[
                    if (i > 0) const SizedBox(width: 4),
                    Container(
                      width: 7,
                      height: 7,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: i < timeouts
                            ? AppColors.brand
                            : context.themeColors.onSurfaceMuted.withValues(
                                alpha: 0.25,
                              ),
                      ),
                    ),
                  ],
                  const SizedBox(width: 8),
                  _LiveTableIconButton(
                    icon: Icons.remove_rounded,
                    onPressed: enabled ? onRemoveTimeout : () {},
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                'TOQUE PARA MARCAR PONTO',
                style: AppTypography.mono(
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.6,
                  ),
                  letterSpacing: 0.4,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Overlay do tempo técnico: anel de progresso + contagem regressiva. Cobre a
/// mesa inteira (o placar fica visível borrado atrás) enquanto o tempo roda.
class LiveTableTechnicalTimeoutOverlay extends StatelessWidget {
  const LiveTableTechnicalTimeoutOverlay({
    super.key,
    required this.timeout,
    this.onPause,
    this.onResume,
    this.onEnd,
  });

  final LiveTableActiveTimeout timeout;
  final VoidCallback? onPause;
  final VoidCallback? onResume;
  final VoidCallback? onEnd;

  static const _criticalThresholdSeconds = 10;

  @override
  Widget build(BuildContext context) {
    final isEnded = timeout.phase == LiveTableTimeoutPhase.ended;
    final isCritical =
        !isEnded && timeout.remainingSeconds <= _criticalThresholdSeconds;
    final ringColor = isEnded
        ? AppColors.win
        : (isCritical ? AppColors.live : AppColors.brand);
    final progress = isEnded
        ? 1.0
        : (timeout.remainingSeconds / timeout.totalSeconds).clamp(0.0, 1.0);
    final minutes = timeout.remainingSeconds ~/ 60;
    final seconds = (timeout.remainingSeconds % 60).toString().padLeft(2, '0');

    return Stack(
      fit: StackFit.expand,
      children: [
        Positioned.fill(
          child: BackdropFilter(
            filter: ui.ImageFilter.blur(sigmaX: 14, sigmaY: 14),
            child: Container(color: Colors.black.withValues(alpha: 0.68)),
          ),
        ),
        Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'TEMPO TÉCNICO · 1 MINUTO',
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurfaceMuted,
                  letterSpacing: 0.6,
                ),
              ),
              const SizedBox(height: 10),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    timeout.teamLabel,
                    style: AppTypography.soraRegular(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: context.themeColors.surfaceRaised,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      '${timeout.timeoutNumber}º tempo do time',
                      style: AppTypography.mono(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 28),
              SizedBox(
                width: 280,
                height: 280,
                child: CustomPaint(
                  painter: _TimeoutRingPainter(
                    progress: progress,
                    color: ringColor,
                    trackColor: context.themeColors.onSurfaceMuted.withValues(
                      alpha: 0.14,
                    ),
                  ),
                  child: Center(
                    child: Text(
                      '$minutes:$seconds',
                      style: AppTypography.mono(
                        fontSize: 56,
                        fontWeight: FontWeight.w800,
                        color: isEnded || isCritical
                            ? ringColor
                            : context.themeColors.onSurface,
                        height: 1,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 24),
              if (isEnded)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.win.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: AppColors.win.withValues(alpha: 0.4)),
                  ),
                  child: Text(
                    'TEMPO ENCERRADO',
                    style: AppTypography.mono(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: AppColors.win,
                      letterSpacing: 0.6,
                    ),
                  ),
                ),
              const SizedBox(height: 20),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (!isEnded) ...[
                    OutlinedButton.icon(
                      onPressed:
                          timeout.phase == LiveTableTimeoutPhase.paused
                              ? onResume
                              : onPause,
                      icon: Icon(
                        timeout.phase == LiveTableTimeoutPhase.paused
                            ? Icons.play_arrow_rounded
                            : Icons.pause_rounded,
                      ),
                      label: Text(
                        timeout.phase == LiveTableTimeoutPhase.paused
                            ? 'Retomar'
                            : 'Pausar',
                      ),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: context.themeColors.onSurface,
                        side: BorderSide(
                          color: context.themeColors.onSurfaceMuted
                              .withValues(alpha: 0.3),
                        ),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 18,
                          vertical: 12,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                  ],
                  FilledButton(
                    onPressed: onEnd,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      foregroundColor: AppColors.black,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 18,
                        vertical: 12,
                      ),
                    ),
                    child: const Text('Encerrar tempo'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _TimeoutRingPainter extends CustomPainter {
  const _TimeoutRingPainter({
    required this.progress,
    required this.color,
    required this.trackColor,
  });

  final double progress;
  final Color color;
  final Color trackColor;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = (size.shortestSide - _strokeWidth) / 2;
    final track = Paint()
      ..color = trackColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = _strokeWidth;
    canvas.drawCircle(center, radius, track);

    final arc = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = _strokeWidth
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -math.pi / 2,
      2 * math.pi * progress,
      false,
      arc,
    );
  }

  static const _strokeWidth = 14.0;

  @override
  bool shouldRepaint(_TimeoutRingPainter oldDelegate) =>
      oldDelegate.progress != progress ||
      oldDelegate.color != color ||
      oldDelegate.trackColor != trackColor;
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

/// Modo exibição: tela virada pros atletas verem o placar, sem cabeçalho nem
/// ferramentas — só "Desfazer" fica disponível (é a correção mais comum de
/// quem está com a tela de costas pra si, olhando os atletas). Duas variantes
/// de layout: retrato (duplas empilhadas) e paisagem (lado a lado, sets ao
/// centro), igual ao modo exibição da mesa do atleta no web.
class LiveTablePresentView extends StatelessWidget {
  const LiveTablePresentView({
    super.key,
    required this.teamA,
    required this.teamB,
    required this.scoreA,
    required this.scoreB,
    required this.isServingA,
    required this.isServingB,
    required this.setsWonA,
    required this.setsWonB,
    required this.enabled,
    required this.onUndo,
    required this.onExit,
  });

  final LiveTableTeamData teamA;
  final LiveTableTeamData teamB;
  final int scoreA;
  final int scoreB;
  final bool isServingA;
  final bool isServingB;
  final int setsWonA;
  final int setsWonB;
  final bool enabled;
  final VoidCallback onUndo;
  final VoidCallback onExit;

  @override
  Widget build(BuildContext context) {
    final isLandscape =
        MediaQuery.orientationOf(context) == Orientation.landscape;

    return ColoredBox(
      color: context.themeColors.canvas,
      child: SafeArea(
        child: Stack(
          children: [
            Positioned(
              top: 8,
              right: 8,
              child: _LiveTableIconButton(
                icon: Icons.fullscreen_exit_rounded,
                tooltip: 'Sair do modo exibição',
                onPressed: onExit,
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
              child: isLandscape
                  ? _PresentLandscape(
                      teamA: teamA,
                      teamB: teamB,
                      scoreA: scoreA,
                      scoreB: scoreB,
                      isServingA: isServingA,
                      isServingB: isServingB,
                      setsWonA: setsWonA,
                      setsWonB: setsWonB,
                      enabled: enabled,
                      onUndo: onUndo,
                    )
                  : _PresentPortrait(
                      teamA: teamA,
                      teamB: teamB,
                      scoreA: scoreA,
                      scoreB: scoreB,
                      isServingA: isServingA,
                      isServingB: isServingB,
                      setsWonA: setsWonA,
                      setsWonB: setsWonB,
                      enabled: enabled,
                      onUndo: onUndo,
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PresentPortrait extends StatelessWidget {
  const _PresentPortrait({
    required this.teamA,
    required this.teamB,
    required this.scoreA,
    required this.scoreB,
    required this.isServingA,
    required this.isServingB,
    required this.setsWonA,
    required this.setsWonB,
    required this.enabled,
    required this.onUndo,
  });

  final LiveTableTeamData teamA;
  final LiveTableTeamData teamB;
  final int scoreA;
  final int scoreB;
  final bool isServingA;
  final bool isServingB;
  final int setsWonA;
  final int setsWonB;
  final bool enabled;
  final VoidCallback onUndo;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Expanded(
          child: _PresentTeamBlock(
            team: teamA,
            score: scoreA,
            isServing: isServingA,
          ),
        ),
        const SizedBox(height: 12),
        _PresentSetsChip(setsWonA: setsWonA, setsWonB: setsWonB),
        const SizedBox(height: 12),
        Expanded(
          child: _PresentTeamBlock(
            team: teamB,
            score: scoreB,
            isServing: isServingB,
          ),
        ),
        const SizedBox(height: 20),
        _PresentUndoButton(enabled: enabled, onPressed: onUndo),
      ],
    );
  }
}

class _PresentLandscape extends StatelessWidget {
  const _PresentLandscape({
    required this.teamA,
    required this.teamB,
    required this.scoreA,
    required this.scoreB,
    required this.isServingA,
    required this.isServingB,
    required this.setsWonA,
    required this.setsWonB,
    required this.enabled,
    required this.onUndo,
  });

  final LiveTableTeamData teamA;
  final LiveTableTeamData teamB;
  final int scoreA;
  final int scoreB;
  final bool isServingA;
  final bool isServingB;
  final int setsWonA;
  final int setsWonB;
  final bool enabled;
  final VoidCallback onUndo;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: Row(
            children: [
              Expanded(
                child: _PresentTeamBlock(
                  team: teamA,
                  score: scoreA,
                  isServing: isServingA,
                ),
              ),
              const SizedBox(width: 16),
              _PresentSetsChip(setsWonA: setsWonA, setsWonB: setsWonB),
              const SizedBox(width: 16),
              Expanded(
                child: _PresentTeamBlock(
                  team: teamB,
                  score: scoreB,
                  isServing: isServingB,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _PresentUndoButton(enabled: enabled, onPressed: onUndo),
      ],
    );
  }
}

class _PresentTeamBlock extends StatelessWidget {
  const _PresentTeamBlock({
    required this.team,
    required this.score,
    required this.isServing,
  });

  final LiveTableTeamData team;
  final int score;
  final bool isServing;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (isServing) ...[
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.circle, size: 8, color: AppColors.brand),
              const SizedBox(width: 6),
              Text(
                'SAQUE',
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: AppColors.brand,
                  letterSpacing: 0.6,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
        ],
        Text(
          team.label,
          textAlign: TextAlign.center,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.soraRegular(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
          ),
        ),
        FittedBox(
          child: Text(
            '$score',
            style: AppTypography.mono(
              fontSize: 120,
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
              height: 1,
            ),
          ),
        ),
      ],
    );
  }
}

class _PresentSetsChip extends StatelessWidget {
  const _PresentSetsChip({required this.setsWonA, required this.setsWonB});

  final int setsWonA;
  final int setsWonB;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        '$setsWonA – $setsWonB',
        style: AppTypography.mono(
          fontSize: 16,
          fontWeight: FontWeight.w800,
          color: context.themeColors.onSurfaceMuted,
        ),
      ),
    );
  }
}

class _PresentUndoButton extends StatelessWidget {
  const _PresentUndoButton({required this.enabled, required this.onPressed});

  final bool enabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 160,
      child: _ActionBarButton(
        label: 'Desfazer',
        icon: Icons.undo_rounded,
        enabled: enabled,
        onPressed: onPressed,
        borderColor: context.themeColors.onSurfaceMuted.withValues(
          alpha: 0.14,
        ),
      ),
    );
  }
}

/// Faixa de abertura do saque: aparece enquanto `MatchScoringLogic.needsStartingServe` for
/// verdadeiro e sai da tela na escolha. Mesmo desenho das mesas web — pergunta entre a régua de
/// sets e o placar, respondida com um toque no nome da dupla.
class LiveTableStartingServe extends StatelessWidget {
  const LiveTableStartingServe({
    super.key,
    required this.teamA,
    required this.teamB,
    required this.onChoose,
    this.enabled = true,
  });

  final LiveTableTeamData teamA;
  final LiveTableTeamData teamB;

  /// Recebe `'A'` ou `'B'` — o mesmo lado que o resto da mesa usa.
  final ValueChanged<String> onChoose;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.brand.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.brand.withValues(alpha: 0.24)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Quem começa sacando?',
              style: AppTypography.soraRegular(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.1,
                color: AppColors.brand,
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _StartingServeOption(
                    label: teamA.label,
                    enabled: enabled,
                    onTap: () => onChoose('A'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _StartingServeOption(
                    label: teamB.label,
                    enabled: enabled,
                    onTap: () => onChoose('B'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _StartingServeOption extends StatelessWidget {
  const _StartingServeOption({
    required this.label,
    required this.enabled,
    required this.onTap,
  });

  final String label;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          // Alvo de mesário na areia, mesmo numa faixa temporária.
          constraints: const BoxConstraints(minHeight: 44),
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.brand.withValues(alpha: 0.42)),
          ),
          child: Text(
            label,
            maxLines: 2,
            textAlign: TextAlign.center,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: context.themeColors.onSurface,
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
  // Campo vazio significa que NINGUÉM abriu o saque ainda — quem pergunta é
  // `LiveTableStartingServe`. Antes daqui o app assumia a dupla A e acendia um SAQUE que o
  // mesário nunca definiu.
  if (servingId.isEmpty) return false;
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

/// Sets vencidos por cada dupla — via `matchClosedSets`, nunca contando o set
/// em andamento (`setsWonCountForMatch` mente ao vivo, ver nota do projeto).
(int, int) liveTableSetsWon(TournamentMatch match) {
  final closed = matchClosedSets(match);
  final a = closed.where((s) => s.a > s.b).length;
  final b = closed.where((s) => s.b > s.a).length;
  return (a, b);
}
