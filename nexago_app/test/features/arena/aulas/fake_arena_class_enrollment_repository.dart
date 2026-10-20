import 'dart:async';

import 'package:nexago_app/features/arena/data/arena_class_enrollment_repository.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_enrollment.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_session.dart';

/// Repositório da fase 2 em memória: registra com que `arenaId` cada leitura
/// foi feita (a rule nega query sem o filtro) e o que as callables receberam.
class FakeArenaClassEnrollmentRepository
    implements ArenaClassEnrollmentRepository {
  FakeArenaClassEnrollmentRepository({
    this.plans = const [],
    this.rules = ArenaClassRules.defaults,
    this.enrollments = const [],
    this.charges = const [],
    this.credits = const [],
    this.sessionsByClass = const {},
    this.preview = const ArenaClassEnrollmentPreview(
      charges: [],
      totalReais: 0,
      enrollmentFeeReais: 0,
    ),
  });

  final List<ArenaClassPlan> plans;
  final ArenaClassRules rules;
  final List<ArenaClassEnrollment> enrollments;
  final List<ArenaClassCharge> charges;
  final List<ArenaClassCredit> credits;
  final Map<String, List<ArenaClassSession>> sessionsByClass;
  ArenaClassEnrollmentPreview preview;

  /// Mensalidades ao vivo do aluno (o worker grava o link depois da
  /// matrícula). Sem ele, [charges] é estático.
  StreamController<List<ArenaClassCharge>>? liveStudentCharges;

  /// Toda leitura anota o `arenaId` usado.
  final List<String> arenaIdsRead = [];
  final List<ArenaClassEnrollmentRequest> previews = [];
  final List<ArenaClassEnrollmentRequest> created = [];
  final List<(String, String)> statusChanges = [];
  final List<(String, ArenaClassPaymentMethod)> paid = [];
  final List<String> canceled = [];

  @override
  Stream<List<ArenaClassPlan>> watchPlans(String arenaId) {
    arenaIdsRead.add(arenaId);
    return Stream.value(plans);
  }

  @override
  Stream<ArenaClassRules> watchRules(String arenaId) {
    arenaIdsRead.add(arenaId);
    return Stream.value(rules);
  }

  @override
  Stream<List<ArenaClassEnrollment>> watchEnrollments(String arenaId) {
    arenaIdsRead.add(arenaId);
    return Stream.value(enrollments);
  }

  @override
  Stream<List<ArenaClassEnrollment>> watchStudentEnrollments({
    required String arenaId,
    required String studentId,
  }) {
    arenaIdsRead.add(arenaId);
    return Stream.value(
      enrollments.where((e) => e.studentId == studentId).toList(),
    );
  }

  @override
  Stream<List<ArenaClassCharge>> watchOpenCharges(String arenaId) {
    arenaIdsRead.add(arenaId);
    return Stream.value(charges.where((c) => c.isOpen).toList());
  }

  @override
  Stream<List<ArenaClassCharge>> watchPaidChargesSince(
    String arenaId,
    String fromKey,
  ) {
    arenaIdsRead.add(arenaId);
    return Stream.value(
      charges
          .where((c) => c.isPaid && (c.paidOn ?? '').compareTo(fromKey) >= 0)
          .toList(),
    );
  }

  @override
  Stream<List<ArenaClassCharge>> watchStudentCharges({
    required String arenaId,
    required String studentId,
  }) {
    arenaIdsRead.add(arenaId);
    final live = liveStudentCharges;
    if (live != null) {
      return live.stream
          .map((list) => list.where((c) => c.studentId == studentId).toList());
    }
    return Stream.value(
        charges.where((c) => c.studentId == studentId).toList());
  }

  @override
  Stream<List<ArenaClassCredit>> watchAvailableCredits(String arenaId) {
    arenaIdsRead.add(arenaId);
    return Stream.value(credits.where((c) => c.isAvailable).toList());
  }

  @override
  Stream<List<ArenaClassCredit>> watchStudentCredits({
    required String arenaId,
    required String studentId,
  }) {
    arenaIdsRead.add(arenaId);
    return Stream.value(
        credits.where((c) => c.studentId == studentId).toList());
  }

  @override
  Stream<List<ArenaClassSession>> watchClassSessionsSince({
    required String arenaId,
    required String classId,
    required String fromKey,
  }) {
    arenaIdsRead.add(arenaId);
    return Stream.value(
      (sessionsByClass[classId] ?? const [])
          .where((s) => s.date.compareTo(fromKey) >= 0)
          .toList(),
    );
  }

  @override
  Future<ArenaClassEnrollmentPreview> previewEnrollment(
    ArenaClassEnrollmentRequest request,
  ) async {
    previews.add(request);
    return preview;
  }

  @override
  Future<ArenaClassEnrollmentCreated> createEnrollment(
    ArenaClassEnrollmentRequest request,
  ) async {
    created.add(request);
    return ArenaClassEnrollmentCreated(
      enrollmentId: 'e-new',
      studentId: request.athleteId ?? request.studentId ?? 'st-new',
      chargeIds: const ['e-new_2026-10'],
      // Online: 1º mês + taxa num grupo só (`{matrícula}_first`).
      asaasGroupId: request.billingMode == ArenaClassBillingMode.asaas
          ? 'e-new_first'
          : null,
    );
  }

  @override
  Future<int> setEnrollmentStatus({
    required String enrollmentId,
    required String status,
  }) async {
    statusChanges.add((enrollmentId, status));
    return status == 'canceled' ? 1 : 0;
  }

  @override
  Future<void> markChargePaid({
    required String chargeId,
    required ArenaClassPaymentMethod method,
  }) async {
    paid.add((chargeId, method));
  }

  @override
  Future<void> cancelCharge({required String chargeId}) async {
    canceled.add(chargeId);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
