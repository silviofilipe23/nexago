import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../../core/firebase/functions_region.dart';
import '../../../core/formatting/app_currency_format.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/center_alerts.dart';
import '../domain/center_coach.dart';
import '../domain/center_coach_repository.dart';
import '../domain/center_finance.dart';

/// Professor do centro no Firebase: `trainingCenters/{c}/…` com as mesmas
/// rules do portal (`sessions` só os campos da chamada; `auditLogs` com
/// `at = request.time`), e `listTrainingCenterMakeupCandidates`.
class FirebaseCenterCoachRepository implements CenterCoachRepository {
  FirebaseCenterCoachRepository(this._db, {FirebaseFunctions? functions})
    : _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _db;
  final FirebaseFunctions _functions;

  DocumentReference<Map<String, dynamic>> _center(String id) =>
      _db.collection('trainingCenters').doc(id);

  @override
  Stream<List<CenterMembership>> watchMemberships(String uid) => _db
      .collectionGroup('centerMembers')
      .where('uid', isEqualTo: uid)
      .snapshots()
      .map(
        (snap) => [
          for (final d in snap.docs)
            if (d.reference.parent.parent != null &&
                d.reference.parent.parent!.parent.id == 'trainingCenters')
              CenterMembership.fromMap(
                d.reference.parent.parent!.id,
                _plain(d.data()),
              ),
        ],
      );

  @override
  Stream<CenterCoachCenter?> watchCenter(String centerId) =>
      _center(centerId).snapshots().map(
        (d) => d.exists
            ? CenterCoachCenter.fromMap(d.id, _plain(d.data()!))
            : null,
      );

  @override
  Stream<List<CenterCoachSession>> watchSessions(
    String centerId, {
    required String fromKey,
    required String toKey,
  }) => _center(centerId)
      .collection('sessions')
      .where('date', isGreaterThanOrEqualTo: fromKey)
      .where('date', isLessThanOrEqualTo: toKey)
      .snapshots()
      .map(_sessions);

  @override
  Stream<CenterCoachSession?> watchSession(String centerId, String sessionId) =>
      _center(centerId)
          .collection('sessions')
          .doc(sessionId)
          .snapshots()
          .map(
            (d) => d.exists
                ? CenterCoachSession.fromMap(d.id, _plain(d.data()!))
                : null,
          );

  @override
  Stream<List<CenterCoachSession>> watchClassSessions(
    String centerId,
    String classId, {
    required String fromKey,
    required String toKey,
  }) => _center(centerId)
      .collection('sessions')
      .where('classId', isEqualTo: classId)
      .where('date', isGreaterThanOrEqualTo: fromKey)
      .where('date', isLessThanOrEqualTo: toKey)
      .snapshots()
      .map((s) => _sessions(s)..sort((a, b) => b.date.compareTo(a.date)));

  @override
  Stream<List<CenterCoachClass>> watchClasses(String centerId) =>
      _center(centerId)
          .collection('classes')
          .snapshots()
          .map(
            (snap) => [
              for (final d in snap.docs)
                CenterCoachClass.fromMap(d.id, _plain(d.data())),
            ],
          );

  @override
  Stream<List<CenterCoachStudent>> watchStudents(
    String centerId, {
    required String uid,
    required bool all,
  }) {
    Query<Map<String, dynamic>> q = _center(centerId).collection('students');
    if (!all) q = q.where('coachUids', arrayContains: uid);
    return q.snapshots().map(
      (snap) => [
        for (final d in snap.docs)
          CenterCoachStudent.fromMap(d.id, _plain(d.data())),
      ],
    );
  }

  @override
  Future<void> saveAttendance({
    required String centerId,
    required CenterCoachSession session,
    required Map<String, CenterMark> marks,
    required List<String> makeupIds,
    required bool finalize,
    required String actorUid,
    required String actorName,
    required bool audit,
  }) async {
    final b = _db.batch();
    b.update(_center(centerId).collection('sessions').doc(session.id), {
      'attendance': {
        for (final e in marks.entries) e.key: centerMarkValue(e.value),
      },
      'makeupStudentIds': makeupIds,
      'attendanceUpdatedAt': FieldValue.serverTimestamp(),
      if (finalize) ...{
        'status': 'done',
        'finalizedAt': FieldValue.serverTimestamp(),
        'finalizedByName': actorName,
      },
    });
    if (audit || finalize) {
      final counts = _counts(marks);
      b.set(_center(centerId).collection('auditLogs').doc(), {
        'at': FieldValue.serverTimestamp(),
        'actorUid': actorUid,
        'actorName': actorName,
        'action': finalize ? 'session.finalized' : 'session.attendance',
        'entity': 'session',
        'entityId': session.id,
        'detail': attendanceAuditDetail(session, counts, finalize: finalize),
        'reason': '',
      });
    }
    await _commit(b);
  }

