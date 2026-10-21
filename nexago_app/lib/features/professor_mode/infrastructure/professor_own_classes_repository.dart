import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/professor_own_classes.dart';
import 'professor_students_repository.dart' show ProfessorStudentsException;

/// Turmas próprias do professor independente (B10): leitura em tempo real
/// de `professors/{uid}/ownClasses` e escrita só por callable
/// (`functions/src/professor-own-classes.ts`). Falhas chegam como
/// [ProfessorStudentsException], com a mensagem pronta para a tela.
abstract class ProfessorOwnClassesRepository {
  /// Turmas do professor, mais antigas primeiro (`createdAt`).
  Stream<List<ProfessorOwnClass>> watchOwnClasses(String uid);

  Future<ProfessorOwnClassPreview> preview(ProfessorOwnClassInput input);

  Future<ProfessorOwnClassCreated> create(ProfessorOwnClassInput input);

  Future<void> end(String classId);

  /// Só alunos ATIVOS da carteira, até o número de vagas.
  Future<void> setStudents(String classId, List<String> athleteIds);
}

class FirebaseProfessorOwnClassesRepository
    implements ProfessorOwnClassesRepository {
  FirebaseProfessorOwnClassesRepository({
    required FirebaseFirestore firestore,
    FirebaseFunctions? functions,
  })  : _firestore = firestore,
        _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  @override
  Stream<List<ProfessorOwnClass>> watchOwnClasses(String uid) => _firestore
      .collection('professors')
      .doc(uid)
      .collection('ownClasses')
      .orderBy('createdAt')
      .snapshots()
      .map((q) => [
            for (final d in q.docs) ProfessorOwnClass.fromMap(d.id, d.data()),
          ]);

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
  Future<ProfessorOwnClassPreview> preview(
    ProfessorOwnClassInput input,
  ) async =>
      ProfessorOwnClassPreview.fromMap(
        await _call(
          'previewProfessorOwnClass',
          input.toPayload(),
          'Não foi possível calcular a reserva agora.',
        ),
      );

  @override
  Future<ProfessorOwnClassCreated> create(ProfessorOwnClassInput input) async =>
      ProfessorOwnClassCreated.fromMap(
        await _call(
          'createProfessorOwnClass',
          input.toPayload(),
          'Não foi possível criar a turma. Tente de novo.',
        ),
      );

  @override
  Future<void> end(String classId) => _call(
        'endProfessorOwnClass',
        {'classId': classId},
        'Não foi possível encerrar a turma.',
      );

  @override
  Future<void> setStudents(String classId, List<String> athleteIds) => _call(
        'setProfessorOwnClassStudents',
        {'classId': classId, 'athleteIds': athleteIds},
        'Não foi possível salvar os alunos da turma.',
      );
}

final professorOwnClassesRepositoryProvider =
    Provider<ProfessorOwnClassesRepository>((ref) {
  return FirebaseProfessorOwnClassesRepository(
    firestore: ref.watch(firestoreProvider),
  );
});
