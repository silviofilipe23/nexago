import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/center_coach.dart';
import '../domain/center_coach_repository.dart' show CenterCoachException;
import '../domain/center_management.dart';
import '../domain/center_management_repository.dart';

/// Gestão do centro no Firebase: as mesmas escritas do portal
/// (`team`, `enrollments`, `classes.changeSession`, `subscriptions` actions),
/// cada uma com a linha de `auditLogs` no mesmo batch/transação.
class FirebaseCenterManagementRepository implements CenterManagementRepository {
  FirebaseCenterManagementRepository(this._db, {FirebaseFunctions? functions})
    : _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _db;
  final FirebaseFunctions _functions;

  DocumentReference<Map<String, dynamic>> _center(String id) =>
      _db.collection('trainingCenters').doc(id);

  Map<String, Object?> _audit(
    CenterActor actor, {
    required String action,
    required String entity,
    required String entityId,
    required String detail,
    String reason = '',
  }) => {
    'at': FieldValue.serverTimestamp(),
    'actorUid': actor.uid,
    'actorName': actor.name,
    'action': action,
    'entity': entity,
    'entityId': entityId,
    'detail': detail,
    'reason': reason.trim(),
  };

  Stream<List<T>> _list<T>(
    Query<Map<String, dynamic>> q,
    T Function(String id, Map<String, Object?> m) read,
  ) => q.snapshots().map(
    (snap) => [for (final d in snap.docs) read(d.id, _plain(d.data()))],
  );

  Future<T> _write<T>(Future<T> Function() run, String fallback) async {
    try {
      return await run();
    } on CenterCoachException {
      rethrow;
    } on FirebaseException catch (e) {
      throw CenterCoachException(
        e.code == 'permission-denied'
            ? 'Seu acesso a esta ação mudou. Nada foi salvo.'
            : fallback,
        revoked: e.code == 'permission-denied',
      );
    }
  }

  // ── Equipe ─────────────────────────────────────────────────────────────

  @override
  Stream<List<CenterTeamMember>> watchTeam(String centerId) => _list(
    _center(centerId).collection('centerMembers'),
    CenterTeamMember.fromMap,
  );

  @override
  Stream<List<CenterInvite>> watchInvites(String centerId) => _list(
    _center(centerId).collection('centerInvites'),
    CenterInvite.fromMap,
  );

  @override
  Future<void> invite({
    required String centerId,
    required String uid,
    required String role,
    required List<String> programIds,
    required List<String> classIds,
  }) async {
    try {
      await _functions.httpsCallable('inviteTrainingCenterMember').call<Object?>({
        'centerId': centerId,
        'uid': uid,
        'role': role,
        'programIds': programIds,
        'classIds': classIds,
      });
    } on FirebaseFunctionsException catch (e) {
      throw CenterCoachException(
        callableErrorMessage(
          e.code,
          e.message,
          'Não foi possível enviar o convite. Tente de novo.',
        ),
      );
    }
  }

  @override
  Future<String> addStudent({
    required String centerId,
    required CenterNewStudentInput input,
    required CenterActor actor,
  }) => _write(() async {
    final ref = _center(centerId).collection('students').doc();
    final b = _db.batch();
    b.set(ref, {
      ...centerNewStudentDoc(input),
      'createdAt': FieldValue.serverTimestamp(),
    });
    b.set(
      _center(centerId).collection('auditLogs').doc(),
      _audit(
        actor,
        action: 'student.added',
        entity: 'student',
        entityId: ref.id,
        detail: centerNewStudentAuditDetail(input),
      ),
    );
    await b.commit();
    return ref.id;
  }, 'Não foi possível cadastrar o aluno. Tente de novo.');

  @override
  Future<void> cancelInvite({
    required String centerId,
    required CenterInvite invite,
    required CenterActor actor,
  }) => _write(() {
    final b = _db.batch();
    b.update(_center(centerId).collection('centerInvites').doc(invite.id), {
      'status': 'cancelled',
    });
    b.set(
      _center(centerId).collection('auditLogs').doc(),
      _audit(
        actor,
        action: 'member.invite_cancelled',
        entity: 'invite',
        entityId: invite.id,
        detail: 'Convite cancelado · ${invite.email}',
      ),
    );
    return b.commit();
  }, 'Não foi possível cancelar o convite.');

