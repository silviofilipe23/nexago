import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/aulas/arena_class.dart';
import '../domain/aulas/arena_class_session.dart';

class ArenaClassException implements Exception {
  ArenaClassException(this.message, {this.code});

  final String message;
  final String? code;

  @override
  String toString() => message;
}

/// Resultado de `saveArenaClassAttendance`.
class ArenaClassAttendanceResult {
  const ArenaClassAttendanceResult(
      {required this.status, required this.marked});

  /// Status da aula depois de gravar (`completed` quando fechou).
  final String status;
  final int marked;
}

/// Resultado de `cancelArenaClassSession`.
class ArenaClassCancelResult {
  const ArenaClassCancelResult(
      {required this.sessionId, required this.notified});

  final String sessionId;

  /// Alunos com conta NexaGO avisados por push.
  final int notified;
}

/// Aulas (lado arena): leitura direta de `arenaClasses`, `classStudents` e
/// `arenaClassSessions` e escrita via callables.
///
/// Toda query filtra `arenaId`: a rule lê `resource.data.arenaId` para checar
/// a área `agenda` — sem o filtro a query inteira é negada.
class ArenaClassRepository {
  ArenaClassRepository(
    this._firestore, {
    FirebaseFunctions? functions,
  }) : _functions = functions;

  final FirebaseFirestore _firestore;

  /// Resolvido só na hora da escrita — ler a lista não deve exigir Functions.
  final FirebaseFunctions? _functions;

  FirebaseFunctions get _callables => _functions ?? nexagoFunctions;

  static const String classesCollection = 'arenaClasses';
  static const String sessionsCollection = 'arenaClassSessions';
  static const String studentsCollection = 'classStudents';

  /// Turmas e aulas avulsas da arena (todas as situações).
  Stream<List<ArenaClass>> watchClasses(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) return Stream.value(const []);
    return _firestore
        .collection(classesCollection)
        .where('arenaId', isEqualTo: id)
        .snapshots()
        .map((snap) => snap.docs.map(ArenaClass.fromFirestore).toList());
  }

  /// Aulas da arena num dia (índice `arenaId, date`).
  Stream<List<ArenaClassSession>> watchSessionsOn(
      String arenaId, String dateKey) {
    final id = arenaId.trim();
    if (id.isEmpty || dateKey.isEmpty) return Stream.value(const []);
    return _firestore
        .collection(sessionsCollection)
        .where('arenaId', isEqualTo: id)
        .where('date', isEqualTo: dateKey)
        .snapshots()
        .map((snap) => snap.docs.map(ArenaClassSession.fromFirestore).toList());
  }

  /// Uma aula em tempo real.
  Stream<ArenaClassSession?> watchSession(String sessionId) {
    final id = sessionId.trim();
    if (id.isEmpty) return Stream.value(null);
    return _firestore.collection(sessionsCollection).doc(id).snapshots().map(
          (doc) => doc.exists ? ArenaClassSession.fromFirestore(doc) : null,
        );
  }

  /// Alunos da turma, inclusive os que saíram (a chamada antiga ainda os cita).
  Stream<List<ArenaClassStudent>> watchStudents({
    required String arenaId,
    required String classId,
  }) {
    final arena = arenaId.trim();
    final cls = classId.trim();
    if (arena.isEmpty || cls.isEmpty) return Stream.value(const []);
    return _firestore
        .collection(classesCollection)
        .doc(cls)
        .collection(studentsCollection)
        .where('arenaId', isEqualTo: arena)
        .snapshots()
        .map((snap) => snap.docs.map(ArenaClassStudent.fromFirestore).toList());
  }

  /// Grava a chamada (`null` apaga a marca) e, com [close], fecha a aula.
  Future<ArenaClassAttendanceResult> saveAttendance({
    required String sessionId,
    required Map<String, String?> marks,
    bool close = false,
  }) async {
    try {
      final result =
          await _callables.httpsCallable('saveArenaClassAttendance').call({
        'sessionId': sessionId,
        'marks': marks,
        'close': close,
      });
      final data = result.data;
      final map = data is Map ? Map<String, dynamic>.from(data) : const {};
      return ArenaClassAttendanceResult(
        status:
            (map['status'] as String?) ?? (close ? 'completed' : 'scheduled'),
        marked: (map['marked'] as num?)?.toInt() ?? 0,
      );
    } on FirebaseFunctionsException catch (e) {
      throw ArenaClassException(_message(e), code: e.code);
    }
  }

  /// Cancela a aula do dia: libera a quadra e avisa os alunos com conta.
  Future<ArenaClassCancelResult> cancelSession({
    required String sessionId,
    required ArenaClassCancelReason reason,
    String? note,
  }) async {
    final trimmedNote = note?.trim() ?? '';
    try {
      final result =
          await _callables.httpsCallable('cancelArenaClassSession').call({
        'sessionId': sessionId,
        'reason': reason.id,
        if (trimmedNote.isNotEmpty) 'note': trimmedNote,
      });
      final data = result.data;
      final map = data is Map ? Map<String, dynamic>.from(data) : const {};
      return ArenaClassCancelResult(
        sessionId: (map['sessionId'] as String?) ?? sessionId,
        notified: (map['notified'] as num?)?.toInt() ?? 0,
      );
    } on FirebaseFunctionsException catch (e) {
      throw ArenaClassException(_message(e), code: e.code);
    }
  }

  /// As callables devolvem mensagens em português; o texto genérico do SDK
  /// ("NOT FOUND" quando a função ainda não foi deployada) vira copy.
  static String _message(FirebaseFunctionsException e) {
    final fallback = switch (e.code) {
      'unauthenticated' => 'Faça login para continuar.',
      'permission-denied' => 'Sem permissão para operar as aulas desta arena.',
      'not-found' => 'Aulas indisponíveis no momento. Tente mais tarde.',
      'internal' ||
      'unknown' ||
      'unavailable' =>
        'Erro no servidor. Tente novamente em instantes.',
      _ => 'Não foi possível concluir a operação. Tente novamente.',
    };
    return callableErrorMessage(e.code, e.message, fallback);
  }
}
