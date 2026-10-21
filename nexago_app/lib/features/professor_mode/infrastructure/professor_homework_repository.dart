import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../domain/professor_homework.dart';
import '../domain/professor_lesson_plans.dart';

/// Treino em casa (T9) do lado do professor: só leitura. As rules deixam o
/// professor da visão ler `homeworkProgress` e `lessonPlanViews` — as
/// consultas filtram por `professorUid` para caber nelas.
abstract class ProfessorHomeworkRepository {
  /// Progresso de todas as tarefas do professor (sem ordem).
  Stream<List<ProfessorHomeworkProgress>> watchProgress(String professorUid);

  /// Visões do professor para um aluno (feedbacks, com ou sem tarefa).
  Stream<List<LessonPlanView>> watchStudentViews(
    String professorUid,
    String athleteId,
  );
}

class FirebaseProfessorHomeworkRepository
    implements ProfessorHomeworkRepository {
  FirebaseProfessorHomeworkRepository({required FirebaseFirestore firestore})
      : _firestore = firestore;

  final FirebaseFirestore _firestore;

  @override
  Stream<List<ProfessorHomeworkProgress>> watchProgress(String professorUid) =>
      _firestore
          .collection('homeworkProgress')
          .where('professorUid', isEqualTo: professorUid)
          .snapshots()
          .map((q) => [
                for (final d in q.docs)
                  ProfessorHomeworkProgress.fromMap(d.id, d.data()),
              ]);

  // Só igualdades: dispensa índice composto.
  @override
  Stream<List<LessonPlanView>> watchStudentViews(
    String professorUid,
    String athleteId,
  ) =>
      _firestore
          .collection('lessonPlanViews')
          .where('professorUid', isEqualTo: professorUid)
          .where('athleteId', isEqualTo: athleteId)
          .snapshots()
          .map((q) => [
                for (final d in q.docs) LessonPlanView.fromMap(d.id, d.data()),
              ]);
}

final professorHomeworkRepositoryProvider =
    Provider<ProfessorHomeworkRepository>((ref) {
  return FirebaseProfessorHomeworkRepository(
    firestore: ref.watch(firestoreProvider),
  );
});
