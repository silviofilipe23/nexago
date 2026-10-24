import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/center_coach_repository.dart' show CenterCoachException;
import '../domain/center_leads.dart';
import '../domain/center_leads_repository.dart';
import '../domain/center_management_repository.dart' show CenterActor;

/// Captação no Firebase: `trainingCenters/{c}/leads` direto (as rules
/// bloqueiam `trial`, `coachFeedback` e `trialsCount`, que são do servidor) e
/// as callables da experimental (`training-center-leads.ts`).
class FirebaseCenterLeadsRepository implements CenterLeadsRepository {
  FirebaseCenterLeadsRepository(this._db, {FirebaseFunctions? functions})
      : _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _db;
  final FirebaseFunctions _functions;

  static const int kLeadsLimit = 300;

  DocumentReference<Map<String, dynamic>> _center(String id) =>
      _db.collection('trainingCenters').doc(id);

  Map<String, Object?> _history(CenterActor actor, String kind, String text) =>
      {
        // `serverTimestamp` não vale dentro de array.
        'at': Timestamp.now(),
        'byName': actor.name,
        'kind': kind,
        'text': text,
      };

  Future<T> _write<T>(Future<T> Function() run, String fallback) async {
    try {
      return await run();
    } on FirebaseException catch (e) {
      throw CenterCoachException(
        e.code == 'permission-denied'
            ? 'Seu acesso a esta ação mudou. Nada foi salvo.'
            : fallback,
        revoked: e.code == 'permission-denied',
      );
    }
  }

  Future<T> _call<T>(
    String name,
    Map<String, Object?> data,
    T Function(Map<Object?, Object?> d) read,
    String fallback,
  ) async {
    try {
      final r = await _functions.httpsCallable(name).call<Object?>(data);
      return read(r.data is Map ? r.data as Map : const {});
    } on FirebaseFunctionsException catch (e) {
      throw CenterCoachException(
        callableErrorMessage(e.code, e.message, fallback),
      );
    }
  }

  @override
  Stream<List<CenterLead>> watchLeads(String centerId) => _center(centerId)
      .collection('leads')
      .orderBy('updatedAt', descending: true)
      .limit(kLeadsLimit)
      .snapshots()
      .map(
        (snap) => [
          for (final d in snap.docs) CenterLead.fromMap(d.id, _plain(d.data())),
        ],
      );

  @override
  Stream<CenterLeadSettings> watchSettings(String centerId) =>
      _center(centerId).collection('settings').doc('leads').snapshots().map(
            (d) => CenterLeadSettings.fromMap(
              d.exists ? _plain(d.data()!) : null,
            ),
          );

  @override
  Future<String> createLead({
    required String centerId,
    required CenterNewLeadInput input,
    required CenterActor actor,
  }) =>
      _write(() async {
        final ref = _center(centerId).collection('leads').doc();
        final b = _db.batch();
        b.set(ref, {
          ...centerNewLeadFields(
            input,
            actorUid: actor.uid,
            actorName: actor.name,
          ),
          'history': [_history(actor, 'created', 'Cadastro no balcão')],
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        });
        b.set(_center(centerId).collection('auditLogs').doc(), {
          'at': FieldValue.serverTimestamp(),
          'actorUid': actor.uid,
          'actorName': actor.name,
          'action': 'lead.created',
          'entity': 'lead',
          'entityId': ref.id,
          'detail': input.name.trim(),
          'reason': '',
        });
        await b.commit();
        return ref.id;
      }, 'Não foi possível salvar o interessado. Tente de novo.');

  @override
  Future<void> setStage({
    required String centerId,
    required CenterLead lead,
    required String stage,
    String? lostReason,
    required CenterActor actor,
  }) =>
      _write(() async {
        await _center(centerId).collection('leads').doc(lead.id).update({
          'stage': stage,
          'lostReason': stage == 'lost' ? (lostReason ?? 'other') : null,
          'updatedAt': FieldValue.serverTimestamp(),
          if (lead.stage == 'new' && lead.firstContactAt == null)
            'firstContactAt': FieldValue.serverTimestamp(),
          'history': FieldValue.arrayUnion([
            _history(
              actor,
              stage == 'lost' ? 'lost' : 'stage',
              centerLeadStageHistoryText(stage, lostReason: lostReason),
            ),
          ]),
        });
      }, 'Não foi possível atualizar o interessado. Tente de novo.');

  @override
  Future<String> scheduleTrial({
    required String centerId,
    required String leadId,
    required String sessionId,
  }) =>
      _call(
        'scheduleTrainingCenterLeadTrial',
        {'centerId': centerId, 'leadId': leadId, 'sessionId': sessionId},
        (d) => '${d['bookingId'] ?? ''}',
        'Não foi possível agendar a experimental. Tente de novo.',
      );

  @override
  Future<void> evaluateTrial({
    required String centerId,
    required String bookingId,
    required bool attended,
    String? level,
    String? classId,
    String note = '',
  }) =>
      _call(
        'evaluateTrainingCenterTrial',
        {
          'centerId': centerId,
          'bookingId': bookingId,
          'attended': attended,
          if (attended && level != null && level.isNotEmpty) 'level': level,
          if (attended && classId != null && classId.isNotEmpty)
            'classId': classId,
          if (note.trim().isNotEmpty) 'note': note.trim(),
        },
        (_) {},
        'Não foi possível enviar a avaliação. Tente de novo.',
      );
}

Map<String, Object?> _plain(Map<String, dynamic> m) =>
    m.map((k, v) => MapEntry(k, _plainValue(v)));

Object? _plainValue(Object? v) {
  if (v is Timestamp) return v.toDate();
  if (v is Map) return v.map((k, x) => MapEntry('$k', _plainValue(x)));
  if (v is List) return [for (final x in v) _plainValue(x)];
  return v;
}

final centerLeadsRepositoryProvider = Provider<CenterLeadsRepository>(
  (ref) => FirebaseCenterLeadsRepository(ref.watch(firestoreProvider)),
);
