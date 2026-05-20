import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/booking_invite_model.dart';

class BookingInviteService {
  const BookingInviteService(this._db);

  final FirebaseFirestore _db;

  static const _inviteTtl = Duration(hours: 48);
  static const _collection = 'bookingInvites';

  Future<BookingInvite> createInvite({
    required String bookingId,
    required String invitedByUid,
    required String invitedByName,
  }) async {
    final bookingSnap = await _db.collection('arenaBookings').doc(bookingId).get();
    if (!bookingSnap.exists) throw Exception('Reserva não encontrada');
    final b = bookingSnap.data()!;

    final now = DateTime.now();
    final expiresAt = now.add(_inviteTtl);
    final ref = _db.collection(_collection).doc();

    await ref.set({
      'bookingId': bookingId,
      'arenaId': b['arenaId'] ?? '',
      'arenaName': b['arenaName'] ?? '',
      'courtName': b['courtName'] ?? '',
      'courtId': b['courtId'],
      'date': b['date'] ?? '',
      'startTime': b['startTime'] ?? '',
      'endTime': b['endTime'] ?? '',
      'invitedByUid': invitedByUid,
      'invitedByName': invitedByName,
      'status': 'pending',
      'createdAt': FieldValue.serverTimestamp(),
      'expiresAt': Timestamp.fromDate(expiresAt),
    });

    return BookingInvite(
      id: ref.id,
      bookingId: bookingId,
      arenaId: b['arenaId'] as String? ?? '',
      arenaName: b['arenaName'] as String? ?? '',
      courtName: b['courtName'] as String? ?? '',
      courtId: b['courtId'] as String?,
      date: b['date'] as String? ?? '',
      startTime: b['startTime'] as String? ?? '',
      endTime: b['endTime'] as String? ?? '',
      invitedByUid: invitedByUid,
      invitedByName: invitedByName,
      status: 'pending',
      createdAt: now,
      expiresAt: expiresAt,
    );
  }

  Future<BookingInvite?> fetchInvite(String inviteId) async {
    final snap = await _db.collection(_collection).doc(inviteId).get();
    if (!snap.exists) return null;
    return BookingInvite.fromFirestore(snap);
  }

  Future<void> acceptInvite(String inviteId) async {
    await _db.collection(_collection).doc(inviteId).update({
      'status': 'accepted',
      'acceptedAt': FieldValue.serverTimestamp(),
    });
  }
}
