import 'package:cloud_firestore/cloud_firestore.dart';

class BookingInvite {
  const BookingInvite({
    required this.id,
    required this.bookingId,
    required this.arenaId,
    required this.arenaName,
    required this.courtName,
    this.courtId,
    required this.date,
    required this.startTime,
    required this.endTime,
    required this.invitedByUid,
    required this.invitedByName,
    required this.status,
    required this.createdAt,
    required this.expiresAt,
    this.bookingExists = true,
    this.bookingStatus,
  });

  final String id;
  final String bookingId;
  final String arenaId;
  final String arenaName;
  final String courtName;
  final String? courtId;
  final String date;
  final String startTime;
  final String endTime;
  final String invitedByUid;
  final String invitedByName;
  final String status;
  final DateTime createdAt;
  final DateTime expiresAt;

  /// Estado ATUAL (lido no momento do fetch) da reserva referenciada por
  /// [bookingId] — os demais campos acima são a cópia feita no momento em
  /// que o convite foi criado e não refletem cancelamentos posteriores.
  final bool bookingExists;
  final String? bookingStatus;

  bool get isExpired => DateTime.now().isAfter(expiresAt);
  bool get isAccepted => status == 'accepted';
  bool get isPending => status == 'pending';

  BookingInvite copyWith({bool? bookingExists, String? bookingStatus}) {
    return BookingInvite(
      id: id,
      bookingId: bookingId,
      arenaId: arenaId,
      arenaName: arenaName,
      courtName: courtName,
      courtId: courtId,
      date: date,
      startTime: startTime,
      endTime: endTime,
      invitedByUid: invitedByUid,
      invitedByName: invitedByName,
      status: status,
      createdAt: createdAt,
      expiresAt: expiresAt,
      bookingExists: bookingExists ?? this.bookingExists,
      bookingStatus: bookingStatus ?? this.bookingStatus,
    );
  }

  factory BookingInvite.fromFirestore(DocumentSnapshot<Map<String, dynamic>> snap) {
    final d = snap.data()!;
    return BookingInvite(
      id: snap.id,
      bookingId: d['bookingId'] as String? ?? '',
      arenaId: d['arenaId'] as String? ?? '',
      arenaName: d['arenaName'] as String? ?? '',
      courtName: d['courtName'] as String? ?? '',
      courtId: d['courtId'] as String?,
      date: d['date'] as String? ?? '',
      startTime: d['startTime'] as String? ?? '',
      endTime: d['endTime'] as String? ?? '',
      invitedByUid: d['invitedByUid'] as String? ?? '',
      invitedByName: d['invitedByName'] as String? ?? '',
      status: d['status'] as String? ?? 'pending',
      createdAt: (d['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      expiresAt: (d['expiresAt'] as Timestamp?)?.toDate() ??
          DateTime.now().add(const Duration(hours: 48)),
    );
  }
}
