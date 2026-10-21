import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../domain/professor_lesson_plans.dart';
import '../agenda/professor_agenda_widgets.dart' show ProfessorHatchPainter;

/// Peças do plano de aula (protótipo `pa-app-plano-a/b.jsx`, H1–H5, H8).

Color lessonPlanCategoryColor(LessonPlanCategory c) => Color(c.argb);

Color lessonPlanRowStatusColor(LessonPlanRowStatus s, AppThemeColors c) =>
    switch (s) {
      LessonPlanRowStatus.ready => AppColors.win,
      LessonPlanRowStatus.draft => AppColors.pending,
      LessonPlanRowStatus.none => ProfessorLinksStyle.dim(c),
    };

/// Abre o editor (H2) da aula; [prefill] = modelo ou plano anterior.
void openLessonPlanEditor(
  BuildContext context, {
  required LessonPlanKind kind,
  required String refId,
  LessonPlanContent? prefill,
}) {
  context.pushNamed(
    AppRouteNames.professorLessonPlanEditor,
    queryParameters: {'kind': kind.id, 'refId': refId},
    extra: prefill,
  );
}

/// Etiqueta do fundamento: bolinha + nome em caixa alta.
class LessonPlanCategoryTag extends StatelessWidget {
  const LessonPlanCategoryTag(this.category, {super.key, this.small = true});

  final LessonPlanCategory category;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = lessonPlanCategoryColor(category);
    return Container(
      height: small ? 18 : 22,
      padding: EdgeInsets.symmetric(horizontal: small ? 6 : 8),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 5,
            height: 5,
            decoration: BoxDecoration(color: c, shape: BoxShape.circle),
          ),
          const SizedBox(width: 5),
          Text(
            category.label.toUpperCase(),
            style: ProfessorLinksStyle.mono(
              small ? 8.5 : 9.5,
              color: colors.readableTone(c),
            ).copyWith(letterSpacing: 0.6),
          ),
        ],
      ),
    );
  }
}

/// Um pedaço da barra de tempo.
typedef LessonPlanBarSegment = ({LessonPlanCategory category, int minutes});

/// Barra de tempo: um pedaço por bloco, na cor do fundamento, e o que falta
/// para a duração da aula tracejado.
class LessonPlanTimeBar extends StatelessWidget {
  const LessonPlanTimeBar({
    super.key,
    required this.segments,
    required this.durationMin,
    this.height = 10,
  });

