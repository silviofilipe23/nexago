import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../professor_mode/application/professor_availability_providers.dart';
import '../../messages/application/messages_providers.dart';
import '../../messages/presentation/messages_widgets.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/application/professor_lesson_plans_providers.dart';
import '../../professor_mode/presentation/availability/athlete_private_lessons_pages.dart'
    show openPrivateLessonBooking;
import '../../professor_mode/presentation/lesson_plans/athlete_lesson_plan_pages.dart'
    show openAthleteLessonPlan;
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/athlete_training_providers.dart';
import '../domain/athlete_training.dart';
import '../domain/training_plans.dart';
import 'athlete_training_find_professor_page.dart' show openProfessorProfile;
import 'widgets/training_origin_widgets.dart';
import 'widgets/training_widgets.dart';

/// O4 · Professor particular — o vínculo direto com o professor autônomo:
/// plano/pacote que ELE cobra, próximas particulares, como funciona e o
/// último feedback.
class AthleteTrainingPrivateLinkPage extends ConsumerStatefulWidget {
  const AthleteTrainingPrivateLinkPage({super.key, required this.professorUid});

  final String professorUid;

  @override
  ConsumerState<AthleteTrainingPrivateLinkPage> createState() =>
      _AthleteTrainingPrivateLinkPageState();
}

class _AthleteTrainingPrivateLinkPageState
    extends ConsumerState<AthleteTrainingPrivateLinkPage> {
  bool _opening = false;

  Future<void> _message() async {
    setState(() => _opening = true);
    await openConversationWith(
      context,
      () => ref
          .read(messagesRepositoryProvider)
          .openStudentConversation(widget.professorUid),
      professorMode: false,
    );
    if (mounted) setState(() => _opening = false);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final uid = widget.professorUid;
    final now = ref.watch(professorLinksClockProvider)();
    final all = ref.watch(athleteTrainingsProvider) ?? const [];
    final mine = [
      for (final t in all)
        if (t.isPrivate && t.professorUid == uid) t,
    ];
    final upcoming = upcomingTrainings(mine, now);
    ProfessorTrainingPlan? plan;
    for (final p
        in ref
                .watch(athleteTrainingPlansProvider)
                .valueOrNull
                ?.professorPlans ??
            const <ProfessorTrainingPlan>[]) {
      if (p.professorUid == uid) plan = p;
    }
    String name = plan?.professorName ?? '';
    if (name.isEmpty) {
      for (final p in ref.watch(myProfessorsProvider).valueOrNull ?? const []) {
        if (p.professorUid == uid) name = p.name;
      }
    }
    if (name.isEmpty && mine.isNotEmpty) name = mine.first.professorName;
    final views =
        ref.watch(athleteLessonPlanViewsProvider).valueOrNull ?? const [];
    final feedbacks = [
      for (final v in trainingFeedbacks(views))
        if (v.professorUid == uid) v,
    ];
    final latest = feedbacks.isEmpty ? null : feedbacks.first;

    return ProfessorLinksScaffold(
      title: 'Professor particular',
      subtitle: 'VÍNCULO DIRETO COM O PROFESSOR',
      onBack: () => popOrGo(context, AppRoutes.athleteTrainings),
      trailing: ProfessorLinksRoundButton(
        key: const Key('training-private-message'),
        icon: Icons.chat_bubble_outline_rounded,
        semanticLabel: 'Mensagem',
        onTap: _opening ? () {} : _message,
      ),
      body: RefreshIndicator(
        color: AppColors.brand,
        onRefresh: () async {
          ref.invalidate(athletePrivateLessonsProvider);
          ref.invalidate(athleteTrainingPlansProvider);
          await ref.read(athleteTrainingPlansProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            TrainingOriginHeader(
              origin: TrainingOrigin.private,
              name: name.isEmpty ? 'Professor' : name,
              line: 'Professor independente · cobra direto de você',
              extra: plan?.planName == null
                  ? null
                  : Text(
                      '${plan!.planName!} · cobrado pelo professor'
                          .toUpperCase(),
                      style: ProfessorLinksStyle.mono(
                        9.5,
                        color: ProfessorLinksStyle.mute(colors),
                      ),
                    ),
            ),
            const TrainingSectionTitle('Próximas aulas'),
            if (upcoming.isEmpty)
              const ProfessorLinksCard(
                key: Key('training-private-none'),
                child: ProfessorMutedText('Nenhuma particular marcada.'),
              )
            else
              for (final t in upcoming.take(4)) ...[
                TrainingRow(
                  key: Key('training-private-row-${t.id}'),
                  training: t,
                  onTap: () => openTraining(context, t),
                ),
                const SizedBox(height: 8),
              ],
            const SizedBox(height: 4),
            ProfessorLinksCard(
              key: const Key('training-private-book'),
              onTap: () => openPrivateLessonBooking(
                context,
                professorUid: uid,
                professorName: name,
              ),
              padding: const EdgeInsets.fromLTRB(13, 12, 13, 12),
              child: Row(
                children: [
                  Icon(
                    Icons.add_circle_outline_rounded,
                    size: 18,
                    color: colors.readableTone(ProfessorLinksStyle.blue),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Agendar mais uma aula',
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: colors.readableTone(ProfessorLinksStyle.blue),
                      ),
                    ),
                  ),
                  Icon(
                    Icons.chevron_right_rounded,
                    size: 18,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ],
              ),
            ),
            TrainingSectionTitle(
              'Como funciona com ${trainingFirstName(name).isEmpty ? 'o professor' : trainingFirstName(name)}',
            ),
            TrainingKeyValueCard(
              key: const Key('training-private-rules'),
              rows: [
                ('Quem cobra', 'O professor · Pix ou cartão', null),
                if (plan?.recurringReais != null)
                  (
                    'Mensalidade',
                    '${formatBRL(plan!.recurringReais!)} · todo dia '
                        '${plan.recurringDueDay ?? '-'}',
                    null,
                  ),
                ('Onde', 'Na arena combinada com o professor', null),
                ('Quadra', 'Reservada pelo professor', null),
                ('Remarcação', 'Pelo app ou combinada no chat', null),
              ],
            ),
            if (latest != null) ...[
              TrainingSectionTitle(
                'Último feedback',
                action: 'Todos',
                onAction: () =>
                    context.pushNamed(AppRouteNames.athleteTrainingFeedbacks),
              ),
              ProfessorLinksCard(
                key: const Key('training-private-feedback'),
                onTap: () => openAthleteLessonPlan(context, latest.id),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      [
                        trainingWeekdayDay(latest.date),
                        latest.lessonTitle,
                      ].join(' · ').toUpperCase(),
                      style: ProfessorLinksStyle.mono(
                        9.5,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '“${latest.feedback!.text.trim()}”',
                      maxLines: 4,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 12.5,
                        height: 1.45,
                        color: colors.onSurface,
                      ),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 16),
            ProfessorLinksGhostButton(
              key: const Key('training-private-profile'),
              label: 'Ver perfil do professor',
              onPressed: () => openProfessorProfile(context, uid),
            ),
          ],
        ),
      ),
    );
  }
}
