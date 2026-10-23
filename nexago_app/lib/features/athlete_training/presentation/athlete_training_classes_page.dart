import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/athlete_training_providers.dart';
import '../domain/athlete_training.dart';
import '../domain/class_presence.dart';
import 'widgets/class_presence_widgets.dart';
import 'widgets/training_widgets.dart';

enum _Tab { upcoming, history }

/// T3 · Minhas aulas — próximas e histórico (presença, falta, falta avisada,
/// reposição), turmas e particulares juntas, com filtro por professor.
///
/// Nas aulas da turma, "Vou / Não vou" (o professor vê na chamada) e o
/// check-in na janela da aula.
class AthleteTrainingClassesPage extends ConsumerStatefulWidget {
  const AthleteTrainingClassesPage({super.key});

  @override
  ConsumerState<AthleteTrainingClassesPage> createState() =>
      _AthleteTrainingClassesPageState();
}

class _AthleteTrainingClassesPageState
    extends ConsumerState<AthleteTrainingClassesPage> {
  _Tab _tab = _Tab.upcoming;
  String? _professor;

  @override
  Widget build(BuildContext context) {
    final now = ref.watch(professorLinksClockProvider)();
    final trainings = ref.watch(athleteTrainingsWithHistoryProvider);
    final historyLoading =
        ref.watch(athleteTrainingClassHistoryProvider).isLoading;
    final upcoming =
        trainings == null ? null : upcomingTrainings(trainings, now);
    final past = trainings == null ? null : pastTrainings(trainings, now);
    final names = trainings == null
        ? const <String>[]
        : trainingProfessorFirstNames(trainings);
    final shown = (_tab == _Tab.upcoming ? upcoming : past)
        ?.where((t) => trainingMatchesProfessor(t, _professor))
        .toList();
    final month = nexagoEventDayKey(now).substring(0, 7);
    final monthStats = past == null
        ? null
        : trainingMonthStats(
            past.where((t) => trainingMatchesProfessor(t, _professor)).toList(),
            now,
          );

    return ProfessorLinksScaffold(
      title: 'Minhas aulas',
      subtitle: upcoming == null
          ? null
          : upcoming.isEmpty
              ? 'NENHUMA AULA MARCADA'
              : _subtitle(upcoming, now),
      onBack: () => popOrGo(context, AppRoutes.athleteTrainings),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          ArenaClassSegmented<_Tab>(
            items: const [
              (_Tab.upcoming, 'Próximas'),
              (_Tab.history, 'Histórico'),
            ],
            selected: _tab,
            onChanged: (t) => setState(() => _tab = t),
          ),
          if (names.length > 1) ...[
            const SizedBox(height: 12),
            TrainingProfessorChips(
              names: names,
              selected: _professor,
              onChanged: (n) => setState(() => _professor = n),
            ),
          ],
          const SizedBox(height: 14),
          if (_tab == _Tab.history && monthStats != null) ...[
            TrainingStatRow(
              children: [
                TrainingStatTile(
                  key: const Key('training-classes-present'),
                  value: '${monthStats.present}',
                  label: 'presenças · ${_monthLabel(month)}',
                  color: AppColors.win,
                ),
                TrainingStatTile(
                  key: const Key('training-classes-excused'),
                  value: '${monthStats.excused}',
                  label: 'faltas avisadas',
                  color: AppColors.pending,
                ),
                TrainingStatTile(
                  key: const Key('training-classes-absent'),
                  value: '${monthStats.absent}',
                  label: 'faltas',
                  color: AppColors.live,
                ),
              ],
            ),
            const SizedBox(height: 14),
          ],
          if (shown == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.brand),
              ),
            )
          else if (shown.isEmpty)
            ProfessorLinksCard(
              key: const Key('training-classes-empty'),
              child: ProfessorMutedText(
                _tab == _Tab.upcoming
                    ? 'Nenhuma aula marcada. As aulas da sua turma e as '
                        'particulares confirmadas aparecem aqui.'
                    : 'Nenhuma aula nos últimos meses.',
              ),
            )
          else
            for (final (i, t) in shown.indexed) ...[
              TrainingRow(
                key: Key('training-classes-row-${t.id}'),
                training: t,
                highlight: _tab == _Tab.upcoming && i == 0,
                onTap: () => openTraining(context, t),
                footer: t.state == TrainingState.awaitingProfessor
                    ? const _Note('O professor ainda vai confirmar o horário.')
                    : t.state == TrainingState.awaitingCenter
                        ? const _Note(
                            'O centro ainda vai confirmar a experimental.')
                        : _tab == _Tab.upcoming &&
                                TrainingRsvpFooter.appliesTo(t, now)
                            ? TrainingRsvpFooter(training: t)
                            : null,
              ),
              const SizedBox(height: 8),
            ],
          if (_tab == _Tab.history && historyLoading)
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: Center(
                child: SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.brand,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// "3 PRÓXIMAS · 2 A CONFIRMAR".
String _subtitle(List<TrainingSession> upcoming, DateTime now) {
  final pending = upcoming.where((t) => trainingAwaitsResponse(t, now)).length;
  return [
    '${upcoming.length} ${upcoming.length == 1 ? 'PRÓXIMA' : 'PRÓXIMAS'}',
    if (pending > 0) '$pending A CONFIRMAR',
  ].join(' · ');
}

String _monthLabel(String monthKey) {
  const names = [
    'jan', 'fev', 'mar', 'abr', 'mai', 'jun', //
    'jul', 'ago', 'set', 'out', 'nov', 'dez',
  ];
  final m = int.tryParse(monthKey.substring(5)) ?? 1;
  return names[(m - 1).clamp(0, 11)];
}

class _Note extends StatelessWidget {
  const _Note(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Text(
      text,
      style: ProfessorLinksStyle.mono(10,
          color: colors.readableTone(colors.pending)),
    );
  }
}