  final List<LessonPlanBarSegment> segments;
  final int durationMin;
  final double height;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final total = segments.fold<int>(0, (s, b) => s + b.minutes);
    final rest = durationMin - total;
    return SizedBox(
      height: height,
      child: Row(
        children: [
          for (var i = 0; i < segments.length; i++) ...[
            if (i > 0) const SizedBox(width: 2),
            Expanded(
              flex: segments[i].minutes.clamp(1, 1000),
              child: Container(
                decoration: BoxDecoration(
                  color: lessonPlanCategoryColor(segments[i].category),
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
          ],
          if (rest > 0) ...[
            if (segments.isNotEmpty) const SizedBox(width: 2),
            Expanded(
              flex: rest,
              child: Container(
                key: const Key('lesson-plan-bar-rest'),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(3),
                  border: Border.all(color: ProfessorLinksStyle.line2(colors)),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

List<LessonPlanBarSegment> lessonPlanSegmentsOf(
  Iterable<LessonPlanBlock> blocks,
) =>
    [for (final b in blocks) (category: b.category, minutes: b.minutes)];

/// Chip de filtro/seleção (fundamento, nível).
class LessonPlanChip extends StatelessWidget {
  const LessonPlanChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
    this.color,
  });

  final String label;
  final bool selected;
  final VoidCallback? onTap;

  /// Bolinha da cor do fundamento.
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: selected
          ? AppColors.brand.withValues(alpha: 0.12)
          : ProfessorLinksStyle.soft(colors),
      shape: StadiumBorder(
        side: BorderSide(
          color: selected ? AppColors.brand : ProfessorLinksStyle.line2(colors),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (color != null) ...[
                Container(
                  width: 6,
                  height: 6,
                  decoration:
                      BoxDecoration(color: color, shape: BoxShape.circle),
                ),
                const SizedBox(width: 6),
              ],
              Text(
                label,
                style: AppTypography.bodyS.copyWith(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: selected
                      ? colors.readableTone(AppColors.brandHover)
                      : ProfessorLinksStyle.mute(colors),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Miniatura listrada do exercício (sem mídia nesta fase).
class LessonExerciseThumb extends StatelessWidget {
  const LessonExerciseThumb(
      {super.key, required this.category, this.size = 52});

  final LessonPlanCategory category;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = lessonPlanCategoryColor(category);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.withValues(alpha: 0.3)),
      ),
      clipBehavior: Clip.antiAlias,
      child: CustomPaint(
        painter: ProfessorHatchPainter(color: c),
        child: Center(
          child: Icon(Icons.change_history_rounded, size: 18, color: c),
        ),
      ),
    );
  }
}

/// Espaço do diagrama/vídeo (H4): listrado, sem mídia nesta fase.
class LessonExerciseMediaPlaceholder extends StatelessWidget {
  const LessonExerciseMediaPlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      key: const Key('lesson-exercise-media'),
      height: 170,
      decoration: BoxDecoration(
        color: ProfessorLinksStyle.soft(colors),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: ProfessorLinksStyle.line(colors)),
      ),
      clipBehavior: Clip.antiAlias,
      child: CustomPaint(
        painter: ProfessorHatchPainter(color: colors.onSurface),
        child: Center(
          child: Text(
            'DIAGRAMA DA QUADRA / VÍDEO',
            style: ProfessorLinksStyle.mono(
              10.5,
              color: ProfessorLinksStyle.dim(colors),
            ).copyWith(letterSpacing: 1),
          ),
        ),
      ),
    );
  }
}

/// Contador ± (duração do exercício/bloco).
class LessonPlanStepper extends StatelessWidget {
  const LessonPlanStepper({
    super.key,
    required this.value,
    required this.onChanged,
    this.min = 5,
    this.max = 60,
    this.step = 5,
  });

  final int value;
  final ValueChanged<int> onChanged;
  final int min;
  final int max;
  final int step;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    Widget btn(String label, String semantic, int next, Key key) => Semantics(
          button: true,
          label: semantic,
          child: Material(
            color: ProfessorLinksStyle.soft(colors),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
              side: BorderSide(color: ProfessorLinksStyle.line2(colors)),
            ),
            child: InkWell(
              key: key,
              borderRadius: BorderRadius.circular(10),
              onTap: next == value ? null : () => onChanged(next),
              child: SizedBox.square(
                dimension: 34,
                child: Center(
                  child: Text(
                    label,
                    style: ProfessorLinksStyle.display(
                      16,
                      weight: FontWeight.w600,
                      color: colors.onSurface,
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        btn('−', 'Menos $step minutos', (value - step).clamp(min, max),
            const Key('lesson-plan-stepper-minus')),
        SizedBox(
          width: 48,
          child: Text(
            '$value′',
            key: const Key('lesson-plan-stepper-value'),
            textAlign: TextAlign.center,
            style: ProfessorLinksStyle.mono(15, color: colors.onSurface),
          ),
        ),
        btn('+', 'Mais $step minutos', (value + step).clamp(min, max),
            const Key('lesson-plan-stepper-plus')),
      ],
    );
  }
}

/// Botão de visibilidade ("Só eu" / "Turma vê").
class LessonPlanVisibilityButton extends StatelessWidget {
  const LessonPlanVisibilityButton({
    super.key,
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fg = selected
        ? colors.readableTone(AppColors.brandHover)
        : ProfessorLinksStyle.mute(colors);
    return Material(
      color: selected
          ? AppColors.brand.withValues(alpha: 0.12)
          : ProfessorLinksStyle.soft(colors),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(11),
        side: BorderSide(
          color: selected ? AppColors.brand : ProfessorLinksStyle.line2(colors),
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(11),
        onTap: onTap,
        child: SizedBox(
          height: 38,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 14, color: fg),
              const SizedBox(width: 6),
              Text(
                label,
                style: AppTypography.bodyS.copyWith(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: fg,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Selo PRIVADO / ALUNO VÊ (toque alterna).
class LessonPlanFocusVisibilityTag extends StatelessWidget {
  const LessonPlanFocusVisibilityTag({
    super.key,
    required this.public,
    this.onTap,
  });

  final bool public;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = public ? AppColors.win : ProfessorLinksStyle.dim(colors);
    return Material(
      color: public
          ? AppColors.win.withValues(alpha: 0.10)
          : ProfessorLinksStyle.soft(colors),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(
          color: public
              ? AppColors.win.withValues(alpha: 0.3)
              : ProfessorLinksStyle.line2(colors),
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                public ? Icons.visibility_outlined : Icons.lock_outline_rounded,
                size: 12,
                color: colors.readableTone(c),
              ),
              const SizedBox(width: 4),
              Text(
                public ? 'ALUNO VÊ' : 'PRIVADO',
                style: ProfessorLinksStyle.mono(
                  9.5,
                  color: colors.readableTone(c),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Nota do bloco com cadeado (só eu) ou olho (a turma vê).
class LessonPlanNoteBox extends StatelessWidget {
  const LessonPlanNoteBox({
    super.key,
    required this.text,
    required this.public,
  });

  final String text;
  final bool public;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
      decoration: BoxDecoration(
        color: public
            ? AppColors.win.withValues(alpha: 0.07)
            : ProfessorLinksStyle.soft(colors),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: public
              ? AppColors.win.withValues(alpha: 0.25)
              : ProfessorLinksStyle.line(colors),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Icon(
              public ? Icons.visibility_outlined : Icons.lock_outline_rounded,
              size: 12,
              color: public
                  ? colors.readableTone(AppColors.win)
                  : ProfessorLinksStyle.dim(colors),
            ),
          ),
          const SizedBox(width: 7),
          Expanded(
            child: Text(
              text,
              style: AppTypography.bodyS.copyWith(
                fontSize: 11.5,
                height: 1.4,
                color: ProfessorLinksStyle.mute(colors),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Abas em pílula (Próximas / Modelos / Exercícios).
class LessonPlanSegmented extends StatelessWidget {
  const LessonPlanSegmented({
    super.key,
    required this.labels,
    required this.index,
    required this.onChanged,
  });

  final List<String> labels;
  final int index;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: ProfessorLinksStyle.soft(colors),
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: ProfessorLinksStyle.line(colors)),
      ),
      child: Row(
        children: [
          for (var i = 0; i < labels.length; i++)
            Expanded(
              child: Material(
                color: i == index
                    ? ProfessorLinksStyle.line2(colors)
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(10),
                child: InkWell(
                  key: Key('lesson-plans-tab-$i'),
                  borderRadius: BorderRadius.circular(10),
                  onTap: () => onChanged(i),
                  child: SizedBox(
                    height: 34,
                    child: Center(
                      child: Text(
                        labels[i],
                        style: AppTypography.bodyS.copyWith(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                          color: i == index
                              ? colors.onSurface
                              : ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Botão pequeno das linhas sem plano ("Planejar", "Usar modelo").
class LessonPlanSmallButton extends StatelessWidget {
  const LessonPlanSmallButton({
    super.key,
    required this.label,
    required this.onTap,
    this.icon,
    this.accent = false,
  });

  final String label;
  final IconData? icon;
  final bool accent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fg = accent
        ? colors.readableTone(AppColors.brandHover)
        : ProfessorLinksStyle.mute(colors);
    return Material(
      color: accent
          ? AppColors.brand.withValues(alpha: 0.12)
          : ProfessorLinksStyle.soft(colors),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(9),
        side: BorderSide(
          color: accent
              ? AppColors.brand.withValues(alpha: 0.4)
              : ProfessorLinksStyle.line2(colors),
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(9),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 13, color: fg),
                const SizedBox(width: 5),
              ],
              Text(
                label,
                style: AppTypography.bodyS.copyWith(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w600,
                  color: fg,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Botão tracejado "+ Adicionar exercício".
class LessonPlanAddButton extends StatelessWidget {
  const LessonPlanAddButton({
    super.key,
    required this.label,
    required this.onTap,
  });

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: ProfessorLinksStyle.line2(colors)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: SizedBox(
          height: 48,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.add_rounded,
                  size: 16, color: ProfessorLinksStyle.mute(colors)),
              const SizedBox(width: 7),
              Text(
                label,
                style: AppTypography.bodyS.copyWith(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: ProfessorLinksStyle.mute(colors),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
