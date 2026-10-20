import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/professor_students.dart';

/// Falha ao ler ou gravar, com a mensagem pronta para a tela.
class ProfessorStudentsException implements Exception {
  const ProfessorStudentsException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Alunos do professor (callable `getMyProfessorStudents` — as coleções das
/// Aulas são só da equipe da arena) e as anotações privadas dele
/// (`users/{uid}/professorStudentNotes/{arenaId}_{studentId}`, só o dono lê).
abstract class ProfessorStudentsRepository {
  Future<ProfessorStudentsSnapshot> fetchMyStudents();

  Stream<String> watchNote({
    required String uid,
    required String arenaId,
    required String studentId,
  });

  /// Texto vazio apaga a anotação.
  Future<void> saveNote({
    required String uid,
    required String arenaId,
    required String studentId,
    required String text,
  });
}

/// Teto da anotação (o mesmo da rule).
const int kProfessorNoteMaxLength = 2000;

String professorNoteId(String arenaId, String studentId) =>
    '${arenaId}_$studentId';

class FirebaseProfessorStudentsRepository
    implements ProfessorStudentsRepository {
  FirebaseProfessorStudentsRepository({
    required FirebaseFirestore firestore,
    FirebaseFunctions? functions,
  })  : _firestore = firestore,
        _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  static const _fallback = 'Não foi possível carregar seus alunos.';

  DocumentReference<Map<String, dynamic>> _noteRef(
    String uid,
    String arenaId,
    String studentId,
  ) =>
      _firestore
          .collection('users')
          .doc(uid)
          .collection('professorStudentNotes')
          .doc(professorNoteId(arenaId, studentId));

  @override
  Future<ProfessorStudentsSnapshot> fetchMyStudents() async {
    try {
      final result = await _functions
          .httpsCallable('getMyProfessorStudents')
          .call<Object?>(const <String, Object?>{});
      final raw = result.data;
      if (raw is! Map) throw const ProfessorStudentsException(_fallback);
      return ProfessorStudentsSnapshot.fromMap(
        raw.map((k, v) => MapEntry(k.toString(), v)),
      );
    } on FirebaseFunctionsException catch (e) {
      throw ProfessorStudentsException(
        callableErrorMessage(e.code, e.message, _fallback),
      );
    }
  }

  @override
  Stream<String> watchNote({
    required String uid,
    required String arenaId,
    required String studentId,
  }) {
    return _noteRef(uid, arenaId, studentId).snapshots().map((snap) {
      final text = snap.data()?['text'];
      return text is String ? text : '';
    });
  }

  @override
  Future<void> saveNote({
    required String uid,
    required String arenaId,
    required String studentId,
    required String text,
  }) async {
    final ref = _noteRef(uid, arenaId, studentId);
    final trimmed = text.trim();
    try {
      if (trimmed.isEmpty) {
        await ref.delete();
        return;
      }
      await ref.set({
        'arenaId': arenaId,
        'studentId': studentId,
        'text': trimmed.length > kProfessorNoteMaxLength
            ? trimmed.substring(0, kProfessorNoteMaxLength)
            : trimmed,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } on FirebaseException {
      throw const ProfessorStudentsException(
        'Não foi possível salvar a anotação. Tente de novo.',
      );
    }
  }
}

final professorStudentsRepositoryProvider =
    Provider<ProfessorStudentsRepository>((ref) {
  return FirebaseProfessorStudentsRepository(
    firestore: ref.watch(firestoreProvider),
  );
});
