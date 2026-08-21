import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/focus/focus_journey_view.dart';

/// O trilho "Caminho até a final", no desenho do protótipo: um card único com
/// um degrau por partida, ligados por uma linha que COLORE o que já passou.
///
/// A linha é o que faz a leitura funcionar de relance — verde nos trechos já
/// vencidos, apagada no que ainda vem. O degrau atual é um anel aberto, não um
/// ponto cheio: ele marca onde o atleta ESTÁ, não algo concluído.
class FocusJourneyRail extends StatelessWidget {
  const FocusJourneyRail({
    super.key,
    required this.steps,
    required this.onOpen,
  });

  final List<JourneyStepRow> steps;
  final ValueChanged<String> onOpen;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.lg,
        ),
        decoration: BoxDecoration(
          color: colors.surfaceCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: colors.outline),
        ),
        child: Column(
          children: [
            for (var i = 0; i < steps.length; i++)
              _Step(
                step: steps[i],
                isLast: i == steps.length - 1,
                onTap: steps[i].matchId != null
                    ? () => onOpen(steps[i].matchId!)
                    : null,
              ),
          ],
        ),
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({required this.step, required this.isLast, required this.onTap});

  final JourneyStepRow step;
  final bool isLast;
  final VoidCallback? onTap;

  /// A cor do estado pinta o ponto, a linha abaixo dele e a linha de meta —
  /// é uma decisão só, aplicada em três lugares.
  Color _accent(AppThemeColors colors) => switch (step.status) {
        JourneyStepStatus.win => colors.win,
        JourneyStepStatus.loss => AppColors.live,
        JourneyStepStatus.live => AppColors.live,
        JourneyStepStatus.next => colors.brand,
        JourneyStepStatus.upcoming => colors.outline,
      };

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final accent = _accent(colors);
    final isNext = step.status == JourneyStepStatus.next;
    final done = step.status == JourneyStepStatus.win ||
        step.status == JourneyStepStatus.loss;

    return IntrinsicHeight(
      child: InkWell(
        onTap: onTap,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              width: 26,
              child: Column(
                children: [
                  _Dot(status: step.status, accent: accent),
                  if (!isLast)
                    Expanded(
                      child: Container(
                        width: 2,
                        // O trecho ABAIXO do degrau herda a cor dele: assim o
                        // verde desenha o caminho já percorrido, e o apagado
                        // começa exatamente onde o atleta parou.
                        color: done
                            ? accent.withValues(alpha: 0.75)
                            : colors.outline.withValues(alpha: 0.6),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.xl),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Flexible(
                          child: Text(
                            [
                              step.phaseLabel.toUpperCase(),
                              ?step.metaLabel,
                            ].join('  '),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.monoMeta.copyWith(
                              color: step.status == JourneyStepStatus.upcoming
                                  ? colors.onSurfaceMuted
                                  : accent,
                            ),
                          ),
                        ),
                        // WB/LB/GF: sem a sigla, "Rodada 2" não diz em qual
                        // das duas escadas da dupla eliminação o atleta está.
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
                        const SizedBox(width: AppSpacing.sm),
                        Text(
                          step.scoreLabel,
                          style: AppTypography.monoStat.copyWith(
                            color: switch (step.status) {
                              JourneyStepStatus.win => colors.win,
                              JourneyStepStatus.loss => AppColors.live,
                              _ => colors.onSurfaceMuted,
                            },
                            fontSize: 18,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      step.opponentName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.titleM.copyWith(
                        color: colors.onSurface,
                        fontWeight: isNext ? FontWeight.w800 : FontWeight.w700,
                      ),
                    ),
                    if (step.detailLabel != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 3),
                        child: Text(
                          step.detailLabel!,
                          style: AppTypography.monoMeta
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
    );
  }
}

/// O marcador do degrau.
///
/// Cheio com ✓ para vencida, cheio com × para perdida, ANEL ABERTO e grosso
/// para a atual — ela marca onde o atleta está, não algo concluído — e anel
/// fino apagado para o que ainda vem.
class _Dot extends StatelessWidget {
  const _Dot({required this.status, required this.accent});

  final JourneyStepStatus status;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return switch (status) {
      JourneyStepStatus.win => _Filled(color: accent, icon: Icons.check_rounded),
      JourneyStepStatus.loss => _Filled(color: accent, icon: Icons.close_rounded),
      JourneyStepStatus.live => _Ring(color: accent, width: 3, size: 22),
      JourneyStepStatus.next => _Ring(color: accent, width: 3, size: 22),
      JourneyStepStatus.upcoming =>
        _Ring(color: colors.outline, width: 1.5, size: 18),
    };
  }
}

class _Filled extends StatelessWidget {
  const _Filled({required this.color, required this.icon});

  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 22,
      height: 22,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: color, width: 2),
      ),
      child: Icon(icon, size: 12, color: color),
    );
  }
}

class _Ring extends StatelessWidget {
  const _Ring({required this.color, required this.width, required this.size});

  final Color color;
  final double width;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.symmetric(vertical: (22 - size) / 2),
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: color, width: width),
        ),
      ),
    );
  }
}
