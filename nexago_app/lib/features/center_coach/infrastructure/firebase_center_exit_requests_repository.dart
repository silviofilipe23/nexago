import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/center_coach_repository.dart' show CenterCoachException;
import '../domain/center_exit_requests.dart';

/// Pedidos de trancar/pausa por lesão/cancelar no Firebase: leitura direta
/// de `trainingCenters/{c}/enrollmentRequests` (rule: `view_enrollments`),
/// decisão pela callable `decideTrainingCenterEnrollmentRequest` e o
/// atestado pelo Storage (só owner/admin lê).
class FirebaseCenterExitRequestsRepository
    implements CenterExitRequestsRepository {
  FirebaseCenterExitRequestsRepository(
    this._db, {
    FirebaseFunctions? functions,
    FirebaseStorage? storage,
  })  : _functions = functions ?? nexagoFunctions,
        _storageOverride = storage;

  final FirebaseFirestore _db;
  final FirebaseFunctions _functions;
  final FirebaseStorage? _storageOverride;

  FirebaseStorage get _storage => _storageOverride ?? FirebaseStorage.instance;

  @override
  Stream<List<CenterExitRequest>> watch(String centerId) => _db
      .collection('trainingCenters')
      .doc(centerId)
      .collection('enrollmentRequests')
      .orderBy('createdAt', descending: true)
      .limit(120)
      .snapshots()
      .map(
        (snap) => [
          for (final d in snap.docs)
            CenterExitRequest.fromMap(d.id, _plain(d.data())),
        ],
      );

  @override
  Future<String> decide({
    required String centerId,
    required String requestId,
    required String decision,
    String note = '',
  }) async {
    try {
      final r = await _functions
          .httpsCallable('decideTrainingCenterEnrollmentRequest')
          .call<Object?>({
        'centerId': centerId,
        'requestId': requestId,
        'decision': decision,
        'note': note.trim(),
      });
      final d = r.data is Map ? r.data as Map : const {};
      return d['status'] is String ? d['status'] as String : '';
    } on FirebaseFunctionsException catch (e) {
      throw CenterCoachException(
        callableErrorMessage(
          e.code,
          e.message,
          'Não foi possível registrar a decisão. Tente de novo.',
        ),
      );
    }
  }

  @override
  Future<String> certificateUrl(String path) async {
    try {
      return await _storage.ref(path).getDownloadURL();
    } on FirebaseException catch (e) {
      throw CenterCoachException(
        e.code == 'unauthorized' || e.code == 'permission-denied'
            ? 'Só owner ou admin do centro vê o atestado.'
            : 'Não foi possível abrir o atestado agora.',
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

final centerExitRequestsRepositoryProvider =
    Provider<CenterExitRequestsRepository>(
  (ref) => FirebaseCenterExitRequestsRepository(ref.watch(firestoreProvider)),
);
