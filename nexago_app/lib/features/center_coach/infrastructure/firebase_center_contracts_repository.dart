import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/center_coach_repository.dart' show CenterCoachException;
import '../domain/center_contracts.dart';

/// Contratos do aluno no Firebase: leitura direta de
/// `trainingCenters/{c}/contracts` (rule: `enroll_students`) e o lembrete pela
/// callable `remindTrainingCenterContract`.
class FirebaseCenterContractsRepository implements CenterContractsRepository {
  FirebaseCenterContractsRepository(this._db, {FirebaseFunctions? functions})
      : _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _db;
  final FirebaseFunctions _functions;

  @override
  Stream<List<CenterStudentContract>> watchStudentContracts(
    String centerId,
    String studentId,
  ) =>
      _db
          .collection('trainingCenters')
          .doc(centerId)
          .collection('contracts')
          .where('studentId', isEqualTo: studentId)
          .snapshots()
          .map(
            (snap) => [
              for (final d in snap.docs)
                CenterStudentContract.fromMap(d.id, _plain(d.data())),
            ],
          );

  @override
  Future<int> remind({
    required String centerId,
    required String contractId,
  }) async {
    try {
      final r = await _functions
          .httpsCallable('remindTrainingCenterContract')
          .call<Object?>({'centerId': centerId, 'contractId': contractId});
      final d = r.data is Map ? r.data as Map : const {};
      final n = d['reminderCount'];
      return n is num ? n.toInt() : 0;
    } on FirebaseFunctionsException catch (e) {
      throw CenterCoachException(
        callableErrorMessage(
          e.code,
          e.message,
          'Não foi possível reenviar o lembrete agora. Tente de novo.',
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

final centerContractsRepositoryProvider = Provider<CenterContractsRepository>(
  (ref) => FirebaseCenterContractsRepository(ref.watch(firestoreProvider)),
);
