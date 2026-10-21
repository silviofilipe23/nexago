import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/professor_lesson_plans.dart';
import 'professor_students_repository.dart' show ProfessorStudentsException;

/// Plano de aula (H1–H5, H8). O plano só a callable grava
/// (`functions/src/professor-lesson-plans.ts`); modelos e exercícios
/// próprios o cliente grava direto (rules: só o dono, chaves fixas). Falhas
/// chegam como [ProfessorStudentsException], com a mensagem para a tela.
abstract class ProfessorLessonPlansRepository {
  /// Planos do professor a partir de [fromDateKey], por data.
  Stream<List<LessonPlan>> watchPlans(String uid,
      {required String fromDateKey});

  Future<({String planId, int viewCount})> savePlan(LessonPlanDraft draft);

  Future<void> deletePlan(String planId);

  /// Dados da aula e alunos com conta (o foco individual).
  Future<LessonPlanLesson> fetchLessonStudents(
    LessonPlanKind kind,
    String refId,
  );

  Stream<List<LessonTemplate>> watchTemplates(String uid);

  Future<void> saveTemplate(
    String uid, {
    String? templateId,
    required String name,
    required String level,
    required LessonPlanContent content,
    int uses = 0,
  });

  Future<void> deleteTemplate(String uid, String templateId);

  /// +1 no "usado N×".
  Future<void> markTemplateUsed(String uid, String templateId);

  Stream<List<LessonExercise>> watchExercises(String uid);

  Future<void> saveExercise(
    String uid,
    LessonExerciseInput input, {
    String? exerciseId,
  });

  Future<void> deleteExercise(String uid, String exerciseId);

  /// Visões publicadas para o aluno, da aula mais recente para a antiga.
  Stream<List<LessonPlanView>> watchMyViews(String athleteId);

  /// `null` = não existe (ou não é dele).
  Stream<LessonPlanView?> watchView(String viewId);
}

