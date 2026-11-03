import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../domain/athlete_plus_waitlist.dart';

/// Lista de espera do nexaGO+ direto no Firestore: a rule de
/// `athletePlusWaitlist/{uid}` só aceita o create do próprio atleta, com os
/// campos e valores da folha — não há Cloud Function no caminho.
class FirebaseAthletePlusRepository implements AthletePlusRepository {
  FirebaseAthletePlusRepository(this._db);

  final FirebaseFirestore _db;

  DocumentReference<Map<String, dynamic>> _entry(String uid) =>
      _db.collection('athletePlusWaitlist').doc(uid);

  @override
  Stream<bool> watchWaitlistEnabled() => _db
      .doc('appConfig/athletePlus')
      .snapshots()
      .map((snap) => snap.data()?['waitlistEnabled'] == true);

  @override
  Stream<AthletePlusWaitlistEntry?> watchMyEntry(String uid) =>
      _entry(uid).snapshots().map((snap) {
        final data = snap.data();
        return data == null ? null : AthletePlusWaitlistEntry.fromMap(data);
      });

  Future<void> _create(String uid, Map<String, Object?> fields) =>
      _entry(uid).set({
        ...fields,
        'source': kAthletePlusSourceHome,
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });

  @override
  Future<void> join({
    required String uid,
    required Set<AthletePlusInterest> interests,
    AthletePlusPriceBand? priceBand,
  }) =>
      _create(uid, {
        'status': AthletePlusWaitlistStatus.joined.name,
        'interests': [for (final i in interests) i.key],
        if (priceBand != null) 'priceBand': priceBand.key,
      });

  @override
  Future<void> dismiss(String uid) => _create(uid, {
        'status': AthletePlusWaitlistStatus.dismissed.name,
        'interests': const <String>[],
      });
}

final athletePlusRepositoryProvider = Provider<AthletePlusRepository>(
  (ref) => FirebaseAthletePlusRepository(ref.watch(firestoreProvider)),
);
