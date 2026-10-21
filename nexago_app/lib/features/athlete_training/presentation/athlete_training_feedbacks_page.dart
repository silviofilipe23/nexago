import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/application/professor_lesson_plans_providers.dart';
import '../../professor_mode/domain/professor_lesson_plans.dart';
import '../../professor_mode/presentation/lesson_plans/athlete_lesson_plan_pages.dart'
    show openAthleteLessonPlan;
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../domain/athlete_training.dart';
import 'widgets/training_widgets.dart';

/// T7 · Feedbacks — o que todos os professores escreveram depois das aulas
/// (`lessonPlanViews.feedback`), mais recente primeiro. Toque abre a aula
/// (H9: feedback, tarefa, estrelas e responder ao professor).
class AthleteTrainingFeedbacksPage extends ConsumerStatefulWidget {
  const AthleteTrainingFeedbacksPage({super.key});

  @override
  ConsumerState<AthleteTrainingFeedbacksPage> createState() =>
      _AthleteTrainingFeedbacksPageState();
}

class _AthleteTrainingFeedbacksPageState
    extends ConsumerState<AthleteTrainingFeedbacksPage> {
  String? _professor;

  @override
  Widget build(BuildContext context) {
    final now = ref.watch(professorLinksClockProvider)();
    final async = ref.watch(athleteLessonPlanViewsProvider);
    final all =
        async.valueOrNull == null ? null : trainingFeedbacks(async.value!);
    final names = <String>[];
    for (final v in all ?? const <LessonPlanView>[]) {
      final n = trainingFirstName(v.professorName);
      if (n.isNotEmpty && !names.contains(n)) names.add(n);
    }
    final shown = all
        ?.where((v) =>
            _professor == null ||
            trainingFirstName(v.professorName) == _professor)
        .toList();
    final fresh = all == null ? 0 : trainingNewFeedbackCount(all, now);

    return ProfessorLinksScaffold(
      title: 'Feedbacks',
      subtitle: all == null
          ? null
          : [
              '${all.length} ${all.length == 1 ? 'RECEBIDO' : 'RECEBIDOS'}',
              if (fresh > 0) '$fresh ${fresh == 1 ? 'NOVO' : 'NOVOS'}',
            ].join(' · '),
      onBack: () => popOrGo(context, AppRoutes.athleteTrainings),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (names.length > 1) ...[
            TrainingProfessorChips(
              names: names,
              selected: _professor,
              onChanged: (n) => setState(() => _professor = n),
            ),
            const SizedBox(height: 14),
          ],
          if (shown == null && async.hasError)
            ProfessorRetryCard(
              message: 'Não foi possível carregar os feedbacks.',
              onRetry: () => ref.invalidate(athleteLessonPlanViewsProvider),
            )
          else if (shown == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.brand),
              ),
            )
          else if (shown.isEmpty)
            const ProfessorLinksCard(
              key: Key('training-feedbacks-empty'),
              child: ProfessorMutedText(
                'Nenhum feedback ainda. Depois da aula, o que o professor '
                'escrever para você aparece aqui.',
              ),
            )
          else
            for (final v in shown) ...[
              _FeedbackCard(view: v, isNew: trainingFeedbackIsNew(v, now)),
              const SizedBox(height: 10),
            ],
        ],
      ),
    );
  }
}

class _FeedbackCard extends StatelessWidget {
  const _FeedbackCard({required this.view, required this.isNew});

  final LessonPlanView view;
  final bool isNew;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fb = view.feedback!;
    final when = [
      if (view.date.isNotEmpty) trainingWeekdayDay(view.date),
      if (isNew) 'NOVO',
    ].join(' · ');
    return ProfessorLinksCard(
      key: Key('training-feedback-${view.id}'),
      onTap: () => openAthleteLessonPlan(context, view.id),
      backgroundColor: isNew ? AppColors.brand.withValues(alpha: 0.06) : null,
      borderColor: isNew ? AppColors.brand.withValues(alpha: 0.35) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ArenaClassAvatar(
                initials: arenaClassInitials(view.professorName),
                size: 32,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      view.professorName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ProfessorLinksStyle.display(
                        13,
                        weight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    Text(
                      [view.lessonTitle, view.arenaName]
                          .where((s) => s.isNotEmpty)
                          .join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 11,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ],
                ),
              ),
              if (when.isNotEmpty)
                Text(
                  when,
                  style: ProfessorLinksStyle.mono(
                    9.5,
                    color: isNew
                        ? colors.brandText
                        : ProfessorLinksStyle.dim(colors),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            fb.text,
            style: AppTypography.bodyM.copyWith(
              fontSize: 13,
              height: 1.5,
              color: colors.onSurface,
            ),
          ),
          if (fb.homework != null || view.ratingStars != null) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                if (fb.homework != null)
                  ArenaClassTag(
                    label: 'Tarefa · ${fb.homework!.name}',
                    color: ProfessorLinksStyle.mute(colors),
                    background: colors.surfaceRaised,
                  ),
                if (view.ratingStars != null)
                  ArenaClassTag(
                    label: 'Você deu ${view.ratingStars}/5',
                    color: AppColors.win,
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
