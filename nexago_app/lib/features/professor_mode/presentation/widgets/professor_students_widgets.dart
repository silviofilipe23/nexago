import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../domain/professor_students.dart';
import '../../domain/professor_students_logic.dart';

/// Peças das telas de alunos do modo Professor (protótipo `pa-app-*.jsx` /
/// `pr-app-a.jsx`). Seguem o desenho dos vínculos (`ProfessorLinksStyle`).

Color professorBillingColor(
  ProfessorBillingStanding standing,
  AppThemeColors colors,
) =>
    switch (standing) {
      ProfessorBillingStanding.upToDate => AppColors.win,
      ProfessorBillingStanding.dueToday => AppColors.pending,
      ProfessorBillingStanding.overdue => AppColors.live,
      ProfessorBillingStanding.paused ||
      ProfessorBillingStanding.noPlan =>
        ProfessorLinksStyle.dim(colors),
    };

/// Pílula da situação do pagamento ("ATRASADO", "VENCE HOJE"…).
class ProfessorBillingPill extends StatelessWidget {
  const ProfessorBillingPill(this.standing, {super.key});

  final ProfessorBillingStanding standing;

  @override
  Widget build(BuildContext context) {
    final color = professorBillingColor(standing, context.themeColors);
    return Container(
      height: 20,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Center(
        widthFactor: 1,
        child: Text(
          standing.label.toUpperCase(),
          maxLines: 1,
          style: ProfessorLinksStyle.mono(9, color: color)
              .copyWith(letterSpacing: 0.8),
        ),
      ),
    );
  }
}

/// Faixa das últimas marcas (P verde, F vermelho, J amarelo, R azul). Sobra
/// à esquerda fica vazia para a faixa ter sempre [slots] casas.
class ProfessorPresenceStrip extends StatelessWidget {
  const ProfessorPresenceStrip({
    super.key,
    required this.marks,
    this.slots = 12,
  });

  final List<ProfessorStudentMark> marks;
  final int slots;

  static Color colorOf(String letter) => switch (letter) {
        'P' => AppColors.win,
        'F' => AppColors.live,
        'J' => AppColors.pending,
        _ => ProfessorLinksStyle.blue,
      };

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final recent =
        marks.length > slots ? marks.sublist(marks.length - slots) : marks;
    final empty = slots - recent.length;
    return Semantics(
      label: 'Presença nas ${recent.length} últimas aulas',
      child: Row(
        children: [
          for (var i = 0; i < slots; i++) ...[
            if (i > 0) const SizedBox(width: 4),
            Expanded(
              child: Container(
                height: 18,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(4),
                  color: i < empty
                      ? ProfessorLinksStyle.soft(colors)
                      : colorOf(professorMarkLetter(recent[i - empty]))
                          .withValues(alpha: 0.85),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Legenda da faixa de presença.
class ProfessorPresenceLegend extends StatelessWidget {
  const ProfessorPresenceLegend({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    Widget item(String letter, String label) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: ProfessorPresenceStrip.colorOf(letter),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 5),
            Text(
              label,
              style: ProfessorLinksStyle.mono(
                9.5,
                weight: FontWeight.w600,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
          ],
        );
    return Wrap(
      spacing: 12,
      runSpacing: 6,
      children: [
        item('P', 'Presente'),
        item('F', 'Falta'),
        item('J', 'Justificada'),
        item('R', 'Reposição'),
      ],
    );
  }
}

/// Linha "rótulo → valor" dos cartões (com sublinha mono opcional).
class ProfessorInfoRow extends StatelessWidget {
  const ProfessorInfoRow({
    super.key,
    required this.label,
    required this.value,
    this.sub,
    this.valueColor,
    this.last = false,
  });

  final String label;
  final String value;
  final String? sub;
  final Color? valueColor;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 11),
      decoration: BoxDecoration(
        border: last
            ? null
            : Border(
                bottom: BorderSide(color: ProfessorLinksStyle.line(colors)),
              ),
      ),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12.5,
                    color: ProfessorLinksStyle.mute(colors),
                  ),
                ),
                if (sub != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    sub!,
                    style: ProfessorLinksStyle.mono(
                      9.5,
                      weight: FontWeight.w500,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 10),
          Flexible(
            flex: 2,
            child: Align(
              alignment: Alignment.centerRight,
              child: Text(
                value,
                textAlign: TextAlign.right,
                style: ProfessorLinksStyle.display(
                  13,
                  weight: FontWeight.w700,
                  color: valueColor ?? colors.onSurface,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Bloco de linhas com borda (as listas do Mais e os cartões de valor).
class ProfessorRowsBlock extends StatelessWidget {
  const ProfessorRowsBlock({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: ProfessorLinksStyle.line(colors)),
      ),
      child: Column(children: children),
    );
  }
}

/// Barra de progresso fina (vagas, presença).
class ProfessorMeter extends StatelessWidget {
  const ProfessorMeter({super.key, required this.percent, this.color});

  final int percent;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ClipRRect(
      borderRadius: BorderRadius.circular(3),
      child: SizedBox(
        height: 5,
        child: Stack(
          children: [
            Positioned.fill(
              child: ColoredBox(color: ProfessorLinksStyle.soft(colors)),
            ),
            // `heightFactor: 1`: no Stack a restrição é frouxa e o
            // preenchimento sairia com altura 0.
            FractionallySizedBox(
              alignment: Alignment.centerLeft,
              heightFactor: 1,
              widthFactor: (percent.clamp(0, 100)) / 100,
              child: ColoredBox(color: color ?? AppColors.brand),
            ),
          ],
        ),
      ),
    );
  }
}

/// Card de falha com "tentar de novo".
class ProfessorRetryCard extends StatelessWidget {
  const ProfessorRetryCard({
    super.key,
    required this.message,
    required this.onRetry,
  });

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      onTap: onRetry,
      child: Row(
        children: [
          Icon(Icons.refresh_rounded, color: ProfessorLinksStyle.dim(colors)),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              '$message Toque para tentar de novo.',
              style: AppTypography.bodyS.copyWith(
                color: ProfessorLinksStyle.mute(colors),
                height: 1.45,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Texto apagado dentro de card (vazio, aviso curto).
class ProfessorMutedText extends StatelessWidget {
  const ProfessorMutedText(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: AppTypography.bodyS.copyWith(
        color: ProfessorLinksStyle.mute(context.themeColors),
        height: 1.45,
      ),
    );
  }
}
