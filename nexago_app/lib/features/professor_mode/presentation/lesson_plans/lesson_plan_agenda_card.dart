import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_lesson_plans_providers.dart';
import '../../domain/professor_lesson_plans.dart';
import 'lesson_plan_widgets.dart';

/// "Plano da aula" no detalhe da aula da agenda (E4/E5): os blocos (tempo e
/// nome) quando há plano, ou "Planejar aula". O toque abre o editor (H2).
class LessonPlanAgendaCard extends ConsumerWidget {
  const LessonPlanAgendaCard({
    super.key,
    required this.kind,
    required this.refId,
  });

  final LessonPlanKind kind;
  final String refId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final async =
        ref.watch(professorLessonPlanProvider((kind: kind, refId: refId)));
    final plan = async.valueOrNull;
    void open() => openLessonPlanEditor(context, kind: kind, refId: refId);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const Expanded(child: ProfessorLinksKicker('Plano da aula')),
            if (plan != null)
              Text(
                plan.isReady ? 'PRONTO' : 'RASCUNHO',
                style: ProfessorLinksStyle.mono(
                  9.5,
                  color: colors.readableTone(
                    plan.isReady ? AppColors.win : AppColors.pending,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        ProfessorLinksCard(
          key: const Key('lesson-plan-agenda-card'),
          padding: const EdgeInsets.fromLTRB(13, 11, 13, 11),
          onTap: open,
          child: plan == null || plan.blocks.isEmpty
              ? Row(
                  children: [
                    Icon(Icons.edit_note_rounded,
                        size: 20,
                        color: colors.readableTone(AppColors.brandHover)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        async.isLoading ? 'Carregando plano…' : 'Planejar aula',
                        key: const Key('lesson-plan-agenda-empty'),
                        style: ProfessorLinksStyle.display(
                          13.5,
                          weight: FontWeight.w600,
                          color: colors.onSurface,
                        ),
                      ),
                    ),
                    Icon(Icons.chevron_right_rounded,
                        color: ProfessorLinksStyle.dim(colors)),
                  ],
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final b in plan.blocks)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 3),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(
                              width: 34,
                              child: Text(
                                '${b.minutes}′',
                                style: ProfessorLinksStyle.mono(
                                  11,
                                  color: colors.readableTone(AppColors.brand),
                                ),
                              ),
                            ),
                            Expanded(
                              child: Text(
                                b.name,
                                style: AppTypography.bodyS.copyWith(
                                  fontSize: 12.5,
                                  color: colors.onSurface,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}
