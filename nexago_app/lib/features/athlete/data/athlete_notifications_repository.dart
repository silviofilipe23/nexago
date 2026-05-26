import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/athlete_inbox_notification.dart';

class AthleteNotificationsRepository {
  AthleteNotificationsRepository(this._firestore);

  final FirebaseFirestore _firestore;

  static const _limit = 50;

  CollectionReference<Map<String, dynamic>> _notifications(String uid) {
    return _firestore.collection('users').doc(uid).collection('notifications');
  }

  Stream<List<AthleteInboxNotification>> watchInbox(String uid) {
    if (uid.isEmpty) return Stream.value(const []);

    return _notifications(uid)
        .orderBy('createdAt', descending: true)
        .limit(_limit)
        .snapshots()
        .map(
          (snap) => snap.docs
              .map(AthleteInboxNotification.fromFirestore)
              .toList(),
        );
  }

  Future<void> markRead(String uid, String notificationId) async {
    if (uid.isEmpty || notificationId.isEmpty) return;
    await _notifications(uid).doc(notificationId).update({
      'read': true,
      'readAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> markAllRead(String uid, List<AthleteInboxNotification> items) async {
    if (uid.isEmpty) return;
    final batch = _firestore.batch();
    var count = 0;
    for (final item in items) {
      if (!item.isUnread) continue;
      batch.update(_notifications(uid).doc(item.id), {
        'read': true,
        'readAt': FieldValue.serverTimestamp(),
      });
      count++;
      if (count >= 400) break;
    }
    if (count > 0) await batch.commit();
  }

  Future<void> dismiss(String uid, String notificationId) async {
    if (uid.isEmpty || notificationId.isEmpty) return;
    await _notifications(uid).doc(notificationId).update({
      'read': true,
      'dismissed': true,
      'readAt': FieldValue.serverTimestamp(),
    });
  }
}

final athleteNotificationsRepositoryProvider =
    Provider<AthleteNotificationsRepository>((ref) {
  return AthleteNotificationsRepository(FirebaseFirestore.instance);
});