  @override
  Future<void> revokeMember({
    required String centerId,
    required CenterTeamMember member,
    required String reason,
    required CenterActor actor,
  }) => _write(() {
    final b = _db.batch();
    b.update(_center(centerId).collection('centerMembers').doc(member.uid), {
      'status': 'revoked',
      'revokedAt': FieldValue.serverTimestamp(),
    });
    b.set(
      _center(centerId).collection('auditLogs').doc(),
      _audit(
        actor,
        action: 'member.revoked',
        entity: 'member',
        entityId: member.uid,
        detail: 'Acesso de ${member.displayName} revogado',
        reason: reason,
      ),
    );
    return b.commit();
  }, 'Não foi possível revogar o acesso.');

  @override
  Stream<List<CenterProgram>> watchPrograms(String centerId) => _list(
    _center(centerId).collection('programs'),
    CenterProgram.fromMap,
  ).map((l) => l..sort((a, b) => a.order.compareTo(b.order)));

  // ── Matrícula ──────────────────────────────────────────────────────────

  @override
  Stream<List<CenterPlan>> watchPlans(String centerId) =>
      _list(_center(centerId).collection('plans'), CenterPlan.fromMap);

  @override
  Future<CenterEnrollResult> enroll({
    required String centerId,
    required CenterCoachCenter center,
    required CenterCoachStudent student,
    required CenterCoachClass cls,
    required CenterPlan plan,
    required String startDate,
    required String today,
    required bool canBill,
    required CenterActor actor,
  }) => _write(() {
    if (!center.isActive) {
      throw const CenterCoachException(
        'Matrículas liberam depois que o centro for ativado.',
      );
    }
    final contract = centerBuildContract(plan, center.rawPolicies, today);
    final policies = contract['policies'] as Map<String, Object>;
    final status = centerEnrollStatus(center.rawPolicies);
    final pack = plan.type == 'class_pack';
    final classRef = _center(centerId).collection('classes').doc(cls.id);
    final enrollmentRef = _center(centerId).collection('enrollments').doc();
    final invoiceRef = _center(centerId).collection('invoices').doc();
    final holdUntil = status == 'pending'
        ? DateTime.now().add(
            Duration(hours: (policies['pendingHoldHours'] as num).toInt()),
          )
        : null;
    return _db.runTransaction<CenterEnrollResult>((t) async {
      final snap = await t.get(classRef);
      if (!snap.exists) {
        throw const CenterCoachException('Turma não encontrada.');
      }
      final fresh = CenterCoachClass.fromMap(snap.id, _plain(snap.data()!));
      if (fresh.status != 'active') {
        throw const CenterCoachException('A turma não está ativa.');
      }
      if (fresh.seatsTaken >= fresh.capacity) {
        return CenterEnrollFull(
          capacity: fresh.capacity,
          seatsTaken: fresh.seatsTaken,
        );
      }
      t.update(classRef, {
        'seatsTaken': fresh.seatsTaken + 1,
        'rosterStudentIds': centerRosterAfter(
          fresh.rosterStudentIds,
          student.id,
          1,
        ),
      });
      t.set(enrollmentRef, {
        'studentId': student.id,
        'studentName': student.name,
        'classId': cls.id,
        'className': cls.name,
        'planId': plan.id,
        'contract': contract,
        'status': status,
        'startDate': startDate,
        'holdUntil': holdUntil == null ? null : Timestamp.fromDate(holdUntil),
        'pausedUntil': null,
        'pauseReason': '',
        'creditsLeft': pack ? plan.credits : null,
        'waitlistedAt': null,
        'notifyOnSeat': false,
        'endedAt': null,
        'createdAt': FieldValue.serverTimestamp(),
        'createdByName': actor.name,
      });
      int? amount;
      if (canBill) {
        final inv = centerEnrollInvoice(
          contract: contract,
          billing: CenterBillingConfig.fromMap(center.rawBilling),
          startDate: startDate,
          today: today,
        );
        amount = inv.amountCents;
        t.set(invoiceRef, {
          'studentId': student.id,
          'enrollmentId': enrollmentRef.id,
          'payerName': centerPayerName(student),
          'reference': inv.reference,
          'amountCents': inv.amountCents,
          'dueDate': today,
          'status': 'pending',
          'method': null,
          'providerRef': '',
          'events': [
            {
              'at': Timestamp.now(),
              'type': 'created',
              'title': 'Cobrança criada',
              'detail':
                  '${centerBrl(inv.amountCents)} · ${inv.reference}'
                  '${inv.detailSuffix}',
              'byName': actor.name,
            },
          ],
          'approvedAt': null,
          'refundedCents': 0,
          'createdAt': FieldValue.serverTimestamp(),
        });
      }
      t.set(
        _center(centerId).collection('auditLogs').doc(),
        _audit(
          actor,
          action: 'enrollment.created',
          entity: 'enrollment',
          entityId: enrollmentRef.id,
          detail:
              '${student.name} → ${cls.name} · ${contract['planName']} '
              '${centerBrl(contract['priceCents'] as int)} · '
              '${status == 'active' ? 'ativa' : 'pendente'}',
        ),
      );
      return CenterEnrolled(
        enrollmentId: enrollmentRef.id,
        status: status,
        invoiceId: canBill ? invoiceRef.id : null,
        amountCents: amount,
        holdUntil: holdUntil,
      );
    });
  }, 'Não foi possível matricular. Confira a conexão e tente de novo.');