  @override
  Future<void> correctAttendance({
    required String centerId,
    required CenterCoachSession session,
    required String studentId,
    required String studentName,
    required CenterMark to,
    required String reason,
    required String actorUid,
    required String actorName,
  }) async {
    final from = session.attendance[studentId];
    final b = _db.batch();
    b.update(_center(centerId).collection('sessions').doc(session.id), {
      'attendance': {
        for (final e in session.attendance.entries)
          e.key: centerMarkValue(e.value),
        studentId: centerMarkValue(to),
      },
      'attendanceUpdatedAt': FieldValue.serverTimestamp(),
      'attendanceLog': FieldValue.arrayUnion([
        {
          'at': Timestamp.now(),
          'byName': actorName,
          'studentId': studentId,
          'from': from == null ? null : centerMarkValue(from),
          'to': centerMarkValue(to),
          'reason': reason.trim(),
        },
      ]),
    });
    final d = session.date.split('-');
    b.set(_center(centerId).collection('auditLogs').doc(), {
      'at': FieldValue.serverTimestamp(),
      'actorUid': actorUid,
      'actorName': actorName,
      'action': 'session.attendance_corrected',
      'entity': 'session',
      'entityId': session.id,
      'detail':
          '$studentName · ${d.length == 3 ? '${d[2]}/${d[1]}' : session.date}: '
          '${centerMarkLabel(from)} → ${centerMarkLabel(to)}',
      'reason': reason.trim(),
    });
    await _commit(b);
  }

  @override
  Stream<List<CenterCoachEnrollment>> watchEnrollments(String centerId) =>
      _center(centerId)
          .collection('enrollments')
          .snapshots()
          .map(
            (snap) => [
              for (final d in snap.docs)
                CenterCoachEnrollment.fromMap(d.id, _plain(d.data())),
            ],
          );

  @override
  Stream<List<CenterCoachInvoice>> watchInvoices(String centerId) =>
      _center(centerId)
          .collection('invoices')
          .snapshots()
          .map(
            (snap) => [
              for (final d in snap.docs)
                CenterCoachInvoice.fromMap(d.id, _plain(d.data())),
            ],
          );

  @override
  Future<void> confirmInvoiceManually({
    required String centerId,
    required CenterCoachInvoice invoice,
    required String method,
    required String proof,
    required String reason,
    required String actorUid,
    required String actorName,
  }) async {
    final center = _center(centerId);
    final invRef = center.collection('invoices').doc(invoice.id);
    final enrRef = invoice.enrollmentId.isEmpty
        ? null
        : center.collection('enrollments').doc(invoice.enrollmentId);
    final label = centerPaymentMethodLabel(method);
    final p = proof.trim(), r = reason.trim();
    try {
      await _db.runTransaction((t) async {
        final iSnap = await t.get(invRef);
        final eSnap = enrRef == null ? null : await t.get(enrRef);
        if (!iSnap.exists || iSnap.data()?['status'] != 'pending') {
          throw const CenterCoachException(
            'Esta cobrança não está mais pendente.',
          );
        }
        t.update(invRef, {
          'status': 'approved',
          'method': method,
          'approvedAt': FieldValue.serverTimestamp(),
          'events': FieldValue.arrayUnion([
            {
              'at': Timestamp.now(),
              'type': 'manual_confirm',
              'title': 'Confirmado manualmente',
              'detail': '$label · comprovante $p · $r',
              'byName': actorName,
            },
          ]),
        });
        if (enrRef != null &&
            (eSnap?.exists ?? false) &&
            eSnap!.data()?['status'] == 'pending') {
          t.update(enrRef, {'status': 'active', 'holdUntil': null});
        }
        t.set(center.collection('auditLogs').doc(), {
          'at': FieldValue.serverTimestamp(),
          'actorUid': actorUid,
          'actorName': actorName,
          'action': 'invoice.manual_confirm',
          'entity': 'invoice',
          'entityId': invoice.id,
          'detail':
              '${invoice.payerName} · ${formatBRLFromCents(invoice.amountCents)} '
              'aprovado manualmente ($label · $p)',
          'reason': r,
        });
      });
    } on CenterCoachException {
      rethrow;
    } on FirebaseException catch (e) {
      if (e.code == 'permission-denied') {
        throw const CenterCoachException(
          'Só o owner ou um admin do centro confirma pagamento.',
          revoked: true,
        );
      }
      throw const CenterCoachException(
        'Não foi possível confirmar o pagamento. Confira a conexão e tente '
        'de novo.',
      );
    }
  }

  @override
  Stream<List<CenterAuditEntry>> watchAuditLogs(
    String centerId, {
    int limit = 100,
  }) => _center(centerId)
      .collection('auditLogs')
      .orderBy('at', descending: true)
      .limit(limit)
      .snapshots()
      .map(
        (snap) => [
          for (final d in snap.docs)
            CenterAuditEntry.fromMap(d.id, _plain(d.data())),
        ],
      );

