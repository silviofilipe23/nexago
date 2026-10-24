import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/application/professor_evaluations_providers.dart';
import '../../professor_mode/domain/professor_evaluations.dart';
import '../../professor_mode/presentation/evaluations/evaluation_widgets.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/athlete_training_providers.dart';
import '../domain/athlete_training.dart';
import 'widgets/training_widgets.dart';
import 'training_shell_page.dart';

enum _Tab { skills, frequency }

/// T8 · Minha evolução — a avaliação mais recente por fundamento (fase 8,
/// `professorEvaluations` enviadas) e a frequência dos últimos 6 meses.
class AthleteTrainingEvolutionPage extends ConsumerStatefulWidget {
  const AthleteTrainingEvolutionPage({super.key});

  @override
  ConsumerState<AthleteTrainingEvolutionPage> createState() =>
      _AthleteTrainingEvolutionPageState();
}

class _AthleteTrainingEvolutionPageState
    extends ConsumerState<AthleteTrainingEvolutionPage> {
  _Tab _tab = _Tab.skills;

  @override
  Widget build(BuildContext context) {
    final evaluations = ref.watch(receivedEvaluationsProvider);
    // Já busca os 6 meses de aulas: a aba Frequência abre sem esperar.
    ref.watch(athleteTrainingClassHistoryProvider);
    final latest = evaluations.valueOrNull?.firstOrNull;
    return ProfessorLinksScaffold(
      title: 'Minha evolução',
      subtitle: latest == null
          ? 'AVALIAÇÕES E FREQUÊNCIA'
          : 'AVALIAÇÃO · ${trainingFirstName(latest.professorName).toUpperCase()}'
              ' · ${evaluationPeriodLabel(latest.period).toUpperCase()}',
      // Aba do shell: voltar leva à aba Treinos.
      onBack: () => context.go(AppRoutes.athleteTrainings),
      body: ListView(
        padding: EdgeInsets.fromLTRB(
            20,
            8,
            20,
            trainingShellBottomPadding(context),
          ),
        children: [
          ArenaClassSegmented<_Tab>(
            items: const [
              (_Tab.skills, 'Fundamentos'),
              (_Tab.frequency, 'Frequência'),
            ],
            selected: _tab,
            onChanged: (t) => setState(() => _tab = t),
          ),
          const SizedBox(height: 16),
          if (_tab == _Tab.skills)
            ..._skills(context, evaluations)
          else
            const _Frequency(),
        ],
      ),
    );
  }

  List<Widget> _skills(
    BuildContext context,
    AsyncValue<List<ProfessorEvaluation>> async,
  ) {
    final list = async.valueOrNull;
    if (list == null && async.hasError) {
      return [
        ProfessorRetryCard(
          message: 'Não foi possível carregar suas avaliações.',
          onRetry: () => ref.invalidate(receivedEvaluationsProvider),
        ),
      ];
    }
    if (list == null) {
      return const [
        Padding(
          padding: EdgeInsets.symmetric(vertical: 40),
          child:
              Center(child: CircularProgressIndicator(color: AppColors.brand)),
        ),
      ];
    }
    if (list.isEmpty) {
      return const [
        ProfessorLinksCard(
          key: Key('training-evolution-empty'),
          child: ProfessorMutedText(
            'Nenhuma avaliação ainda. Quando seu professor avaliar seus '
            'fundamentos no mês, a evolução aparece aqui.',
          ),
        ),
      ];
    }
    return [
      EvaluationReport(evaluation: list.first),
      if (list.length > 1) ...[
        const TrainingSectionTitle('Avaliações anteriores'),
        TrainingTilesBlock(
          children: [
            for (final e in list.skip(1))
              TrainingListTile(
                key: Key('training-evolution-${e.id}'),
                icon: Icons.insights_outlined,
                title: evaluationPeriodLabel(e.period),
                subtitle: '${e.professorName} · média '
                    '${evaluationScoreLabel(e.overall)}',
                onTap: () => context.pushNamed(
                  AppRouteNames.athleteEvaluation,
                  pathParameters: {'evaluationId': e.id},
                ),
              ),
          ],
        ),
      ],
    ];
  }
}

