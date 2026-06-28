import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/athlete_inbox_notification.dart';

class AthleteNotificationsRepository {
  AthleteNotificationsRepository(this._firestore);

  final FirebaseFirestore _firestore;

  /// Teto do inbox transmitido ao vivo. As notificações relevantes (não-lidas)
  /// são sempre recentes; o histórico antigo não precisa ser streamado.
  static const int inboxStreamLimit = 50;

  CollectionReference<Map<String, dynamic>> _notifications(String uid) {
    return _firestore.collection('users').doc(uid).collection('notifications');
  }

  Stream<List<AthleteInboxNotification>> watchInbox(String uid) {
    if (uid.isEmpty) return Stream.value(const []);

    return _notifications(uid)
        .orderBy('createdAt', descending: true)
        .limit(inboxStreamLimit)
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
    final unread = items.where((item) => item.isUnread).toList();
    if (unread.isEmpty) return;

    const batchSize = 400;
    for (var i = 0; i < unread.length; i += batchSize) {
      final batch = _firestore.batch();
      final chunk = unread.skip(i).take(batchSize);
      for (final item in chunk) {
        batch.update(_notifications(uid).doc(item.id), {
          'read': true,
          'readAt': FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }
  }

  Future<void> dismiss(String uid, String notificationId) async {
    if (uid.isEmpty || notificationId.isEmpty) return;
    await _notifications(uid).doc(notificationId).update({
      'read': true,
      'dismissed': true,
      'readAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> recordPartnerInviteResponse({
    required String uid,
    required String inviteId,
    required String inviteResponse,
  }) async {
    if (uid.isEmpty || inviteId.isEmpty || inviteResponse.isEmpty) return;

    final snap = await _notifications(uid)
        .where('data.inviteId', isEqualTo: inviteId)
        .get();

    if (snap.docs.isEmpty) return;

    final batch = _firestore.batch();
    var pending = 0;
    for (final doc in snap.docs) {
      final type = doc.data()['type'] as String? ?? '';
      if (type != 'tournament_partner_invite') continue;
      batch.update(doc.reference, {
        'data.inviteResponse': inviteResponse,
        'read': true,
        'readAt': FieldValue.serverTimestamp(),
      });
      pending++;
    }
    if (pending > 0) {
      await batch.commit();
    }
  }
}

final athleteNotificationsRepositoryProvider =
    Provider<AthleteNotificationsRepository>((ref) {
  return AthleteNotificationsRepository(FirebaseFirestore.instance);
});