  @override
  Future<String> joinWaitlist({
    required String centerId,
    required CenterCoachStudent student,
    required CenterCoachClass cls,
    required CenterPlan plan,
    required String startDate,
    required CenterActor actor,
  }) => _write(() async {
    final ref = _center(centerId).collection('enrollments').doc();
    final b = _db.batch();
    b.set(ref, {
      'studentId': student.id,
      'studentName': student.name,
      'classId': cls.id,
      'className': cls.name,
      'planId': plan.id,
      'contract': null,
      'status': 'waitlisted',
      'startDate': startDate,
      'holdUntil': null,
      'pausedUntil': null,
      'pauseReason': '',
      'creditsLeft': null,
      'waitlistedAt': FieldValue.serverTimestamp(),
      'notifyOnSeat': true,
      'endedAt': null,
      'createdAt': FieldValue.serverTimestamp(),
      'createdByName': actor.name,
    });
    b.set(
      _center(centerId).collection('auditLogs').doc(),
      _audit(
        actor,
        action: 'enrollment.waitlisted',
        entity: 'enrollment',
        entityId: ref.id,
        detail: '${student.name} na lista de espera de ${cls.name}',
      ),
    );
    await b.commit();
    return ref.id;
  }, 'Não foi possível entrar na lista de espera.');

  // ── Local da aula ──────────────────────────────────────────────────────

  @override
  Stream<List<CenterLocation>> watchLocations(String centerId) => _list(
    _center(centerId).collection('locations'),
    CenterLocation.fromMap,
  );

  @override
  Stream<List<CenterCourt>> watchCourts(String centerId) =>
      _list(_center(centerId).collection('courts'), CenterCourt.fromMap);

  @override
  Future<void> changeSessionLocation({
    required String centerId,
    required CenterCoachSession session,
    required CenterLocation location,
    CenterCourt? court,
    required String reason,
    required CenterActor actor,
  }) => _write(() {
    final parts = [
      if (location.id != session.locationId) 'local → ${location.name}',
      if ((court?.id ?? '') != session.courtId)
        'quadra → ${court?.name ?? 'sem quadra'}',
    ];
    final b = _db.batch();
    b.update(_center(centerId).collection('sessions').doc(session.id), {
      'locationId': location.id,
      'locationName': location.name,
      'locationAddress': location.address,
      'courtId': court?.id ?? '',
      'courtName': court?.name ?? '',
      'changed': true,
      'changeReason': reason.trim(),
    });
    b.set(
      _center(centerId).collection('auditLogs').doc(),
      _audit(
        actor,
        action: 'session.changed',
        entity: 'session',
        entityId: session.id,
        detail:
            '${session.className} · ${centerDayLabel(session.date)}: '
            '${parts.isEmpty ? 'alterada' : parts.join(', ')}',
        reason: reason,
      ),
    );
    return b.commit();
  }, 'Não foi possível mudar o local. Tente de novo.');