class _Frequency extends ConsumerWidget {
  const _Frequency();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final now = ref.watch(professorLinksClockProvider)();
    final trainings = ref.watch(athleteTrainingsWithHistoryProvider);
    final historyLoading =
        ref.watch(athleteTrainingClassHistoryProvider).isLoading;
    if (trainings == null || historyLoading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 40),
        child: Center(child: CircularProgressIndicator(color: AppColors.brand)),
      );
    }
    final bars = trainingMonthlyFrequency(trainings, now);
    final total = bars.fold<int>(0, (s, b) => s + b.attended);
    final stats = trainingMonthStats(trainings, now);
    final streak = trainingCurrentStreak(trainings, now);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ProfessorLinksCard(
          key: const Key('training-frequency-chart'),
          padding: const EdgeInsets.all(15),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const Expanded(child: ProfessorLinksKicker('Aulas por mês')),
                  Text(
                    '$total EM ${bars.length} MESES',
                    style: ProfessorLinksStyle.mono(
                      10.5,
                      color: colors.onSurface,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              SizedBox(height: 140, child: _Bars(bars: bars)),
              const SizedBox(height: 12),
              Row(
                children: [
                  _Legend(color: AppColors.brand, label: 'Presente'),
                  const SizedBox(width: 14),
                  _Legend(
                    color: colors.surfaceRaised,
                    label: 'Aulas previstas',
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        TrainingStatRow(
          children: [
            TrainingStatTile(
              icon: Icons.local_fire_department_outlined,
              value: '$streak',
              label: streak == 1 ? 'treino seguido' : 'treinos seguidos',
            ),
            TrainingStatTile(
              icon: Icons.check_rounded,
              value: stats.presencePercent == null
                  ? '—'
                  : '${stats.presencePercent}%',
              label: 'presença no mês',
            ),
            TrainingStatTile(
              icon: Icons.emoji_events_outlined,
              value: '${trainingBestStreak(trainings, now)}',
              label: 'recorde seguido',
            ),
          ],
        ),
        const SizedBox(height: 10),
        Text(
          'Contam as aulas da arena e as particulares dos últimos 6 meses. '
          'Falta (avisada ou não) zera a sequência.',
          style: AppTypography.bodyS.copyWith(
            fontSize: 11.5,
            height: 1.45,
            color: ProfessorLinksStyle.dim(colors),
          ),
        ),
      ],
    );
  }
}

class _Bars extends StatelessWidget {
  const _Bars({required this.bars});

  final List<TrainingMonthBar> bars;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final top = bars.fold<int>(1, (m, b) => b.planned > m ? b.planned : m);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final (i, b) in bars.indexed) ...[
          if (i > 0) const SizedBox(width: 10),
          Expanded(
            child: LayoutBuilder(
              builder: (context, c) {
                final last = i == bars.length - 1;
                // Espaço do número em cima e do mês embaixo.
                final room = c.maxHeight - 48;
                final planned = b.planned == 0 ? 0.0 : room * b.planned / top;
                final attended =
                    b.planned == 0 ? 0.0 : planned * b.attended / b.planned;
                return Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text(
                      '${b.attended}',
                      style: ProfessorLinksStyle.mono(
                        10,
                        color: last
                            ? colors.onSurface
                            : ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Container(
                      height: planned < 4 ? 4 : planned,
                      decoration: BoxDecoration(
                        color: colors.surfaceRaised,
                        borderRadius: BorderRadius.circular(7),
                      ),
                      clipBehavior: Clip.antiAlias,
                      alignment: Alignment.bottomCenter,
                      child: Container(
                        height: attended,
                        color:
                            AppColors.brand.withValues(alpha: last ? 1 : 0.45),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      b.label,
                      style: ProfessorLinksStyle.mono(
                        9.5,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ],
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 5),
        Text(
          label,
          style: AppTypography.bodyS.copyWith(
            fontSize: 10.5,
            color: ProfessorLinksStyle.dim(context.themeColors),
          ),
        ),
      ],
    );
  }
}
