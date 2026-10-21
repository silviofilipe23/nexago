import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_homework_providers.dart';
import '../../application/professor_wallet_providers.dart'
    show professorWalletTodayKeyProvider;
import '../../domain/professor_homework.dart';
import '../../domain/professor_lesson_plans.dart';
import '../widgets/professor_students_widgets.dart' show ProfessorMutedText;

/// Linha da tarefa no registro da aula (H7): "TREINO EM CASA · 2 de 3 dias".
/// Só aparece depois que a tarefa foi enviada.
class ProfessorHomeworkProgressLine extends ConsumerWidget {
  const ProfessorHomeworkProgressLine({
    super.key,
    required this.viewId,
    required this.homework,
    required this.sentAt,
  });

  final String viewId;
  final LessonHomework homework;
  final DateTime sentAt;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final week = professorHomeworkWeek(
      viewId: viewId,
      homework: homework,
      sentAt: sentAt,
      progress: ref.watch(professorHomeworkProgressByViewProvider(viewId)),
    );
    final today = ref.watch(professorWalletTodayKeyProvider);
    final open = week.openOn(today);
    final color = week.complete
        ? colors.readableTone(AppColors.win)
        : open
            ? colors.brandText
            : ProfessorLinksStyle.dim(colors);
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Text(
        'TREINO EM CASA · '
        '${professorHomeworkDaysLabel(week.daysDone, homework.daysTarget)}'
        '${open ? '' : ' · ENCERRADA'}',
        key: Key('professor-homework-progress-$viewId'),
        style: ProfessorLinksStyle.mono(9.5, color: color),
      ),
    );
  }
}

/// Ficha do aluno: as tarefas para casa da semana e os dias feitos.
class ProfessorStudentHomeworkSection extends ConsumerWidget {
  const ProfessorStudentHomeworkSection({super.key, required this.athleteId});

  final String athleteId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(professorStudentHomeworkProvider(athleteId));
    final weeks = async.valueOrNull;
    final today = ref.watch(professorWalletTodayKeyProvider);
    return Column(
      key: const Key('professor-student-homework'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const ProfessorLinksKicker('Treino em casa'),
        const SizedBox(height: 10),
        if (weeks == null)
          ProfessorMutedText(
            async.hasError
                ? 'Não foi possível carregar o treino em casa.'
                : 'Carregando…',
          )
        else if (weeks.isEmpty)
          const ProfessorMutedText(
            'Nenhuma tarefa para casa nesta semana. Mande uma no registro da '
            'aula.',
          )
        else
          for (final w in weeks) ...[
            ProfessorHomeworkWeekCard(week: w, todayKey: today),
            if (w != weeks.last) const SizedBox(height: 10),
          ],
      ],
    );
  }
}

/// Uma tarefa: exercício, dose e os 7 dias da semana dela.
class ProfessorHomeworkWeekCard extends StatelessWidget {
  const ProfessorHomeworkWeekCard({
    super.key,
    required this.week,
    required this.todayKey,
  });

  final ProfessorHomeworkWeek week;
  final String todayKey;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final hw = week.homework;
    return ProfessorLinksCard(
      key: Key('professor-homework-week-${week.viewId}'),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      hw.name,
                      style: ProfessorLinksStyle.display(
                        13,
                        weight: FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        if (week.lessonTitle.isNotEmpty)
                          week.lessonTitle.toUpperCase(),
                        '${hw.sets} ${hw.sets == 1 ? 'SÉRIE' : 'SÉRIES'}/DIA',
                      ].join(' · '),
                      style: ProfessorLinksStyle.mono(
                        9.5,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                professorHomeworkDaysLabel(week.daysDone, hw.daysTarget),
                key: Key('professor-homework-days-${week.viewId}'),
                style: ProfessorLinksStyle.mono(
                  11,
                  color: week.complete
                      ? colors.readableTone(AppColors.win)
                      : colors.onSurface,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              for (final d in week.windowDays)
                Expanded(
                  child: _DayCell(
                    key: Key('professor-homework-day-${week.viewId}-$d'),
                    label: d == todayKey
                        ? 'HOJE'
                        : lessonPlanWeekdayDay(d).split(' ').first,
                    sets: week.days[d] ?? 0,
                    target: hw.sets,
                    today: d == todayKey,
                    future: d.compareTo(todayKey) > 0,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Dia da tarefa: cheio = todas as séries; contorno verde com "1/3" =
/// começou; vazio = nada marcado.
class _DayCell extends StatelessWidget {
  const _DayCell({
    super.key,
    required this.label,
    required this.sets,
    required this.target,
    required this.today,
    required this.future,
  });

  final String label;
  final int sets;
  final int target;
  final bool today;
  final bool future;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final done = sets >= target;
    final partial = sets > 0 && !done;
    return Column(
      children: [
        Container(
          width: 30,
          height: 30,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: done ? colors.win : Colors.transparent,
            border: done
                ? null
                : Border.all(
                    width: 1.5,
                    color: partial
                        ? colors.win
                        : today
                            ? AppColors.brand
                            : future
                                ? ProfessorLinksStyle.line(colors)
                                : ProfessorLinksStyle.line2(colors),
                  ),
          ),
          child: done
              ? const Icon(
                  Icons.check_rounded,
                  size: 15,
                  color: ProfessorLinksStyle.onBrand,
                )
              : partial
                  ? Text(
                      '$sets/$target',
                      style: ProfessorLinksStyle.mono(
                        8.5,
                        color: colors.readableTone(AppColors.win),
                      ),
                    )
                  : null,
        ),
        const SizedBox(height: 5),
        Text(
          label,
          style: ProfessorLinksStyle.mono(
            8.5,
            color: today ? colors.brandText : ProfessorLinksStyle.dim(colors),
          ),
        ),
      ],
    );
  }
}
