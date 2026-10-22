import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../athlete/domain/agenda/athlete_agenda_providers.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/athlete_training_providers.dart';
import '../domain/athlete_training.dart';
import '../domain/class_presence.dart';
import '../domain/training_plans.dart';
import 'widgets/class_presence_widgets.dart';
import 'widgets/training_origin_widgets.dart';
import 'widgets/training_widgets.dart';

/// O5 · Turma na arena — a matrícula numa turma com professor da equipe da
/// arena: presença, reposições, próximas aulas e as regras DA ARENA (quem
/// cobra, plano, aviso de falta, check-in).
class AthleteTrainingArenaClassPage extends ConsumerWidget {
  const AthleteTrainingArenaClassPage({super.key, required this.enrollmentId});

  final String enrollmentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final async = ref.watch(athleteTrainingPlansProvider);
    final plans = async.valueOrNull;
    ArenaTrainingPlan? plan;
    for (final p in plans?.arenaPlans ?? const <ArenaTrainingPlan>[]) {
      if (p.enrollmentId == enrollmentId) plan = p;
    }
    final now = ref.watch(professorLinksClockProvider)();
    final all = ref.watch(athleteTrainingsWithHistoryProvider) ?? const [];
    final mine = plan == null
        ? const <TrainingSession>[]
        : [
            for (final t in all)
              if (trainingBelongsToArenaPlan(t, plan)) t,
          ];
    final upcoming = upcomingTrainings(mine, now);
    final stats = trainingMonthStats(mine, now);
    final credits = [
      for (final c
          in ref.watch(athleteClassCreditsProvider).valueOrNull ?? const [])
        if (plan != null &&
            (plan.arenaId.isEmpty
                ? c.arenaName == plan.arenaName
                : c.arenaId == plan.arenaId))
          c,
    ];
    int? noticeHours;
    for (final t in mine) {
      noticeHours ??= t.classEntry?.makeupNoticeHours;
    }
    final className = plan == null || plan.slots.isEmpty
        ? (plan?.planName ?? 'Turma')
        : plan.slots.first.className;
    final teacher =
        plan?.slots
            .map((s) => s.teacherName)
            .firstWhere((n) => n.isNotEmpty, orElse: () => '') ??
        '';
    final until = plan == null
        ? null
        : plan.isPackage
        ? plan.expiresOn
        : plan.billedThrough;

    return ProfessorLinksScaffold(
      title: 'Turma na arena',
      subtitle: 'PROFESSOR DA EQUIPE DA ARENA',
      onBack: () => popOrGo(context, AppRoutes.athleteTrainings),
      body: RefreshIndicator(
        color: AppColors.brand,
        onRefresh: () async {
          ref.invalidate(athleteTrainingPlansProvider);
          ref.invalidate(myClassAgendaProvider);
          ref.invalidate(athleteClassCreditsProvider);
          await ref.read(athleteTrainingPlansProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            if (plan == null && async.hasError)
              ProfessorRetryCard(
                message: 'Não foi possível carregar sua turma.',
                onRetry: () => ref.invalidate(athleteTrainingPlansProvider),
              )
            else if (plans == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.brand),
                ),
              )
            else if (plan == null)
              const ProfessorLinksCard(
                key: Key('training-arena-missing'),
                child: ProfessorMutedText(
                  'Essa matrícula não está mais ativa.',
                ),
              )
            else ...[
              TrainingOriginHeader(
                origin: TrainingOrigin.arena,
                name: plan.arenaName,
                line: 'Turma cobrada pela arena',
                extra: Container(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                  decoration: BoxDecoration(
                    color: colors.surfaceRaised,
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: Row(
                    children: [
                      if (teacher.isNotEmpty) ...[
                        ArenaClassAvatar(
                          initials: arenaClassInitials(teacher),
                          size: 34,
                        ),
                        const SizedBox(width: 11),
                      ],
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              className,
                              style: ProfessorLinksStyle.display(
                                13,
                                weight: FontWeight.w700,
                                color: colors.onSurface,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              [
                                if (teacher.isNotEmpty) 'Prof. $teacher',
                                arenaPlanScheduleLabel(plan.slots),
                              ].where((s) => s.isNotEmpty).join(' · '),
                              style: AppTypography.bodyS.copyWith(
                                fontSize: 11.5,
                                color: ProfessorLinksStyle.dim(colors),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TrainingStatRow(
                children: [
                  TrainingStatTile(
                    key: const Key('training-arena-presence'),
                    value: stats.presencePercent == null
                        ? '—'
                        : '${stats.presencePercent}%',
                    label: 'presença no mês',
                  ),
                  TrainingStatTile(
                    key: const Key('training-arena-credits'),
                    value: '${credits.length}',
                    label: credits.length == 1
                        ? 'reposição livre'
                        : 'reposições livres',
                    color: ProfessorLinksStyle.blue,
                  ),
                  TrainingStatTile(
                    value: until == null ? '—' : trainingPlanShortDate(until),
                    label: plan.isPackage ? 'pacote até' : 'pago até',
                  ),
                ],
              ),
              TrainingSectionTitle(
                'Próximas aulas',
                action: 'Histórico',
                onAction: () =>
                    context.pushNamed(AppRouteNames.athleteTrainingClasses),
              ),
              if (upcoming.isEmpty)
                const ProfessorLinksCard(
                  child: ProfessorMutedText('Nenhuma aula marcada agora.'),
                )
              else
                for (final t in upcoming.take(4)) ...[
                  TrainingRow(
                    key: Key('training-arena-row-${t.id}'),
                    training: t,
                    onTap: () => openTraining(context, t),
                  ),
                  const SizedBox(height: 8),
                ],
              if (credits.isNotEmpty) ...[
                const SizedBox(height: 4),
                TrainingOriginNote(
                  key: const Key('training-arena-credit-note'),
                  color: ProfessorLinksStyle.blue,
                  title:
                      'Crédito de reposição · vale até '
                      '${classDayMonthLabel(credits.first.expiresOn)}',
                  text:
                      'Use numa turma da ${plan.arenaName} com vaga. '
                      'Regra definida pela arena.',
                ),
              ],
              const TrainingSectionTitle('Regras da arena'),
              TrainingKeyValueCard(
                key: const Key('training-arena-rules'),
                rows: [
                  (
                    'Quem cobra',
                    '${plan.arenaName} · '
                        '${arenaPaymentMethodLabel(plan.paymentMethod, plan.billingMode)}',
                    null,
                  ),
                  (
                    'Plano',
                    '${plan.planName} · ${formatBRL(plan.priceReais)}'
                        '${plan.kind == 'monthly' ? '/mês' : ''}',
                    null,
                  ),
                  (
                    'Avisar falta',
                    'Até ${noticeHours ?? 4}h antes gera reposição',
                    null,
                  ),
                  ('Check-in', 'Pela localização, na arena', null),
                ],
              ),
              if (credits.isNotEmpty) ...[
                const SizedBox(height: 16),
                ProfessorLinksPrimaryButton(
                  key: const Key('training-arena-use-credit'),
                  label: 'Usar reposição',
                  onPressed: () => openTrainingMakeup(
                    context,
                    creditId: credits.first.creditId,
                  ),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}
