import 'package:nexago_app/features/arena/data/arena_class_payout_repository.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_payout.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_teacher.dart';

/// Repositório do repasse em memória: anota com que `arenaId` cada leitura
/// foi feita (a rule de `arenaClassPayouts` nega query sem o filtro) e o que
/// as callables receberam.
class FakeArenaClassPayoutRepository implements ArenaClassPayoutRepository {
  FakeArenaClassPayoutRepository({
    this.teachers = const [],
    this.previews = const {},
    this.payouts = const [],
    this.previewError,
  });

  final List<ArenaClassTeacher> teachers;

  /// Prévia por mês; mês ausente = prévia vazia.
  final Map<String, ArenaClassPayoutPreview> previews;
  final List<ArenaClassPayout> payouts;
  Object? previewError;

  final List<String> teacherReads = [];
  final List<(String, String)> monthReads = [];
  final List<(String, String, String)> teacherPayoutReads = [];
  final List<(String, String)> historyReads = [];
  final List<(String, String)> previewCalls = [];
  final List<Map<String, Object?>> closeCalls = [];
  final List<(String, ArenaClassPayoutMethod, String)> paidCalls = [];
  final List<String> undoCalls = [];
  final List<String> nexagoCalls = [];

  /// Erro de `payPayoutViaNexago` (mensagem do servidor).
  Object? nexagoError;
  final List<(String, ArenaClassTeacher, ArenaClassTeacherPayoutModel)>
      savedModels = [];

  @override
  Stream<List<ArenaClassTeacher>> watchTeachers(String arenaId) {
    teacherReads.add(arenaId);
    return Stream.value(teachers);
  }

  @override
  Stream<List<ArenaClassPayout>> watchMonthPayouts(
    String arenaId,
    String month,
  ) {
    monthReads.add((arenaId, month));
    return Stream.value(
      [
        for (final p in payouts)
          if (p.month == month) p
      ],
    );
  }

  @override
  Stream<ArenaClassPayout?> watchTeacherPayout({
    required String arenaId,
    required String teacherId,
    required String month,
  }) {
    teacherPayoutReads.add((arenaId, teacherId, month));
    for (final p in payouts) {
      if (p.teacherId == teacherId && p.month == month) {
        return Stream.value(p);
      }
    }
    return Stream.value(null);
  }

  @override
  Stream<List<ArenaClassPayout>> watchTeacherPayoutHistory({
    required String arenaId,
    required String teacherId,
  }) {
    historyReads.add((arenaId, teacherId));
    final list = [
      for (final p in payouts)
        if (p.teacherId == teacherId) p
    ]..sort((a, b) => b.month.compareTo(a.month));
    return Stream.value(list);
  }

  @override
  Future<ArenaClassPayoutPreview> previewPayouts({
    required String arenaId,
    required String month,
  }) async {
    previewCalls.add((arenaId, month));
    if (previewError != null) throw previewError!;
    return previews[month] ?? ArenaClassPayoutPreview(month: month);
  }

  @override
  Future<double> closePayout({
    required String arenaId,
    required String teacherId,
    required String month,
    required double adjustmentReais,
    String? adjustmentNote,
  }) async {
    closeCalls.add({
      'arenaId': arenaId,
      'teacherId': teacherId,
      'month': month,
      'adjustmentReais': adjustmentReais,
      'adjustmentNote': adjustmentNote,
    });
    return 0;
  }

  @override
  Future<void> markPayoutPaid({
    required String payoutId,
    required ArenaClassPayoutMethod method,
    required String paidOn,
  }) async {
    paidCalls.add((payoutId, method, paidOn));
  }

  @override
  Future<double> payPayoutViaNexago(String payoutId) async {
    final e = nexagoError;
    if (e != null) throw e;
    nexagoCalls.add(payoutId);
    return 0;
  }

  @override
  Future<void> undoPayoutPayment(String payoutId) async {
    undoCalls.add(payoutId);
  }

  @override
  Future<void> saveTeacherPayout({
    required String arenaId,
    required ArenaClassTeacher teacher,
    required ArenaClassTeacherPayoutModel payout,
  }) async {
    savedModels.add((arenaId, teacher, payout));
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
