import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/slot_vacancy_alert.dart';

class SlotVacancyAlertService {
  SlotVacancyAlertService(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> _alertsRef(String userId) {
    return _firestore
        .collection('users')
        .doc(userId.trim())
        .collection('slotVacancyAlerts');
  }

  Stream<bool> watchIsSubscribed({
    required String userId,
    required SlotVacancyAlertKey key,
  }) {
    final uid = userId.trim();
    if (uid.isEmpty) return Stream.value(false);
    return _alertsRef(uid).doc(key.documentId).snapshots().map((snap) {
      if (!snap.exists) return false;
      final data = snap.data();
      if (data == null) return false;
      return data['active'] as bool? ?? true;
    });
  }

  Future<void> subscribe({
    required String userId,
    required SlotVacancyAlertKey key,
    String? arenaName,
    String? courtName,
  }) async {
    final uid = userId.trim();
    if (uid.isEmpty) return;
    final alert = SlotVacancyAlert(
      id: key.documentId,
      arenaId: key.arenaId,
      courtId: key.courtId,
      dateKey: key.dateKey,
      arenaName: arenaName,
      courtName: courtName,
      active: true,
    );
    await _alertsRef(uid).doc(key.documentId).set(
          alert.toFirestore(),
          SetOptions(merge: true),
        );
  }

  Future<void> unsubscribe({
    required String userId,
    required SlotVacancyAlertKey key,
  }) async {
    final uid = userId.trim();
    if (uid.isEmpty) return;
    await _alertsRef(uid).doc(key.documentId).delete();
  }
}
