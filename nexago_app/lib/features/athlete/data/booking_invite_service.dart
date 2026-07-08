import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/booking_invite_model.dart';
import '../domain/booking_invite_status.dart';

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
    final invite = BookingInvite.fromFirestore(snap);
    if (invite.bookingId.isEmpty) return invite;

    // O documento do convite guarda uma cópia da reserva feita na criação;
    // relê o status ATUAL para detectar cancelamentos posteriores (o convite
    // sozinho não sabe disso).
    final bookingSnap =
        await _db.collection('arenaBookings').doc(invite.bookingId).get();
    return invite.copyWith(
      bookingExists: bookingSnap.exists,
      bookingStatus: bookingSnap.data()?['status'] as String?,
    );
  }

  Future<void> acceptInvite(
    String inviteId, {
    required String acceptedByUid,
    String? acceptedByName,
  }) async {
    final uid = acceptedByUid.trim();
    if (uid.isEmpty) {
      throw Exception('Faça login para aceitar o convite.');
    }

    // Transação: relê convite + reserva e valida ANTES de escrever, tudo
    // atomicamente. Sem isso, duas pessoas aceitando o mesmo convite quase
    // ao mesmo tempo conseguiam as duas "ganhar" (dupla contagem de
    // confirmedParticipants e condição de corrida no guestAthleteId).
    await _db.runTransaction((tx) async {
      final inviteRef = _db.collection(_collection).doc(inviteId);
      final inviteSnap = await tx.get(inviteRef);
      if (!inviteSnap.exists) {
        throw Exception('Convite não encontrado ou expirado.');
      }
      final invite = inviteSnap.data() ?? {};
      final bookingId = (invite['bookingId'] as String?)?.trim() ?? '';
      final status = (invite['status'] as String?) ?? 'pending';
      final expiresAt = (invite['expiresAt'] as Timestamp?)?.toDate();

      DocumentSnapshot<Map<String, dynamic>>? bookingSnap;
      if (bookingId.isNotEmpty) {
        bookingSnap =
            await tx.get(_db.collection('arenaBookings').doc(bookingId));
      }

      final blockedReason = resolveBookingInviteBlockedReason(
        inviteStatus: status,
        inviteExpired:
            expiresAt != null && DateTime.now().isAfter(expiresAt),
        bookingExists: bookingSnap?.exists ?? false,
        bookingStatus: bookingSnap?.data()?['status'] as String?,
      );
      if (blockedReason != null) {
        throw Exception(blockedReason);
      }

      tx.update(inviteRef, {
        'status': 'accepted',
        'acceptedByUid': uid,
        if (acceptedByName != null && acceptedByName.trim().isNotEmpty)
          'acceptedByName': acceptedByName.trim(),
        'acceptedAt': FieldValue.serverTimestamp(),
      });

      if (bookingId.isEmpty || bookingSnap == null || !bookingSnap.exists) {
        return;
      }
      final booking = bookingSnap.data() ?? {};
      final ownerId =
          ((booking['athleteId'] ?? booking['bookingAthleteId']) as String?)
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

      tx.set(
        _db.collection('arenaBookings').doc(bookingId),
        updates,
        SetOptions(merge: true),
      );
    });
  }
}