class FirebaseProfessorLessonPlansRepository
    implements ProfessorLessonPlansRepository {
  FirebaseProfessorLessonPlansRepository({
    required FirebaseFirestore firestore,
    FirebaseFunctions? functions,
  })  : _firestore = firestore,
        _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  CollectionReference<Map<String, dynamic>> _templates(String uid) => _firestore
      .collection('professors')
      .doc(uid)
      .collection('lessonTemplates');

  CollectionReference<Map<String, dynamic>> _exercises(String uid) =>
      _firestore.collection('professors').doc(uid).collection('exercises');

  Future<Map<String, Object?>> _call(
    String name,
    Map<String, Object?> data,
    String fallback,
  ) async {
    try {
      final result = await _functions.httpsCallable(name).call<Object?>(data);
      final raw = result.data;
      return raw is Map
          ? raw.map((k, v) => MapEntry(k.toString(), v))
          : const <String, Object?>{};
    } on FirebaseFunctionsException catch (e) {
      throw ProfessorStudentsException(
        callableErrorMessage(e.code, e.message, fallback),
      );
    }
  }

  Future<void> _write(Future<void> Function() op, String fallback) async {
    try {
      await op();
    } on FirebaseException catch (_) {
      throw ProfessorStudentsException(fallback);
    }
  }

  @override
  Stream<List<LessonPlan>> watchPlans(
    String uid, {
    required String fromDateKey,
  }) =>
      _firestore
          .collection('lessonPlans')
          .where('professorUid', isEqualTo: uid)
          .where('date', isGreaterThanOrEqualTo: fromDateKey)
          .orderBy('date')
          .snapshots()
          .map((q) => [
                for (final d in q.docs)
                  if (LessonPlan.fromMap(d.id, d.data()) case final p?) p,
              ]);

  @override
  Future<({String planId, int viewCount})> savePlan(
    LessonPlanDraft draft,
  ) async {
    final r = await _call(
      'saveLessonPlan',
      draft.toPayload(),
      'Não foi possível salvar o plano. Tente de novo.',
    );
    final count = r['viewCount'];
    return (
      planId: r['planId'] is String ? r['planId']! as String : '',
      viewCount: count is num ? count.toInt() : 0,
    );
  }

  @override
  Future<void> deletePlan(String planId) => _call(
        'deleteLessonPlan',
        {'planId': planId},
        'Não foi possível apagar o plano.',
      );

  @override
  Future<LessonPlanLesson> fetchLessonStudents(
    LessonPlanKind kind,
    String refId,
  ) async =>
      LessonPlanLesson.fromMap(
        await _call(
          'getLessonStudents',
          {'kind': kind.id, 'refId': refId},
          'Não foi possível carregar os alunos da aula.',
        ),
      );

  @override
  Stream<List<LessonTemplate>> watchTemplates(String uid) => _templates(uid)
      .orderBy('updatedAt', descending: true)
      .snapshots()
      .map((q) => [
            for (final d in q.docs) LessonTemplate.fromMap(d.id, d.data()),
          ]);

  @override
  Future<void> saveTemplate(
    String uid, {
    String? templateId,
    required String name,
    required String level,
    required LessonPlanContent content,
    int uses = 0,
  }) =>
      _write(() async {
        final doc = {
          ...lessonTemplateDocument(
            name: name,
            level: level,
            content: content,
            uses: uses,
          ),
          'updatedAt': FieldValue.serverTimestamp(),
        };
        if (templateId == null) {
          await _templates(uid)
              .add({...doc, 'createdAt': FieldValue.serverTimestamp()});
        } else {
          await _templates(uid)
              .doc(templateId)
              .set(doc, SetOptions(merge: true));
        }
      }, 'Não foi possível salvar o modelo.');

  @override
  Future<void> deleteTemplate(String uid, String templateId) => _write(
        () => _templates(uid).doc(templateId).delete(),
        'Não foi possível apagar o modelo.',
      );

  @override
  Future<void> markTemplateUsed(String uid, String templateId) => _write(
        () => _templates(uid).doc(templateId).update({
          'uses': FieldValue.increment(1),
          'updatedAt': FieldValue.serverTimestamp(),
        }),
        'Não foi possível atualizar o modelo.',
      );

  @override
  Stream<List<LessonExercise>> watchExercises(String uid) =>
      _exercises(uid).orderBy('name').snapshots().map((q) => [
            for (final d in q.docs) LessonExercise.fromMap(d.id, d.data()),
          ]);

  @override
  Future<void> saveExercise(
    String uid,
    LessonExerciseInput input, {
    String? exerciseId,
  }) =>
      _write(() async {
        final doc = {
          ...lessonExerciseDocument(input),
          'updatedAt': FieldValue.serverTimestamp(),
        };
        if (exerciseId == null) {
          await _exercises(uid)
              .add({...doc, 'createdAt': FieldValue.serverTimestamp()});
        } else {
          // Sem `uses`: a edição não zera o contador.
          doc.remove('uses');
          await _exercises(uid)
              .doc(exerciseId)
              .set(doc, SetOptions(merge: true));
        }
      }, 'Não foi possível salvar o exercício.');

  @override
  Future<void> deleteExercise(String uid, String exerciseId) => _write(
        () => _exercises(uid).doc(exerciseId).delete(),
        'Não foi possível apagar o exercício.',
      );

  @override
  Stream<List<LessonPlanView>> watchMyViews(String athleteId) => _firestore
      .collection('lessonPlanViews')
      .where('athleteId', isEqualTo: athleteId)
      .orderBy('date', descending: true)
      .snapshots()
      .map((q) => [
            for (final d in q.docs) LessonPlanView.fromMap(d.id, d.data()),
          ]);

  @override
  Stream<LessonPlanView?> watchView(String viewId) =>
      _firestore.collection('lessonPlanViews').doc(viewId).snapshots().map((d) {
        final data = d.data();
        return data == null ? null : LessonPlanView.fromMap(d.id, data);
      });
}

final professorLessonPlansRepositoryProvider =
    Provider<ProfessorLessonPlansRepository>((ref) {
  return FirebaseProfessorLessonPlansRepository(
    firestore: ref.watch(firestoreProvider),
  );
});
