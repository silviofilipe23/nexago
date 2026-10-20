import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../../core/firebase/functions_region.dart';
import '../../athlete/data/class_agenda_repository.dart';
import '../../athlete/domain/agenda/class_agenda_entry.dart';
import '../../athlete/domain/agenda/teacher_class_roster.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/professor_agenda.dart';
import 'professor_students_repository.dart' show ProfessorStudentsException;

/// Dados do bloqueio a gravar (E7).
class ProfessorBlockInput {
  const ProfessorBlockInput({
    required this.reason,
    required this.startAt,
    required this.endAt,
    this.note = '',
  });

  final ProfessorBlockReason reason;
  final DateTime startAt;
  final DateTime endAt;
  final String note;
}

/// Documento do bloqueio com os campos EXATOS da rule
/// (`users/{uid}/professorBlocks`): sem `note` vazia (a rule exige string),
/// `updatedAt` = hora do servidor, `createdAt` mantido na edição.
Map<String, Object?> professorBlockDocument(
  ProfessorBlockInput input, {
  DateTime? createdAt,
}) {
  final note = input.note.trim();
  final label = input.reason.label;
  return {
    'reason': input.reason.name,
    'reasonLabel': label.length > kProfessorBlockLabelMax
        ? label.substring(0, kProfessorBlockLabelMax)
        : label,
    'startAt': Timestamp.fromDate(input.startAt.toUtc()),
    'endAt': Timestamp.fromDate(input.endAt.toUtc()),
    if (note.isNotEmpty)
      'note': note.length > kProfessorBlockNoteMax
          ? note.substring(0, kProfessorBlockNoteMax)
          : note,
    'createdAt': createdAt == null
        ? FieldValue.serverTimestamp()
        : Timestamp.fromDate(createdAt.toUtc()),
    'updatedAt': FieldValue.serverTimestamp(),
  };
}

/// Agenda do professor: aulas de turma por intervalo (`getMyClassAgenda`),
/// bloqueios (Firestore direto, a rule valida) e o feed `.ics`
/// (`configureProfessorCalendarFeed`). Falhas como
/// [ProfessorStudentsException], com a mensagem pronta.
abstract class ProfessorAgendaRepository {
  /// Só as que ele dá (`role: teacher`).
  Future<List<ClassAgendaEntry>> fetchTeacherSessions(ProfessorAgendaRange r);

  /// Alunos da aula (`getMyClassSessionRoster`; só com a chamada liberada).
  Future<TeacherClassRoster> fetchSessionRoster(String sessionId);

  Stream<List<ProfessorBlock>> watchBlocks(String uid);

  /// Sem [blockId] cria.
  Future<void> saveBlock(
    String uid,
    ProfessorBlockInput input, {
    String? blockId,
    DateTime? createdAt,
  });

  Future<void> deleteBlock(String uid, String blockId);

  Future<ProfessorCalendarFeed> configureFeed({
    bool rotate = false,
    bool? showStudentNames,
    List<String>? excludedArenaIds,
  });
}

class FirebaseProfessorAgendaRepository implements ProfessorAgendaRepository {
  FirebaseProfessorAgendaRepository({
    required FirebaseFirestore firestore,
    required ClassAgendaRepository classes,
    FirebaseFunctions? functions,
  })  : _firestore = firestore,
        _classes = classes,
        _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _firestore;
  final ClassAgendaRepository _classes;
  final FirebaseFunctions _functions;

  CollectionReference<Map<String, dynamic>> _blocks(String uid) =>
      _firestore.collection('users').doc(uid).collection('professorBlocks');

  @override
  Future<List<ClassAgendaEntry>> fetchTeacherSessions(
    ProfessorAgendaRange r,
  ) async {
    try {
      final all = await _classes.fetchMyClassesInRange(
          fromKey: r.fromKey, toKey: r.toKey);
      return [
        for (final e in all)
          if (e.isTeacher) e,
      ];
    } on FirebaseFunctionsException catch (e) {
      throw ProfessorStudentsException(
        callableErrorMessage(
            e.code, e.message, 'Não foi possível carregar suas aulas.'),
      );
    }
  }

  @override
  Future<TeacherClassRoster> fetchSessionRoster(String sessionId) async {
    try {
      return await _classes.fetchTeacherRoster(sessionId);
    } on TeacherClassException catch (e) {
      throw ProfessorStudentsException(e.message);
    }
  }

  @override
  Stream<List<ProfessorBlock>> watchBlocks(String uid) =>
      _blocks(uid).snapshots().map((q) => [
            for (final d in q.docs)
              if (ProfessorBlock.fromMap(d.id, d.data()) case final b?) b,
          ]);

  @override
  Future<void> saveBlock(
    String uid,
    ProfessorBlockInput input, {
    String? blockId,
    DateTime? createdAt,
  }) async {
    final ref =
        blockId == null ? _blocks(uid).doc() : _blocks(uid).doc(blockId);
    try {
      // `set` inteiro (sem merge): a rule confere o conjunto exato de campos.
      await ref.set(professorBlockDocument(input, createdAt: createdAt));
    } on FirebaseException {
      throw const ProfessorStudentsException(
        'Não foi possível salvar o bloqueio. Confira o período e tente de novo.',
      );
    }
  }

  @override
  Future<void> deleteBlock(String uid, String blockId) async {
    try {
      await _blocks(uid).doc(blockId).delete();
    } on FirebaseException {
      throw const ProfessorStudentsException(
        'Não foi possível apagar o bloqueio.',
      );
    }
  }

  @override
  Future<ProfessorCalendarFeed> configureFeed({
    bool rotate = false,
    bool? showStudentNames,
    List<String>? excludedArenaIds,
  }) async {
    try {
      final result = await _functions
          .httpsCallable('configureProfessorCalendarFeed')
          .call<Object?>({
        if (rotate) 'rotate': true,
        if (showStudentNames != null) 'showStudentNames': showStudentNames,
        if (excludedArenaIds != null) 'excludedArenaIds': excludedArenaIds,
      });
      final raw = result.data;
      if (raw is! Map) {
        throw const ProfessorStudentsException(
            'Resposta inválida do servidor.');
      }
      return ProfessorCalendarFeed.fromMap(
        raw.map((k, v) => MapEntry(k.toString(), v)),
      );
    } on FirebaseFunctionsException catch (e) {
      throw ProfessorStudentsException(
        callableErrorMessage(
            e.code, e.message, 'Não foi possível ligar a sincronização.'),
      );
    }
  }
}

final professorAgendaRepositoryProvider =
    Provider<ProfessorAgendaRepository>((ref) {
  return FirebaseProfessorAgendaRepository(
    firestore: ref.watch(firestoreProvider),
    classes: ref.watch(classAgendaRepositoryProvider),
  );
});