  @override
  Future<void> cancelSession({
    required String centerId,
    required CenterCoachSession session,
    required String reason,
    required List<String> creditStudentIds,
    required String actorUid,
    required String actorName,
  }) async {
    final d = session.date.split('-');
    final day = d.length == 3 ? '${d[2]}/${d[1]}' : session.date;
    // Lotes de até 450 escritas (o Firestore aceita 500 por lote).
    final ops = <void Function(WriteBatch)>[
      (b) {
        b.update(_center(centerId).collection('sessions').doc(session.id), {
          'status': 'cancelled',
          'changeReason': reason.trim(),
        });
        b.set(_center(centerId).collection('auditLogs').doc(), {
          'at': FieldValue.serverTimestamp(),
          'actorUid': actorUid,
          'actorName': actorName,
          'action': 'session.cancelled',
          'entity': 'session',
          'entityId': session.id,
          'detail':
              '${session.className} · $day ${session.startTime} cancelada'
              '${creditStudentIds.isEmpty ? '' : ' · +${creditStudentIds.length} reposições'}',
          'reason': reason.trim(),
        });
      },
      for (final id in creditStudentIds)
        (b) => b.update(_center(centerId).collection('students').doc(id), {
          'makeupCredits': FieldValue.increment(1),
        }),
    ];
    for (var i = 0; i < ops.length; i += 450) {
      final b = _db.batch();
      for (final op in ops.skip(i).take(450)) {
        op(b);
      }
      await _commit(b);
    }
  }

  @override
  Future<CenterCheckinResult> checkIn({
    required String centerId,
    String? qr,
    String? studentId,
    bool force = false,
  }) async {
    try {
      final r = await _functions
          .httpsCallable('checkInTrainingCenterStudent')
          .call<Object?>({
            'centerId': centerId,
            'qr': ?qr,
            'studentId': ?studentId,
            'force': force,
          });
      final data = r.data is Map
          ? (r.data as Map).map((k, v) => MapEntry('$k', v))
          : <String, Object?>{};
      return CenterCheckinResult.fromMap(data);
    } on FirebaseFunctionsException catch (e) {
      throw CenterCoachException(
        callableErrorMessage(
          e.code,
          e.message,
          'Não foi possível fazer o check-in. Tente de novo.',
        ),
        revoked: e.code == 'permission-denied',
      );
    }
  }

  @override
  Future<List<MakeupCandidate>> makeupCandidates(
    String centerId,
    String sessionId,
  ) async {
    try {
      final r = await _functions
          .httpsCallable('listTrainingCenterMakeupCandidates')
          .call<Object?>({'centerId': centerId, 'sessionId': sessionId});
      final raw = r.data is Map ? (r.data as Map)['candidates'] : null;
      return raw is List
          ? [
              for (final c in raw)
                if (c is Map)
                  MakeupCandidate(
                    id: '${c['id'] ?? ''}',
                    name: '${c['name'] ?? 'Aluno'}',
                    makeupCredits: c['makeupCredits'] is num
                        ? (c['makeupCredits'] as num).toInt()
                        : 0,
                  ),
            ]
          : const [];
    } on FirebaseFunctionsException catch (e) {
      throw CenterCoachException(
        callableErrorMessage(
          e.code,
          e.message,
          'Não foi possível buscar os alunos com reposição.',
        ),
        revoked: e.code == 'permission-denied',
      );
    }
  }

  Future<void> _commit(WriteBatch b) async {
    try {
      await b.commit();
    } on FirebaseException catch (e) {
      if (e.code == 'permission-denied') {
        throw const CenterCoachException(
          'Seu acesso a esta aula mudou. A chamada não foi salva.',
          revoked: true,
        );
      }
      throw const CenterCoachException(
        'Não foi possível salvar a chamada. Confira a conexão e tente de novo.',
      );
    }
  }

  static RollCallCounts _counts(Map<String, CenterMark> marks) {
    var p = 0, j = 0, f = 0;
    for (final m in marks.values) {
      switch (m) {
        case CenterMark.present:
          p++;
        case CenterMark.excused:
          j++;
        case CenterMark.absent:
          f++;
      }
    }
    return RollCallCounts(p, j, f, 0);
  }

  static List<CenterCoachSession> _sessions(
    QuerySnapshot<Map<String, dynamic>> snap,
  ) => [
    for (final d in snap.docs)
      CenterCoachSession.fromMap(d.id, _plain(d.data())),
  ];
}

/// `Timestamp` → `DateTime` em qualquer profundidade (o domínio não importa o
/// Firestore).
Map<String, Object?> _plain(Map<String, dynamic> m) =>
    m.map((k, v) => MapEntry(k, _plainValue(v)));

Object? _plainValue(Object? v) {
  if (v is Timestamp) return v.toDate();
  if (v is Map) return v.map((k, x) => MapEntry('$k', _plainValue(x)));
  if (v is List) return [for (final x in v) _plainValue(x)];
  return v;
}

final centerCoachRepositoryProvider = Provider<CenterCoachRepository>(
  (ref) => FirebaseCenterCoachRepository(ref.watch(firestoreProvider)),
);
