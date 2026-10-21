import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/professor_evaluations.dart';
import 'professor_students_repository.dart' show ProfessorStudentsException;

/// Avaliações: leitura direta (o professor as dele; o aluno as ENVIADAS
/// dele — a rule exige os dois filtros) e escrita por callable.
abstract class ProfessorEvaluationsRepository {
  /// Do professor (sem ordem).
  Stream<List<ProfessorEvaluation>> watchMine(String professorUid);

  /// Enviadas para o aluno (sem ordem).
  Stream<List<ProfessorEvaluation>> watchReceived(String athleteUid);

  Future<ProfessorEvaluationSaved> save(ProfessorEvaluationInput input);

  /// Só rascunho.
  Future<void> delete(String evaluationId);
}

class FirebaseProfessorEvaluationsRepository
    implements ProfessorEvaluationsRepository {
  FirebaseProfessorEvaluationsRepository({
    required FirebaseFirestore firestore,
    FirebaseFunctions? functions,
  })  : _firestore = firestore,
        _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  CollectionReference<Map<String, dynamic>> get _col =>
      _firestore.collection('professorEvaluations');

  List<ProfessorEvaluation> _map(QuerySnapshot<Map<String, dynamic>> q) => [
        for (final d in q.docs) ProfessorEvaluation.fromMap(d.id, d.data()),
      ];

  @override
  Stream<List<ProfessorEvaluation>> watchMine(String professorUid) =>
      _col.where('professorUid', isEqualTo: professorUid).snapshots().map(_map);

  @override
  Stream<List<ProfessorEvaluation>> watchReceived(String athleteUid) => _col
      .where('athleteId', isEqualTo: athleteUid)
      .where('status', isEqualTo: 'sent')
      .snapshots()
      .map(_map);

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

  @override
  Future<ProfessorEvaluationSaved> save(ProfessorEvaluationInput input) async {
    final r = await _call(
      'saveProfessorEvaluation',
      input.toPayload(),
      'Não foi possível salvar a avaliação.',
    );
    final prev = r['previousOverall'];
    return (
      evaluationId:
          r['evaluationId'] is String ? r['evaluationId']! as String : '',
      status: r['status'] == 'sent'
          ? ProfessorEvaluationStatus.sent
          : ProfessorEvaluationStatus.draft,
      overall: r['overall'] is num ? (r['overall'] as num).toDouble() : 0.0,
      previousOverall: prev is num ? prev.toDouble() : null,
    );
  }

  @override
  Future<void> delete(String evaluationId) => _call(
        'deleteProfessorEvaluation',
        {'evaluationId': evaluationId},
        'Não foi possível apagar o rascunho.',
      );
}

final professorEvaluationsRepositoryProvider =
    Provider<ProfessorEvaluationsRepository>((ref) {
  return FirebaseProfessorEvaluationsRepository(
    firestore: ref.watch(firestoreProvider),
  );
});
