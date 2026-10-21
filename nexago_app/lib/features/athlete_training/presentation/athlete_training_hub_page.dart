import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/notifications/notification_navigation.dart'
    show athleteAgendaTabLocation;
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../athlete/domain/agenda/athlete_agenda_providers.dart';
import '../../messages/application/messages_providers.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/application/professor_evaluations_providers.dart';
import '../../professor_mode/application/professor_lesson_plans_providers.dart';
import '../../professor_mode/domain/professor_evaluations.dart';
import '../../professor_mode/domain/professor_lesson_plans.dart';
import '../../professor_mode/presentation/lesson_plans/athlete_lesson_plan_pages.dart'
    show openAthleteLessonPlan;
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/athlete_training_providers.dart';
import '../domain/athlete_training.dart';
import '../domain/class_presence.dart';
import 'widgets/class_presence_widgets.dart';
import 'athlete_training_homework_page.dart' show openTrainingHomework;
import 'widgets/training_widgets.dart';

/// T2 · Meus treinos — o hub do aluno: próximo treino, números do mês, o que
/// o professor mandou, a semana e os atalhos para aulas, feedbacks,
/// evolução, professores e particulares.
class AthleteTrainingHubPage extends ConsumerWidget {
  const AthleteTrainingHubPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final now = ref.watch(professorLinksClockProvider)();
    final todayKey = nexagoEventDayKey(now);
    final trainings = ref.watch(athleteTrainingsProvider);
    final views =
        ref.watch(athleteLessonPlanViewsProvider).valueOrNull ?? const [];
    final evaluations =
        ref.watch(receivedEvaluationsProvider).valueOrNull ?? const [];
    final professors = ref.watch(myProfessorsProvider).valueOrNull;
    final charges = ref.watch(myClassChargesProvider).valueOrNull ?? const [];
    final unread = ref.watch(unreadMessagesCountProvider);
    final credits =
        ref.watch(athleteClassCreditsProvider).valueOrNull ?? const [];

    final upcoming = trainings == null
        ? const <TrainingSession>[]
        : upcomingTrainings(trainings, now);
    final next = upcoming.isEmpty ? null : upcoming.first;
    final stats = trainings == null ? null : trainingMonthStats(trainings, now);
    final streak =
        trainings == null ? 0 : trainingCurrentStreak(trainings, now);
    final subtitle = [
      if (professors != null && professors.isNotEmpty)
        '${professors.length} ${professors.length == 1 ? 'PROFESSOR' : 'PROFESSORES'}',
      if (upcoming.isNotEmpty)
        '${upcoming.length} ${upcoming.length == 1 ? 'AULA MARCADA' : 'AULAS MARCADAS'}',
    ].join(' · ');

