import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/focus/focus_journey_view.dart';
import '../../../domain/tournament_match_card_view_model.dart';
import '../../widgets/nexa_duo_avatars.dart';

/// O trilho "Caminho até a final": um degrau por partida do atleta, seguido das
/// fases que ainda vêm. A linha vertical liga os degraus e para no último.
class FocusJourneyRail extends StatelessWidget {
  const FocusJourneyRail({
    super.key,
    required this.steps,
    required this.playersOf,
    required this.onOpen,
  });

  final List<JourneyStepRow> steps;

  /// Elenco do adversário de cada degrau, para os rostos.
  final List<TournamentMatchCardPlayerViewModel> Function(String teamId)
      playersOf;
  final ValueChanged<String> onOpen;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (var i = 0; i < steps.length; i++)
          _Step(
            step: steps[i],
            players: steps[i].opponentTeamId != null
                ? playersOf(steps[i].opponentTeamId!)
                : const [],
            isLast: i == steps.length - 1,
            onTap: steps[i].matchId != null
                ? () => onOpen(steps[i].matchId!)
                : null,
          ),
      ],
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({
    required this.step,
    required this.players,
    required this.isLast,
    required this.onTap,
  });

  final JourneyStepRow step;
  final List<TournamentMatchCardPlayerViewModel> players;
  final bool isLast;
  final VoidCallback? onTap;

  Color _dotColor(AppThemeColors colors) {
    return switch (step.status) {
      JourneyStepStatus.win => colors.win,
      JourneyStepStatus.loss => colors.onSurfaceMuted,
      JourneyStepStatus.live => AppColors.live,
      JourneyStepStatus.next => colors.brand,
      JourneyStepStatus.upcoming => colors.outline,
    };
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final dot = _dotColor(colors);
    final isNext = step.status == JourneyStepStatus.next;
    final filled = step.status != JourneyStepStatus.upcoming;

    return IntrinsicHeight(
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Trilho: bolinha + linha que desce até o próximo degrau.
              SizedBox(
                width: 22,
                child: Column(
                  children: [
                    const SizedBox(height: AppSpacing.md),
                    Container(
                      width: 16,
                      height: 16,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: filled ? dot : Colors.transparent,
                        shape: BoxShape.circle,
                        border: Border.all(color: dot, width: 1.5),
                      ),
                      child: step.status == JourneyStepStatus.win
                          ? const Icon(Icons.check_rounded,
                              size: 10, color: Colors.white)
                          : null,
                    ),
                    if (!isLast)
                      Expanded(
                        child: Container(
                          width: 1.5,
                          color: colors.outline,
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(
                    top: AppSpacing.md,
                    bottom: AppSpacing.lg,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              [
                                step.phaseLabel,
                                ?step.metaLabel,
                              ].join(' · '),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.monoMeta.copyWith(
                                color: isNext
                                    ? colors.brand
                                    : colors.onSurfaceMuted,
                              ),
                            ),
                          ),
                          // WB/LB/GF: sem a sigla, "Rodada 2" não diz em qual
                          // das duas escadas o atleta está.
                          if (step.bracketBadge != null) ...[
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 5,
                                vertical: 1,
                              ),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(4),
                                color: colors.surfaceRaised,
                              ),
                              child: Text(
                                step.bracketBadge!,
                                style: AppTypography.eyebrow
                                    .copyWith(color: colors.onSurfaceMuted),
                              ),
                            ),
                          ],
                          const Spacer(),
                          Text(
                            step.scoreLabel,
                            style: AppTypography.monoMeta.copyWith(
                              color: step.status == JourneyStepStatus.win
                                  ? colors.win
                                  : colors.onSurfaceMuted,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          if (step.opponentTeamId != null) ...[
                            NexaDuoAvatars(players: players, size: 22),
                            const SizedBox(width: AppSpacing.sm),
                          ],
                          Flexible(
                            child: Text(
                              step.opponentName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.bodyM.copyWith(
                                color: colors.onSurface,
                                fontWeight:
                                    isNext ? FontWeight.w700 : FontWeight.w400,
                              ),
                            ),
                          ),
                        ],
                      ),
                      if (step.detailLabel != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(
                            step.detailLabel!,
                            style: AppTypography.bodyS
                                .copyWith(color: colors.onSurfaceMuted),
                          ),
                        ),
                    ],
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
