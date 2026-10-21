import 'dart:async';

import 'package:nexago_app/features/professor_mode/domain/professor_homework.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_lesson_plans.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_homework_repository.dart';

/// Treino em casa (T9) em memória: progresso e visões do professor.
class FakeProfessorHomeworkRepository implements ProfessorHomeworkRepository {
  FakeProfessorHomeworkRepository({
    List<ProfessorHomeworkProgress>? progress,
    List<LessonPlanView>? views,
  })  : progress = progress ?? [],
        views = views ?? [];

  List<ProfessorHomeworkProgress> progress;
  List<LessonPlanView> views;
  final progressQueries = <String>[];
  final _changes = StreamController<void>.broadcast();

  Stream<T> _watch<T>(T Function() read) async* {
    yield read();
    await for (final _ in _changes.stream) {
      yield read();
    }
  }

  /// O aluno marcou (ou a tarefa mudou): reemite as consultas.
  void emit() => _changes.add(null);

  @override
  Stream<List<ProfessorHomeworkProgress>> watchProgress(String professorUid) {
    progressQueries.add(professorUid);
    return _watch(() => List.of(progress));
  }

  @override
  Stream<List<LessonPlanView>> watchStudentViews(
    String professorUid,
    String athleteId,
  ) =>
      _watch(() => [
            for (final v in views)
              if (v.professorUid == professorUid && v.athleteId == athleteId) v,
          ]);
}

/// Visão de um aluno com a tarefa do feedback enviada em [sentAt].
LessonPlanView homeworkView({
  required String planId,
  required String athleteId,
  required String professorUid,
  required DateTime sentAt,
  String name = 'Saque por baixo',
  int sets = 3,
  int daysTarget = 3,
  String lessonTitle = 'Iniciante A',
}) =>
    LessonPlanView(
      id: lessonPlanViewId(planId, athleteId),
      planId: planId,
      athleteId: athleteId,
      professorUid: professorUid,
      professorName: 'Prof. Rafa',
      lessonTitle: lessonTitle,
      date: '2026-10-19',
      feedback: LessonViewFeedback(
        text: 'Boa aula',
        sentAt: sentAt,
        homework: LessonHomework(
          name: name,
          sets: sets,
          daysTarget: daysTarget,
        ),
      ),
    );

/// `homeworkProgress/{viewId}` como a callable grava.
ProfessorHomeworkProgress homeworkProgress({
  required String planId,
  required String athleteId,
  required String startKey,
  required Map<String, int> days,
  String name = 'Saque por baixo',
  int sets = 3,
  int daysTarget = 3,
}) =>
    ProfessorHomeworkProgress(
      viewId: lessonPlanViewId(planId, athleteId),
      athleteId: athleteId,
      planId: planId,
      homeworkName: name,
      sets: sets,
      daysTarget: daysTarget,
      startKey: startKey,
      days: days,
    );