  // ── Assinatura ─────────────────────────────────────────────────────────

  @override
  Stream<List<CenterSubscription>> watchStudentSubscriptions(
    String centerId,
    String studentId,
  ) => _list(
    _center(
      centerId,
    ).collection('subscriptions').where('studentId', isEqualTo: studentId),
    CenterSubscription.fromMap,
  );

  @override
  Future<void> scheduleSubscriptionCancel({
    required String centerId,
    required CenterSubscription subscription,
    required CenterActor actor,
  }) => _write(() {
    final ref = _center(centerId).collection('subscriptions').doc(subscription.id);
    return _db.runTransaction<void>((t) async {
      final cur = (await t.get(ref)).data();
      if (cur == null || !['active', 'past_due'].contains(cur['status'])) {
        throw const CenterCoachException(
          'A assinatura mudou. Recarregue e tente de novo.',
        );
      }
      final at = '${cur['nextChargeDate'] ?? ''}';
      t.update(ref, {
        'status': 'canceling',
        'cancelAt': at,
        'cancelRequestedAt': FieldValue.serverTimestamp(),
        'cancelRequestedBy': actor.name,
        'updatedAt': FieldValue.serverTimestamp(),
      });
      t.set(
        _center(centerId).collection('auditLogs').doc(),
        _audit(
          actor,
          action: 'subscription.cancel_scheduled',
          entity: 'subscription',
          entityId: subscription.id,
          detail:
              '${subscription.payerName} · ${subscription.planName} · '
              'encerra em ${at.length == 10 ? centerDayLabel(at) : at} (fim do ciclo)',
        ),
      );
    });
  }, 'Não foi possível agendar o cancelamento.');

  @override
  Future<void> undoSubscriptionCancel({
    required String centerId,
    required CenterSubscription subscription,
    required CenterActor actor,
  }) => _write(() {
    final ref = _center(centerId).collection('subscriptions').doc(subscription.id);
    return _db.runTransaction<void>((t) async {
      final cur = (await t.get(ref)).data();
      if (cur == null || cur['status'] != 'canceling') {
        throw const CenterCoachException(
          'A assinatura mudou. Recarregue e tente de novo.',
        );
      }
      t.update(ref, {
        'status': 'active',
        'cancelAt': null,
        'cancelRequestedAt': null,
        'cancelRequestedBy': null,
        'updatedAt': FieldValue.serverTimestamp(),
      });
      t.set(
        _center(centerId).collection('auditLogs').doc(),
        _audit(
          actor,
          action: 'subscription.cancel_undone',
          entity: 'subscription',
          entityId: subscription.id,
          detail:
              '${subscription.payerName} · cancelamento no fim do ciclo desfeito',
        ),
      );
    });
  }, 'Não foi possível desfazer o cancelamento.');

  @override
  Future<({String invoiceId, String invoiceUrl, bool generated})> chargeNow({
    required String centerId,
    required CenterSubscription subscription,
  }) async {
    try {
      final r = await _functions
          .httpsCallable('chargeTrainingCenterSubscriptionNow')
          .call<Object?>({
            'centerId': centerId,
            'subscriptionId': subscription.id,
          });
      final d = r.data is Map ? r.data as Map : const {};
      return (
        invoiceId: '${d['invoiceId'] ?? ''}',
        invoiceUrl: '${d['invoiceUrl'] ?? ''}',
        generated: d['generated'] == true,
      );
    } on FirebaseFunctionsException catch (e) {
      throw CenterCoachException(
        callableErrorMessage(
          e.code,
          e.message,
          'Não foi possível gerar a cobrança agora. Tente de novo.',
        ),
      );
    }
  }
}

Map<String, Object?> _plain(Map<String, dynamic> m) =>
    m.map((k, v) => MapEntry(k, _plainValue(v)));

Object? _plainValue(Object? v) {
  if (v is Timestamp) return v.toDate();
  if (v is Map) return v.map((k, x) => MapEntry('$k', _plainValue(x)));
  if (v is List) return [for (final x in v) _plainValue(x)];
  return v;
}

final centerManagementRepositoryProvider = Provider<CenterManagementRepository>(
  (ref) => FirebaseCenterManagementRepository(ref.watch(firestoreProvider)),
);
