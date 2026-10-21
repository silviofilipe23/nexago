import '../../../core/time/nexago_event_timezone.dart';
import '../../professor_mode/domain/professor_lesson_plans.dart';

/// T9 · Treino em casa — a tarefa do feedback da aula (`feedback.homework`)
/// e o progresso que o aluno marca (`homeworkProgress/{viewId}`, gravado só
/// pela callable `saveHomeworkProgress`).

/// A tarefa vale por uma semana a partir do dia em que o feedback chegou
/// (espelha `HOMEWORK_WINDOW_DAYS` do servidor).
const int kHomeworkWindowDays = 7;

class HomeworkProgress {
  const HomeworkProgress({
    this.days = const {},
    this.startKey = '',
    this.homeworkName = '',
  });

  factory HomeworkProgress.fromMap(Map<String, Object?> m) {
    final raw = m['days'];
    return HomeworkProgress(
      days: raw is Map
          ? {
              for (final e in raw.entries)
                if (e.value is num) '${e.key}': (e.value as num).toInt(),
            }
          : const {},
      startKey: m['startKey'] is String ? m['startKey'] as String : '',
      homeworkName:
          m['homeworkName'] is String ? m['homeworkName'] as String : '',
    );
  }

  /// `YYYY-MM-DD` → séries feitas.
  final Map<String, int> days;
  final String startKey;
  final String homeworkName;

  /// Progresso de OUTRA rodada (tarefa reenviada) não vale para esta.
  HomeworkProgress forRound(String windowStartKey, String name) =>
      startKey == windowStartKey && homeworkName == name
          ? this
          : const HomeworkProgress();
}

/// Os dias da janela da tarefa (`YYYY-MM-DD`), a partir do envio.
List<String> homeworkWindowDays(DateTime sentAt) {
  final start = toNexagoEventLocal(sentAt);
  return [
    for (var i = 0; i < kHomeworkWindowDays; i++)
      _key(DateTime(start.year, start.month, start.day + i)),
  ];
}

/// Dias com todas as séries feitas.
int homeworkDaysDone(Map<String, int> days, int sets) =>
    days.values.where((n) => n >= sets).length;

/// A tarefa ainda pode ser marcada hoje?
bool homeworkOpenOn(DateTime sentAt, String todayKey) {
  final window = homeworkWindowDays(sentAt);
  return todayKey.compareTo(window.first) >= 0 &&
      todayKey.compareTo(window.last) <= 0;
}

/// Tarefa da visão (feedback com exercício) ou `null`.
LessonHomework? homeworkOf(LessonPlanView view) => view.feedback?.homework;

String _key(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}'
    '-${d.day.toString().padLeft(2, '0')}';
