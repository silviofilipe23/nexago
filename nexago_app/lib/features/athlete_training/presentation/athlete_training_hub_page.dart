import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/training_plans.dart';

import '../../../core/theme/app_typography.dart';

import '../../../core/theme/app_theme_colors.dart';

import '../../../core/formatting/app_currency_format.dart';

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
import 'widgets/training_origin_widgets.dart';
import 'widgets/training_widgets.dart';
import 'widgets/class_review_widgets.dart';
import '../domain/class_review.dart';
import '../domain/training_origin_links.dart';
import 'athlete_training_add_page.dart' show CenterInviteCard;
import 'training_shell_page.dart';

/// T2 · Meus treinos — o hub do aluno: próximo treino, números do mês, o que
/// o professor mandou, a semana e os atalhos para aulas, feedbacks,
/// evolução, professores e particulares.
class AthleteTrainingHubPage extends ConsumerStatefulWidget {
  const AthleteTrainingHubPage({super.key});

  @override
  ConsumerState<AthleteTrainingHubPage> createState() =>
      _AthleteTrainingHubPageState();
}

class _AthleteTrainingHubPageState
    extends ConsumerState<AthleteTrainingHubPage> {
  /// Filtro Particular · Arena · Centro (`null` = todos).
  TrainingOrigin? _origin;

  @override
  Widget build(BuildContext context) {
    final now = ref.watch(professorLinksClockProvider)();
    final todayKey = nexagoEventDayKey(now);
    final trainings = ref.watch(athleteTrainingsProvider);
    final views =
        ref.watch(athleteLessonPlanViewsProvider).valueOrNull ?? const [];
    final evaluations =
        ref.watch(receivedEvaluationsProvider).valueOrNull ?? const [];
    final professors = ref.watch(myProfessorsProvider).valueOrNull;
    final charges = ref.watch(myClassChargesProvider).valueOrNull ?? const [];
    final plans = ref.watch(athleteTrainingPlansProvider).valueOrNull;
    final unread = ref.watch(unreadMessagesCountProvider);
    final pendingReviews =
        ref.watch(pendingClassReviewsProvider) ?? const <PendingReview>[];
    final credits =
        ref.watch(athleteClassCreditsProvider).valueOrNull ?? const [];
    final centers =
        ref.watch(athleteTrainingCentersProvider).valueOrNull ?? const [];
    final invites =
        ref.watch(athleteTrainingCentersDataProvider).valueOrNull?.invites ??
        const [];

    final allUpcoming = trainings == null
        ? const <TrainingSession>[]
        : upcomingTrainings(trainings, now);
    final links = trainingOriginLinks(
      upcoming: allUpcoming,
      plans: plans,
      centers: centers,
      credits: credits,
      todayKey: todayKey,
    );
    final origins = {
      ...trainingOriginsOf(trainings ?? const []),
      for (final l in links) l.origin,
    }.toList()
      ..sort((a, b) => a.index.compareTo(b.index));
    final origin = origins.contains(_origin) ? _origin : null;
    final upcoming = [
      for (final t in allUpcoming)
        if (trainingMatchesOrigin(t, origin)) t,
    ];
    final next = upcoming.isEmpty ? null : upcoming.first;
    final multi = origins.length > 1;
    final stats = trainings == null ? null : trainingMonthStats(trainings, now);
    final streak =
        trainings == null ? 0 : trainingCurrentStreak(trainings, now);
    final subtitle = [
      if (links.length > 1)
        '${links.length} VÍNCULOS'
      else if (professors != null && professors.isNotEmpty)
        '${professors.length} ${professors.length == 1 ? 'PROFESSOR' : 'PROFESSORES'}',
      if (upcoming.isNotEmpty)
        // Com os vínculos na frente, o "marcadas" não cabe ao lado dos botões.
        links.length > 1
            ? '${upcoming.length} ${upcoming.length == 1 ? 'AULA' : 'AULAS'}'
            : '${upcoming.length} ${upcoming.length == 1 ? 'AULA MARCADA' : 'AULAS MARCADAS'}',
    ].join(' · ');

    return ProfessorLinksScaffold(
      title: 'Meus treinos',
      subtitle: subtitle.isEmpty ? 'AULAS E PROFESSORES' : subtitle,
      onBack: () => popOrGo(context, AppRoutes.home),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ProfessorLinksRoundButton(
            key: const Key('training-hub-add'),
            icon: Icons.add_rounded,
            semanticLabel: 'Adicionar treino',
            onTap: () => context.pushNamed(AppRouteNames.athleteTrainingAdd),
          ),
          const SizedBox(width: 8),
          Stack(
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
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.brand,
        onRefresh: () async {
          ref.invalidate(myClassAgendaProvider);
          ref.invalidate(myProfessorsProvider);
          ref.invalidate(myClassChargesProvider);
          ref.invalidate(athleteTrainingPlansProvider);
          ref.invalidate(athleteClassCreditsProvider);
          refreshAthleteTrainingCenters(ref);
          await ref.read(myClassAgendaProvider.future);
        },
        child: ListView(
          padding: EdgeInsets.fromLTRB(
            20,
            8,
            20,
            trainingShellBottomPadding(context),
          ),
          children: [
            for (final i in invites) ...[
              CenterInviteCard(
                key: Key('training-hub-invite-${i.studentId}'),
                invite: i,
              ),
              const SizedBox(height: 12),
            ],
            if (multi) ...[
              TrainingOriginFilter(
                key: const Key('training-hub-origin-filter'),
                origins: origins,
                selected: origin,
                onChanged: (o) => setState(() => _origin = o),
              ),
              const SizedBox(height: 12),
            ],
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
            if (pendingReviews.isNotEmpty) ...[
              const SizedBox(height: 12),
              ReviewPromptCard(pending: pendingReviews),
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
            if (links.any((l) => trainingMatchesOriginLink(l, origin))) ...[
              const TrainingSectionTitle('Onde eu treino'),
              for (final l in links)
                if (trainingMatchesOriginLink(l, origin)) ...[
                  TrainingOriginLinkCard(
                    key: Key('training-hub-link-${l.origin.name}-${l.id}'),
                    origin: l.origin,
                    name: l.name,
                    subtitle: l.subtitle,
                    next: l.next,
                    plan: l.plan,
                    notice: l.notice,
                    noticeColor: trainingLinkNoticeColor(l.noticeTone),
                    onTap: () => openTrainingOriginLink(context, l),
                  ),
                  const SizedBox(height: 8),
                ],
            ],
            if (origin == null)
              ..._fromProfessor(context, views, evaluations, now),
            if (upcoming.length > 1) ...[
              TrainingSectionTitle(
                'Próximos dias',
                action: 'Agenda completa',
                onAction: () =>
                    context.goNamed(AppRouteNames.athleteTrainingAgenda),
              ),
              for (final t in upcoming.skip(1).take(3)) ...[
                TrainingRow(
                  key: Key('training-hub-row-${t.id}'),
                  training: t,
                  showOrigin: multi && origin == null,
                  onTap: () => openTraining(context, t),
                ),
                const SizedBox(height: 8),
              ],
            ],
            if (charges.isNotEmpty ||
                (plans != null && plans.activeCount > 0)) ...[
              TrainingSectionTitle(
                'Meus planos',
                action: 'Pagamentos',
                onAction: () =>
                    context.pushNamed(AppRouteNames.athleteTrainingPlans),
              ),
              if (charges.isNotEmpty) ...[
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
                      onTap: () =>
                          context.pushNamed(AppRouteNames.athleteTrainingPlans),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
              ],
              if (plans != null && plans.activeCount > 0)
                _PlanMiniRow(plans: plans),
            ],
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

/// "Meus planos" no hub: até dois cartões lado a lado (arena e professor).
class _PlanMiniRow extends StatelessWidget {
  const _PlanMiniRow({required this.plans});

  final MyTrainingPlans plans;

  @override
  Widget build(BuildContext context) {
    final cards = <Widget>[
      for (final p in plans.arenaPlans)
        _PlanMini(
          key: Key('training-hub-plan-${p.enrollmentId}'),
          color: AppColors.brand,
          payer: 'Pago à ${p.arenaName}',
          title: p.slots.isEmpty
              ? p.planName
              : 'Turma ${p.slots.first.className}',
          subtitle: p.isPackage && p.expiresOn != null
              ? '${p.planName} · até ${trainingPlanShortDate(p.expiresOn!)}'
              : p.planName,
          usage: p.isPackage && p.credits != null && p.creditsLeft != null
              ? (p.credits! - p.creditsLeft!, p.credits!)
              : null,
          footer: arenaPlanScheduleLabel(p.slots).toUpperCase(),
        ),
      for (final p in plans.professorPlans)
        _PlanMini(
          key: Key('training-hub-plan-${p.professorUid}'),
          color: ProfessorLinksStyle.blue,
          payer: 'Pago ao professor',
          title: p.planName ?? 'Particular ${p.professorName.split(' ').first}',
          subtitle: p.recurringReais != null
              ? '${formatBRL(p.recurringReais!)}/mês'
              : trainingPlanKindLabel(p.kind),
          footer: p.professorName.toUpperCase(),
        ),
    ].take(2).toList();
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => context.pushNamed(AppRouteNames.athleteTrainingPlans),
      child: TrainingStatRow(children: cards),
    );
  }
}

class _PlanMini extends StatelessWidget {
  const _PlanMini({
    super.key,
    required this.color,
    required this.payer,
    required this.title,
    required this.subtitle,
    required this.footer,
    this.usage,
  });

  final Color color;
  final String payer;
  final String title;
  final String subtitle;
  final String footer;
  final (int, int)? usage;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final tone = colors.readableTone(color);
    return ProfessorLinksCard(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            payer.toUpperCase(),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: ProfessorLinksStyle.mono(9, color: tone)
                .copyWith(letterSpacing: 0.3),
          ),
          const SizedBox(height: 6),
          Text(
            title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: ProfessorLinksStyle.display(
              13,
              weight: FontWeight.w700,
              color: colors.onSurface,
            ).copyWith(height: 1.25),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.bodyS.copyWith(
              fontSize: 11,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
          const Spacer(),
          const SizedBox(height: 8),
          if (usage != null && usage!.$2 > 0)
            Row(
              children: [
                for (var i = 0; i < usage!.$2; i++) ...[
                  if (i > 0) const SizedBox(width: 2),
                  Expanded(
                    child: Container(
                      height: 4,
                      decoration: BoxDecoration(
                        color: i < usage!.$1 ? color : colors.surfaceRaised,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                ],
              ],
            )
          else
            Container(
              height: 4,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          const SizedBox(height: 6),
          Text(
            usage != null
                ? '${usage!.$2 - usage!.$1} RESTANTES'
                : footer,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: ProfessorLinksStyle.mono(
              9.5,
              color: ProfessorLinksStyle.mute(colors),
            ),
          ),
        ],
      ),
    );
  }
}
