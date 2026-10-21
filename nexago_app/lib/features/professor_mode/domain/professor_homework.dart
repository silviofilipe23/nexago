import '../../athlete_training/domain/homework_progress.dart'
    show homeworkDaysDone, homeworkWindowDays;
import 'professor_lesson_plans.dart';

/// Treino em casa visto pelo professor: o progresso que o aluno marca
/// (`homeworkProgress/{viewId}`, T9) e a tarefa enviada no feedback (H7).

/// `homeworkProgress/{viewId}` — só a callable `saveHomeworkProgress` grava.
class ProfessorHomeworkProgress {
  const ProfessorHomeworkProgress({
    required this.viewId,
    this.athleteId = '',
    this.planId = '',
    this.homeworkName = '',
    this.sets = kLessonHomeworkDefaultSets,
    this.daysTarget = kLessonHomeworkDefaultDays,
    this.startKey = '',
    this.endKey = '',
    this.days = const {},
  });

  factory ProfessorHomeworkProgress.fromMap(
    String viewId,
    Map<String, Object?> m,
  ) {
    String str(Object? v) => v is String ? v : '';
    int integer(Object? v, int fallback) => v is num ? v.toInt() : fallback;
    final raw = m['days'];
    return ProfessorHomeworkProgress(
      viewId: viewId,
      athleteId: str(m['athleteId']),
      planId: str(m['planId']),
      homeworkName: str(m['homeworkName']),
      sets: integer(m['sets'], kLessonHomeworkDefaultSets),
      daysTarget: integer(m['daysTarget'], kLessonHomeworkDefaultDays),
      startKey: str(m['startKey']),
      endKey: str(m['endKey']),
      days: raw is Map
          ? {
              for (final e in raw.entries)
                if (e.value is num) '${e.key}': (e.value as num).toInt(),
            }
          : const {},
    );
  }

  final String viewId;
  final String athleteId;
  final String planId;
  final String homeworkName;
  final int sets;
  final int daysTarget;
  final String startKey;
  final String endKey;

  /// `YYYY-MM-DD` → séries feitas.
  final Map<String, int> days;
}

/// Uma tarefa enviada a um aluno, com o que ele já marcou.
class ProfessorHomeworkWeek {
  const ProfessorHomeworkWeek({
    required this.viewId,
    required this.homework,
    required this.windowDays,
    this.lessonTitle = '',
    this.days = const {},
  });

  final String viewId;
  final LessonHomework homework;
  final String lessonTitle;

  /// Os 7 dias da tarefa (`YYYY-MM-DD`), a partir do envio.
  final List<String> windowDays;

  /// Séries feitas por dia (só desta rodada da tarefa).
  final Map<String, int> days;

  int get daysDone => homeworkDaysDone(days, homework.sets);

  /// Bateu a meta de dias na semana.
  bool get complete => daysDone >= homework.daysTarget;

  bool openOn(String todayKey) =>
      todayKey.compareTo(windowDays.first) >= 0 &&
      todayKey.compareTo(windowDays.last) <= 0;
}

/// Junta a tarefa enviada ao progresso. Progresso de outra rodada (tarefa
/// reenviada com outro exercício ou em outro dia) não conta.
ProfessorHomeworkWeek professorHomeworkWeek({
  required String viewId,
  required LessonHomework homework,
  required DateTime sentAt,
  ProfessorHomeworkProgress? progress,
  String lessonTitle = '',
}) {
  final window = homeworkWindowDays(sentAt);
  final sameRound = progress != null &&
      progress.startKey == window.first &&
      progress.homeworkName == homework.name;
  return ProfessorHomeworkWeek(
    viewId: viewId,
    homework: homework,
    windowDays: window,
    lessonTitle: lessonTitle,
    days: sameRound ? progress.days : const {},
  );
}

/// "2 de 3 dias".
String professorHomeworkDaysLabel(int done, int target) =>
    '$done de $target ${target == 1 ? 'dia' : 'dias'}';
