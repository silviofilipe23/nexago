import 'package:cloud_firestore/cloud_firestore.dart';

/// Convite para jogar numa reserva (`bookingInvites/{id}`).
///
/// Dois formatos, ambos gravados só pelas callables de
/// `functions/src/arena-booking-invite.ts`:
/// - `{bookingId}_{uid}`: convite de UM atleta (direto, ou a entrada dele
///   pelo link) — `inviteeUid` preenchido;
/// - `link_{bookingId}`: link multiuso (`kind: 'link'`, `status: 'open'`,
///   sem `inviteeUid`), vale até a quadra lotar.
///
/// Docs antigos (app 1.0.1) não têm `kind` nem `inviteeUid`.
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
    this.kind = 'direct',
    this.inviteeUid,
    this.inviteeName,
    this.inviteeAvatarUrl,
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

  /// `pending` | `accepted` | `declined` | `canceled` | `left` | `removed`;
  /// `open` no link multiuso.
  final String status;
  final DateTime createdAt;

  /// Fim do horário da reserva (convites novos) ou criação + 48h (legado).
  final DateTime expiresAt;

  /// `direct` | `link` — canal do último convite/entrada.
  final String kind;
  final String? inviteeUid;
  final String? inviteeName;
  final String? inviteeAvatarUrl;

  /// Estado ATUAL (lido no momento do fetch) da reserva referenciada por
  /// [bookingId] — os demais campos acima são a cópia feita no momento em
  /// que o convite foi criado e não refletem cancelamentos posteriores.
  final bool bookingExists;
  final String? bookingStatus;

  bool get isExpired => DateTime.now().isAfter(expiresAt);
  bool get isAccepted => status == 'accepted';
  bool get isPending => status == 'pending';

  /// Link multiuso da reserva (não é de um atleta específico).
  bool get isShareLink =>
      kind == 'link' && (inviteeUid == null || inviteeUid!.isEmpty);

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
      kind: kind,
      inviteeUid: inviteeUid,
      inviteeName: inviteeName,
      inviteeAvatarUrl: inviteeAvatarUrl,
      bookingExists: bookingExists ?? this.bookingExists,
      bookingStatus: bookingStatus ?? this.bookingStatus,
    );
  }

  factory BookingInvite.fromFirestore(
      DocumentSnapshot<Map<String, dynamic>> snap) {
    return BookingInvite.fromMap(snap.id, snap.data() ?? const {});
  }

  factory BookingInvite.fromMap(String id, Map<String, dynamic> d) {
    final createdAt =
        (d['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now();
    return BookingInvite(
      id: id,
      bookingId: _text(d['bookingId']) ?? '',
      arenaId: _text(d['arenaId']) ?? '',
      arenaName: _text(d['arenaName']) ?? '',
      courtName: _text(d['courtName']) ?? '',
      courtId: _text(d['courtId']),
      date: _text(d['date']) ?? '',
      startTime: _text(d['startTime']) ?? '',
      endTime: _text(d['endTime']) ?? '',
      invitedByUid: _text(d['invitedByUid']) ?? '',
      invitedByName: _text(d['invitedByName']) ?? '',
      status: _text(d['status']) ?? 'pending',
      createdAt: createdAt,
      expiresAt: (d['expiresAt'] as Timestamp?)?.toDate() ??
          createdAt.add(const Duration(hours: 48)),
      kind: _text(d['kind']) ?? 'direct',
      inviteeUid: _text(d['inviteeUid']),
      inviteeName: _text(d['inviteeName']),
      inviteeAvatarUrl: _text(d['inviteeAvatarUrl']),
    );
  }
}

String? _text(Object? value) {
  if (value is! String) return null;
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}
