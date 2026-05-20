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

  bool get isExpired => DateTime.now().isAfter(expiresAt);
  bool get isAccepted => status == 'accepted';
  bool get isPending => status == 'pending';

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
