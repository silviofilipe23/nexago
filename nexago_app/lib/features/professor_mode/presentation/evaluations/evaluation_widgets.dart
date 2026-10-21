import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../domain/professor_evaluations.dart';

/// Peças da avaliação (protótipos `pr-app-b.jsx` A6 / `pr-web-b.jsx`).

Color evaluationDeltaColor(double delta, AppThemeColors colors) => delta > 0
    ? AppColors.win
    : delta < 0
        ? AppColors.live
        : ProfessorLinksStyle.dim(colors);

/// "7.2" grande com o delta embaixo (cabeçalhos).
class EvaluationOverallBadge extends StatelessWidget {
  const EvaluationOverallBadge({
    super.key,
    required this.overall,
    this.delta,
    this.size = 28,
  });

  final double overall;
  final double? delta;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          evaluationScoreLabel(overall),
          key: const Key('evaluation-overall'),
          style: ProfessorLinksStyle.display(size, color: colors.onSurface),
        ),
        if (delta != null)
          Text(
            evaluationDeltaLabel(delta!),
            key: const Key('evaluation-delta'),
            style: ProfessorLinksStyle.mono(
              10,
              color: evaluationDeltaColor(delta!, colors),
            ),
          ),
      ],
    );
  }
}

/// Fundamento: rótulo, delta vs o mês anterior e o valor; barra de 10
/// segmentos. Com [onChanged], tocar um segmento dá a nota inteira e −/+
/// ajustam meio ponto (alvos de toque grandes e com rótulo de leitor).
class EvaluationScoreRow extends StatelessWidget {
  const EvaluationScoreRow({
    super.key,
    required this.label,
    required this.value,
    this.previous,
    this.onChanged,
  });

  final String label;
  final double value;
  final double? previous;
  final ValueChanged<double>? onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final delta = previous == null ? null : value - previous!;
    final filled = value.ceil();
    final half = value != value.floorToDouble();
    final editable = onChanged != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: ProfessorLinksStyle.display(
                  13.5,
                  weight: FontWeight.w600,
                  color: colors.onSurface,
                ),
              ),
            ),
            if (delta != null && delta.abs() >= 0.05) ...[
              Text(
                evaluationDeltaLabel(delta),
                style: ProfessorLinksStyle.mono(
                  10,
                  color: evaluationDeltaColor(delta, colors),
                ),
              ),
              const SizedBox(width: 8),
            ],
            if (editable)
              _StepButton(
                icon: Icons.remove_rounded,
                label: 'Menos meio ponto em $label',
                onTap: value <= 0
                    ? null
                    : () => onChanged!(roundHalf(value - 0.5)),
              ),
            SizedBox(
              width: 38,
              child: Text(
                evaluationScoreLabel(value),
                textAlign: TextAlign.center,
                style: ProfessorLinksStyle.display(15, color: colors.onSurface),
              ),
            ),
            if (editable)
              _StepButton(
                icon: Icons.add_rounded,
                label: 'Mais meio ponto em $label',
                onTap: value >= 10
                    ? null
                    : () => onChanged!(roundHalf(value + 0.5)),
              ),
          ],
        ),
        const SizedBox(height: 7),
        Row(
          children: [
            for (var k = 0; k < 10; k++) ...[
              if (k > 0) const SizedBox(width: 3),
              Expanded(
                child: Semantics(
                  button: editable,
                  label: editable ? '$label nota ${k + 1}' : null,
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap:
                        editable ? () => onChanged!((k + 1).toDouble()) : null,
                    child: Container(
                      height: 26,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(6),
                        color: k < filled
                            ? AppColors.brand.withValues(
                                alpha: half && k == filled - 1 ? 0.5 : 1,
                              )
                            : ProfessorLinksStyle.soft(colors),
                        border: Border.all(
                          color: k < filled
                              ? Colors.transparent
                              : ProfessorLinksStyle.line(colors),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ],
    );
  }
}

class _StepButton extends StatelessWidget {
  const _StepButton({required this.icon, required this.label, this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => IconButton(
        tooltip: label,
        visualDensity: VisualDensity.compact,
        onPressed: onTap,
        icon: Icon(icon, size: 18),
      );
}

/// A avaliação como o aluno vê (detalhe do atleta).
class EvaluationReport extends StatelessWidget {
  const EvaluationReport({super.key, required this.evaluation});

  final ProfessorEvaluation evaluation;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final e = evaluation;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ProfessorLinksCard(
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      e.professorName,
                      style: ProfessorLinksStyle.display(
                        16,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${evaluationPeriodLabel(e.period)} · '
                      '${evaluationSportLabel(e.sport)}',
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 11.5,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ],
                ),
              ),
              EvaluationOverallBadge(overall: e.overall, delta: e.delta),
            ],
          ),
        ),
        const SizedBox(height: 22),
        const ProfessorLinksKicker('Fundamentos'),
        for (final (key, label) in evaluationFundamentals(e.sport)) ...[
          const SizedBox(height: 12),
          EvaluationScoreRow(
            key: Key('evaluation-score-$key'),
            label: label,
            value: e.scores[key] ?? 0,
            previous: e.previousScores?[key],
          ),
        ],
        if (e.comment.isNotEmpty) ...[
          const SizedBox(height: 22),
          const ProfessorLinksKicker('Comentário'),
          const SizedBox(height: 8),
          ProfessorLinksCard(
            child: Text(
              e.comment,
              style: AppTypography.bodyM.copyWith(
                fontSize: 13.5,
                height: 1.5,
                color: colors.onSurface,
              ),
            ),
          ),
        ],
        if (e.focus.isNotEmpty) ...[
          const SizedBox(height: 22),
          const ProfessorLinksKicker('Foco do próximo mês'),
          const SizedBox(height: 8),
          for (final f in e.focus)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  const Icon(Icons.flag_outlined,
                      size: 16, color: AppColors.brand),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      f,
                      style: AppTypography.bodyM.copyWith(
                        fontSize: 13.5,
                        color: colors.onSurface,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
        if (e.suggestedLevel != null) ...[
          const SizedBox(height: 16),
          ProfessorLinksNote(
            'Nível sugerido: ${kEvaluationLevels[e.suggestedLevel]}',
            key: const Key('evaluation-level'),
            tone: ProfessorLinksNoteTone.blue,
          ),
        ],
      ],
    );
  }
}
