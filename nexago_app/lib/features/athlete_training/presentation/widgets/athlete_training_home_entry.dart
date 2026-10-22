import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/time/nexago_event_timezone.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../professor_links/application/professor_links_providers.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../../professor_mode/application/professor_lesson_plans_providers.dart';
import '../../../professor_mode/domain/professor_lesson_plans.dart';
import '../../../professor_mode/presentation/lesson_plans/athlete_lesson_plan_pages.dart'
    show openAthleteLessonPlan;
import '../../application/athlete_training_providers.dart';
import '../../domain/athlete_training.dart';
import 'class_presence_widgets.dart';
import 'training_widgets.dart';

/// T1 · Entrada de Treinos na aba Início: o cartão "Próximo treino" (ou, sem
/// aula marcada, um atalho para Meus treinos) e o feedback novo do
/// professor. Só aparece para quem tem aula, particular ou plano/feedback —
/// quem não treina com professor não vê nada (nem o respiro).
///
/// O "Próximo treino" começa compacto (uma linha); a seta expande para o
/// cartão inteiro, com plano, presença e botões.
class AthleteTrainingHomeEntry extends ConsumerStatefulWidget {
  const AthleteTrainingHomeEntry({super.key, this.initiallyExpanded = false});

  final bool initiallyExpanded;

  @override
  ConsumerState<AthleteTrainingHomeEntry> createState() =>
      _AthleteTrainingHomeEntryState();
}

class _AthleteTrainingHomeEntryState
    extends ConsumerState<AthleteTrainingHomeEntry> {
  late bool _expanded = widget.initiallyExpanded;

  void _toggle() => setState(() => _expanded = !_expanded);

  @override
  Widget build(BuildContext context) {
    if (!ref.watch(athleteHasTrainingsProvider)) return const SizedBox.shrink();
    final now = ref.watch(professorLinksClockProvider)();
    final trainings = ref.watch(athleteTrainingsProvider) ?? const [];
    final views =
        ref.watch(athleteLessonPlanViewsProvider).valueOrNull ?? const [];
    final badge = ref.watch(athleteTrainingNewFeedbackCountProvider);
    final next = nextTraining(trainings, now);
    final feedbacks = trainingFeedbacks(views);
    final fresh =
        feedbacks.isNotEmpty && trainingFeedbackIsNew(feedbacks.first, now)
            ? feedbacks.first
            : null;
    void openHub() => context.pushNamed(AppRouteNames.athleteTrainings);

    return Padding(
      key: const Key('athlete-training-home-entry'),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        0,
        AppSpacing.screenH,
        AppSpacing.sectionGap,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (next != null)
            AnimatedSize(
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOutCubic,
              alignment: Alignment.topCenter,
              child: _expanded
                  ? TrainingNextCard(
                      training: next,
                      todayKey: nexagoEventDayKey(now),
                      plan: lessonPlanViewFor(views, next.planKind, next.id),
                      primaryLabel: 'Meus treinos',
                      badge: badge,
                      onPrimary: openHub,
                      onCollapse: _toggle,
                      presence: TrainingPresenceButton.appliesTo(next, now)
                          ? TrainingPresenceButton(training: next)
                          : null,
                    )
                  : TrainingNextCompactCard(
                      training: next,
                      todayKey: nexagoEventDayKey(now),
                      badge: badge,
                      onExpand: _toggle,
                    ),
            )
          else
            _HubShortcut(badge: badge, onTap: openHub),
          if (fresh != null) ...[
            const SizedBox(height: 10),
            _FreshFeedback(view: fresh),
          ],
        ],
      ),
    );
  }
}

/// Sem aula marcada: uma linha que leva ao hub.
class _HubShortcut extends StatelessWidget {
  const _HubShortcut({required this.badge, required this.onTap});

  final int badge;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      key: const Key('athlete-training-home-shortcut'),
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(13, 12, 12, 12),
      borderColor: AppColors.brand.withValues(alpha: 0.32),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child:
                Icon(Icons.sports_rounded, size: 20, color: colors.brandText),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Meus treinos',
                  style: ProfessorLinksStyle.display(
                    14,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Aulas, feedbacks e evolução com seus professores',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
          if (badge > 0) ...[
            const SizedBox(width: 8),
            TrainingBadge(count: badge),
          ],
          const SizedBox(width: 4),
          Icon(
            Icons.chevron_right_rounded,
            size: 18,
            color: ProfessorLinksStyle.dim(colors),
          ),
        ],
      ),
    );
  }
}

/// "Feedback novo do Thiago — “Joelho bem melhor!…”".
class _FreshFeedback extends StatelessWidget {
  const _FreshFeedback({required this.view});

  final LessonPlanView view;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      key: const Key('athlete-training-home-feedback'),
      onTap: () => openAthleteLessonPlan(context, view.id),
      padding: const EdgeInsets.all(13),
      child: Row(
        children: [
          ArenaClassAvatar(
            initials: arenaClassInitials(view.professorName),
            size: 36,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Feedback novo do ${trainingFirstName(view.professorName)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.display(
                    13,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '“${view.feedback!.text}”',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            width: 8,
            height: 8,
            decoration: const BoxDecoration(
              color: AppColors.brand,
              shape: BoxShape.circle,
            ),
          ),
        ],
      ),
    );
  }
}
