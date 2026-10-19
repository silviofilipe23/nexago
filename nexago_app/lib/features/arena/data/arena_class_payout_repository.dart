import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../../../core/firebase/functions_region.dart';
import '../domain/aulas/arena_class_payout.dart';
import '../domain/aulas/arena_class_payout_logic.dart';
import '../domain/aulas/arena_class_teacher.dart';
import 'arena_class_repository.dart';

/// Professores e repasse (Aulas fase 2b): leitura de `classTeachers` e
/// `arenaClassPayouts` e as callables de `functions/src/arena-class-payout.ts`.
///
/// `arenaClassPayouts` é lido SEMPRE por query com `arenaId`: a rule checa
/// `resource.data.arenaId` (quem lê o financeiro), então escutar por `doc()`
/// um fechamento que ainda não existe é negado e o listener morre antes do
/// fechamento nascer. A conta do mês é do servidor — o app não recalcula.
class ArenaClassPayoutRepository {
  ArenaClassPayoutRepository(
    this._firestore, {
    FirebaseFunctions? functions,
  }) : _functions = functions;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions? _functions;

  FirebaseFunctions get _callables => _functions ?? nexagoFunctions;

  static const String payoutsCollection = 'arenaClassPayouts';

  /// Professores da arena (ativos e arquivados). Lê quem lê a agenda.
  Stream<List<ArenaClassTeacher>> watchTeachers(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) return Stream.value(const []);
    return _firestore
        .collection('arenas')
        .doc(id)
        .collection('classTeachers')
        .snapshots()
        .map((snap) => snap.docs.map(ArenaClassTeacher.fromFirestore).toList());
  }

  /// Fechamentos da arena no mês (só igualdades: dispensa índice composto).
  Stream<List<ArenaClassPayout>> watchMonthPayouts(
    String arenaId,
    String month,
  ) {
    final id = arenaId.trim();
    if (id.isEmpty || month.isEmpty) return Stream.value(const []);
    return _firestore
        .collection(payoutsCollection)
        .where('arenaId', isEqualTo: id)
        .where('month', isEqualTo: month)
        .snapshots()
        .map((snap) => snap.docs.map(ArenaClassPayout.fromFirestore).toList());
  }

  /// Fechamento do professor no mês — query, não `doc()` (ver a classe).
  Stream<ArenaClassPayout?> watchTeacherPayout({
    required String arenaId,
    required String teacherId,
    required String month,
  }) {
    final arena = arenaId.trim();
    final teacher = teacherId.trim();
    if (arena.isEmpty || teacher.isEmpty || month.isEmpty) {
      return Stream.value(null);
    }
    final payoutId = arenaClassPayoutId(arena, teacher, month);
    return _firestore
        .collection(payoutsCollection)
        .where('arenaId', isEqualTo: arena)
        .where('teacherId', isEqualTo: teacher)
        .where('month', isEqualTo: month)
        .snapshots()
        .map((snap) {
      for (final doc in snap.docs) {
        if (doc.id == payoutId) return ArenaClassPayout.fromFirestore(doc);
      }
      return null;
    });
  }

  /// Últimos 12 fechamentos do professor (índice `arenaId, teacherId, month
  /// desc`).
  Stream<List<ArenaClassPayout>> watchTeacherPayoutHistory({
    required String arenaId,
    required String teacherId,
  }) {
    final arena = arenaId.trim();
    final teacher = teacherId.trim();
    if (arena.isEmpty || teacher.isEmpty) return Stream.value(const []);
    return _firestore
        .collection(payoutsCollection)
        .where('arenaId', isEqualTo: arena)
        .where('teacherId', isEqualTo: teacher)
        .orderBy('month', descending: true)
        .limit(12)
        .snapshots()
        .map((snap) => snap.docs.map(ArenaClassPayout.fromFirestore).toList());
  }

  /// Prévia do mês para todos os professores, calculada no servidor.
  Future<ArenaClassPayoutPreview> previewPayouts({
    required String arenaId,
    required String month,
  }) async {
    final map = await _call('previewArenaClassPayouts', {
      'arenaId': arenaId,
      'month': month,
    });
    return ArenaClassPayoutPreview.fromMap(map);
  }

  /// Fecha (ou recalcula, antes de pagar) o repasse do mês. O ajuste
  /// diferente de zero exige o motivo. Devolve o total gravado.
  Future<double> closePayout({
    required String arenaId,
    required String teacherId,
    required String month,
    required double adjustmentReais,
    String? adjustmentNote,
  }) async {
    final note = adjustmentNote?.trim() ?? '';
    final map = await _call('closeArenaClassPayout', {
      'arenaId': arenaId,
      'teacherId': teacherId,
      'month': month,
      'adjustmentReais': adjustmentReais,
      'adjustmentNote': note.isEmpty ? null : note,
    });
    return (map['amountReais'] as num?)?.toDouble() ?? 0;
  }

  /// Registra o pagamento feito por fora (forma e data `YYYY-MM-DD`).
  Future<void> markPayoutPaid({
    required String payoutId,
    required ArenaClassPayoutMethod method,
    required String paidOn,
  }) async {
    await _call('setArenaClassPayoutStatus', {
      'payoutId': payoutId,
      'status': 'paid',
      'paymentMethod': method.id,
      'paidOn': paidOn,
    });
  }

  /// Desfaz o pagamento registrado por engano (volta para "a pagar").
  Future<void> undoPayoutPayment(String payoutId) async {
    await _call('setArenaClassPayoutStatus', {
      'payoutId': payoutId,
      'status': 'closed',
    });
  }

  /// Troca o modelo de repasse (só o gestor — o servidor confere). A
  /// callable regrava especialidade, telefone, cor e status: vão os atuais.
  Future<void> saveTeacherPayout({
    required String arenaId,
    required ArenaClassTeacher teacher,
    required ArenaClassTeacherPayoutModel payout,
  }) async {
    await _call('upsertArenaClassTeacher', {
      'arenaId': arenaId,
      'teacherId': teacher.id,
      if (teacher.userId != null) 'userId': teacher.userId,
      'specialty': teacher.specialty,
      'phone': teacher.phone,
      'color': teacher.color,
      'status': teacher.status,
      'payout': payout.toPayload(),
    });
  }

  Future<Map<Object?, Object?>> _call(
    String name,
    Map<String, Object?> payload,
  ) async {
    try {
      final result = await _callables.httpsCallable(name).call(payload);
      final data = result.data;
      return data is Map ? Map<Object?, Object?>.from(data) : const {};
    } on FirebaseFunctionsException catch (e) {
      throw ArenaClassException(ArenaClassRepository.message(e), code: e.code);
    }
  }
}