    return ProfessorLinksScaffold(
      title: 'Meus treinos',
      subtitle: subtitle.isEmpty ? 'AULAS E PROFESSORES' : subtitle,
      onBack: () => popOrGo(context, AppRoutes.home),
      trailing: Stack(
        clipBehavior: Clip.none,
        children: [
          ProfessorLinksRoundButton(
            key: const Key('training-hub-messages'),
            icon: Icons.chat_bubble_outline_rounded,
            semanticLabel: 'Mensagens',
            onTap: () => context.pushNamed(AppRouteNames.athleteMessages),
          ),
          if (unread > 0)
            Positioned(
              top: -4,
              right: -4,
              child: TrainingBadge(count: unread),
            ),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.brand,
        onRefresh: () async {
          ref.invalidate(myClassAgendaProvider);
          ref.invalidate(myProfessorsProvider);
          ref.invalidate(myClassChargesProvider);
          ref.invalidate(athleteClassCreditsProvider);
          await ref.read(myClassAgendaProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            if (trainings == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.brand),
                ),
              )
            else if (next != null)
              TrainingNextCard(
                training: next,
                todayKey: todayKey,
                big: true,
                plan: lessonPlanViewFor(views, next.planKind, next.id),
                primaryLabel: 'Detalhes',
                onPrimary: () => openTraining(context, next),
                presence: TrainingPresenceButton.appliesTo(next, now)
                    ? TrainingPresenceButton(training: next)
                    : null,
              )
            else
              _NoNextTraining(
                canBook: professors != null && professors.isNotEmpty,
              ),
            if (stats != null && (stats.attended > 0 || streak > 0)) ...[
              const SizedBox(height: 12),
              TrainingStatRow(
                children: [
                  TrainingStatTile(
                    key: const Key('training-stat-presence'),
                    value: stats.presencePercent == null
                        ? '—'
                        : '${stats.presencePercent}%',
                    label: 'presença no mês',
                  ),
                  TrainingStatTile(
                    key: const Key('training-stat-streak'),
                    value: '$streak',
                    label: streak == 1 ? 'treino seguido' : 'treinos seguidos',
                  ),
                  TrainingStatTile(
                    key: const Key('training-stat-month'),
                    value: '${stats.attended}',
                    label: stats.attended == 1
                        ? 'treino no mês'
                        : 'treinos no mês',
                    color: ProfessorLinksStyle.blue,
                  ),
                ],
              ),
            ],
            if (credits.isNotEmpty) ...[
              const SizedBox(height: 12),
              TrainingTilesBlock(
                children: [
                  TrainingListTile(
                    key: const Key('training-hub-credits'),
                    icon: Icons.autorenew_rounded,
                    highlight: true,
                    title: credits.length == 1
                        ? '1 crédito de reposição'
                        : '${credits.length} créditos de reposição',
                    subtitle: 'Válido até '
                        '${classDayMonthLabel(credits.first.expiresOn)} · '
                        'escolher horário',
                    onTap: () => openTrainingMakeup(
                      context,
                      creditId: credits.first.creditId,
                    ),
                  ),
                ],
              ),
            ],
            ..._fromProfessor(context, views, evaluations, now),
            if (upcoming.length > 1) ...[
              TrainingSectionTitle(
                'Próximas aulas',
                action: 'Todas as aulas',
                onAction: () =>
                    context.pushNamed(AppRouteNames.athleteTrainingClasses),
              ),
              for (final t in upcoming.skip(1).take(3)) ...[
                TrainingRow(
                  key: Key('training-hub-row-${t.id}'),
                  training: t,
                  onTap: () => openTraining(context, t),
                ),
                const SizedBox(height: 8),
              ],
            ],
            if (charges.isNotEmpty) ...[
              const TrainingSectionTitle('Pagamentos'),
              TrainingTilesBlock(
                children: [
                  TrainingListTile(
                    key: const Key('training-hub-charges'),
                    icon: Icons.receipt_long_outlined,
                    title: charges.length == 1
                        ? '1 mensalidade em aberto'
                        : '${charges.length} mensalidades em aberto',
                    subtitle: charges.first.description,
                    highlight: charges.any((c) => c.overdue),
                    onTap: () => context.go(athleteAgendaTabLocation),
                  ),
                ],
              ),
            ],
            const TrainingSectionTitle('Tudo sobre seus treinos'),
            TrainingTilesBlock(
              children: [
                TrainingListTile(
                  key: const Key('training-hub-classes'),
                  icon: Icons.event_note_outlined,
                  title: 'Minhas aulas',
                  subtitle: 'Próximas e histórico de presença',
                  onTap: () =>
                      context.pushNamed(AppRouteNames.athleteTrainingClasses),
                ),
                TrainingListTile(
                  key: const Key('training-hub-feedbacks'),
                  icon: Icons.sticky_note_2_outlined,
                  title: 'Feedbacks',
                  subtitle: 'O que os professores disseram de cada aula',
                  highlight: trainingNewFeedbackCount(views, now) > 0,
                  onTap: () =>
                      context.pushNamed(AppRouteNames.athleteTrainingFeedbacks),
                ),
                TrainingListTile(
                  key: const Key('training-hub-evolution'),
                  icon: Icons.trending_up_rounded,
                  title: 'Minha evolução',
                  subtitle: 'Avaliação por fundamento e frequência',
                  onTap: () =>
                      context.pushNamed(AppRouteNames.athleteTrainingEvolution),
                ),
                TrainingListTile(
                  key: const Key('training-hub-professors'),
                  icon: Icons.sports_outlined,
                  title: 'Meus professores',
                  subtitle: 'Mensagem e agendamento',
                  onTap: () => context
                      .pushNamed(AppRouteNames.athleteTrainingProfessors),
                ),
                TrainingListTile(
                  key: const Key('training-hub-private'),
                  icon: Icons.event_available_outlined,
                  title: 'Aulas particulares',
                  subtitle: 'Agendar, remarcar e cancelar',
                  onTap: () =>
                      context.pushNamed(AppRouteNames.athletePrivateLessons),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// "Do professor pra você": feedback mais recente, tarefa e avaliação.
  List<Widget> _fromProfessor(
    BuildContext context,
    List<LessonPlanView> views,
    List<ProfessorEvaluation> evaluations,
    DateTime now,
  ) {
    final feedbacks = trainingFeedbacks(views);
    final latest = feedbacks.isEmpty ? null : feedbacks.first;
    final homework = latestTrainingHomework(views);
    final evaluation = evaluations.isEmpty ? null : evaluations.first;
    final tiles = <Widget>[
      if (latest != null)
        TrainingListTile(
          key: const Key('training-hub-latest-feedback'),
          icon: Icons.sticky_note_2_outlined,
          title: 'Feedback · ${latest.lessonTitle}',
          subtitle: [
            trainingFirstName(latest.professorName),
            if (latest.feedback?.sentAt != null)
              lessonRelativeAgo(latest.feedback!.sentAt!, now),
          ].join(' · '),
          highlight: trainingFeedbackIsNew(latest, now),
          onTap: () => openAthleteLessonPlan(context, latest.id),
        ),
      if (homework != null)
        TrainingListTile(
          key: const Key('training-hub-homework'),
          icon: Icons.play_circle_outline_rounded,
          title: 'Tarefa: ${homework.feedback!.homework!.name}',
          subtitle: homework.feedback!.homework!.detail.isEmpty
              ? trainingFirstName(homework.professorName)
              : homework.feedback!.homework!.detail,
          highlight: trainingFeedbackIsNew(homework, now),
          onTap: () => openTrainingHomework(context, homework.id),
        ),
      if (evaluation != null)
        TrainingListTile(
          key: const Key('training-hub-evaluation'),
          icon: Icons.trending_up_rounded,
          title: 'Avaliação de ${evaluationPeriodLabel(evaluation.period)}',
          subtitle: evaluation.delta == null
              ? 'Média ${evaluationScoreLabel(evaluation.overall)}'
              : 'Média ${evaluationScoreLabel(evaluation.overall)} · '
                  '${evaluationDeltaLabel(evaluation.delta!)}',
          onTap: () => context.pushNamed(
            AppRouteNames.athleteEvaluation,
            pathParameters: {'evaluationId': evaluation.id},
          ),
        ),
    ];
    if (tiles.isEmpty) return const [];
    return [
      const TrainingSectionTitle('Do professor pra você'),
      TrainingTilesBlock(children: tiles),
    ];
  }
}

/// Sem treino marcado: convite para agendar uma particular.
class _NoNextTraining extends StatelessWidget {
  const _NoNextTraining({required this.canBook});

  final bool canBook;

  @override
  Widget build(BuildContext context) {
    return ProfessorLinksCard(
      key: const Key('training-hub-empty'),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ProfessorLinksKicker('Próximo treino'),
          const SizedBox(height: 8),
          const ProfessorMutedText(
            'Nenhuma aula marcada por agora. As aulas da sua turma e as '
            'particulares aparecem aqui.',
          ),
          if (canBook) ...[
            const SizedBox(height: 12),
            ProfessorLinksPrimaryButton(
              key: const Key('training-hub-book'),
              label: 'Agendar particular',
              height: 44,
              onPressed: () =>
                  context.pushNamed(AppRouteNames.athletePrivateLessons),
            ),
          ],
        ],
      ),
    );
  }
}
