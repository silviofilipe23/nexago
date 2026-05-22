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

  Future<void> acceptInvite(
    String inviteId, {
    required String acceptedByUid,
    String? acceptedByName,
  }) async {
    final inviteRef = _db.collection(_collection).doc(inviteId);
    final inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists) {
      throw Exception('Convite não encontrado');
    }
    final invite = inviteSnap.data() ?? {};
    final bookingId = (invite['bookingId'] as String?)?.trim() ?? '';
    final uid = acceptedByUid.trim();
    if (uid.isEmpty) {
      throw Exception('Faça login para aceitar o convite.');
    }

    await inviteRef.update({
      'status': 'accepted',
      'acceptedByUid': uid,
      if (acceptedByName != null && acceptedByName.trim().isNotEmpty)
        'acceptedByName': acceptedByName.trim(),
      'acceptedAt': FieldValue.serverTimestamp(),
    });

    if (bookingId.isEmpty) return;

    final bookingRef = _db.collection('arenaBookings').doc(bookingId);
    final bookingSnap = await bookingRef.get();
    if (!bookingSnap.exists) return;
    final booking = bookingSnap.data() ?? {};

    final ownerId = ((booking['athleteId'] ?? booking['bookingAthleteId']) as String?)
            ?.trim() ??
        '';
    if (ownerId == uid) return;

    final updates = <String, dynamic>{
      'confirmedParticipants': FieldValue.increment(1),
      'guestAthleteId': uid,
      if (acceptedByName != null && acceptedByName.trim().isNotEmpty)
        'guestAthleteName': acceptedByName.trim(),
    };

    final existingGuest = (booking['guestAthleteId'] as String?)?.trim();
    if (existingGuest != null &&
        existingGuest.isNotEmpty &&
        existingGuest != uid) {
      updates.remove('guestAthleteId');
      updates.remove('guestAthleteName');
    }

    await bookingRef.set(updates, SetOptions(merge: true));
  }
}
