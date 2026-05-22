import 'package:cloud_firestore/cloud_firestore.dart';

import 'my_booking_confirmed_athlete.dart';
import 'my_booking_payment.dart';

/// Linha de `arenaBookings` para a lista “Minhas reservas”.
class MyBookingItem {
  const MyBookingItem({
    required this.id,
    this.arenaId,
    this.ownerAthleteId,
    required this.arenaName,
    this.courtName,
    this.coverUrl,
    this.logoUrl,
    required this.dateRaw,
    required this.startTime,
    required this.endTime,
    required this.rawStatus,
    this.amountReais,
    this.paymentType,
    required this.paymentDisplay,
    this.createdAt,
    this.attendanceConfirmed = false,
    this.attendanceStatus = 'pending',
    this.attendanceConfirmedAt,
    this.confirmationDeadline,
    this.confirmedParticipants = 1,
    this.confirmedAthletes = const [],
  });

  final String id;
  final String? arenaId;
  final String? ownerAthleteId;
  final String arenaName;
  final String? courtName;
  final String? coverUrl;
  final String? logoUrl;
  /// `YYYY-MM-DD` quando disponível.
  final String dateRaw;
  final String startTime;
  final String endTime;
  final String rawStatus;
  final double? amountReais;
  final String? paymentType;
  final MyBookingPaymentDisplay paymentDisplay;
  final DateTime? createdAt;
  final bool attendanceConfirmed;
  final String attendanceStatus;
  final DateTime? attendanceConfirmedAt;
  final DateTime? confirmationDeadline;

  /// Total de atletas com presença confirmada (inclui o dono da reserva).
  final int confirmedParticipants;

  /// Parceiros / convidados confirmados quando disponível no documento.
  final List<MyBookingConfirmedAthlete> confirmedAthletes;

  factory MyBookingItem.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    final dateVal = data['date'];
    String dateRaw = '';
    if (dateVal is String) {
      dateRaw = dateVal.length >= 10 ? dateVal.substring(0, 10) : dateVal.trim();
    } else if (dateVal is Timestamp) {
      final d = dateVal.toDate();
      dateRaw =
          '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    }

    final start = _timeStr(data['startTime']);
    final end = _timeStr(data['endTime']);
    final statusRaw = data['status'];
    final status = statusRaw is String && statusRaw.trim().isNotEmpty
        ? statusRaw.trim()
        : 'active';

    final created = data['createdAt'];
    DateTime? createdAt;
    if (created is Timestamp) {
      createdAt = created.toDate();
    }

    final amountReais = (data['amountReais'] as num?)?.toDouble() ??
        (data['priceReais'] as num?)?.toDouble();
    final paymentTypeRaw = data['paymentType'] ?? data['paymentMethod'];
    final paymentType = paymentTypeRaw is String && paymentTypeRaw.trim().isNotEmpty
        ? paymentTypeRaw.trim()
        : null;

    final arena = data['arenaName'] ?? data['arena'];
    final arenaName = arena is String && arena.trim().isNotEmpty ? arena.trim() : 'Arena';
    final courtRaw = data['courtName'] ?? data['court'];
    final courtName =
        courtRaw is String && courtRaw.trim().isNotEmpty ? courtRaw.trim() : null;

    String? pickUrl(dynamic v) {
      if (v is! String) return null;
      final t = v.trim();
      return t.isEmpty ? null : t;
    }

    final arenaIdRaw = data['arenaId'];
    final arenaId =
        arenaIdRaw is String && arenaIdRaw.trim().isNotEmpty ? arenaIdRaw.trim() : null;

    final ownerRaw = data['athleteId'] ?? data['bookingAthleteId'];
    final ownerAthleteId =
        ownerRaw is String && ownerRaw.trim().isNotEmpty ? ownerRaw.trim() : null;

    final confirmedAthletes = parseConfirmedAthletesFromBooking(data);
    final participantsRaw = (data['confirmedParticipants'] as num?)?.toInt() ??
        (data['participantsConfirmedCount'] as num?)?.toInt();
    final confirmedParticipants = participantsRaw != null && participantsRaw > 0
        ? participantsRaw
        : (confirmedAthletes.isNotEmpty ? confirmedAthletes.length + 1 : 1);

    return MyBookingItem(
      id: doc.id,
      arenaId: arenaId,
      ownerAthleteId: ownerAthleteId,
      arenaName: arenaName,
      courtName: courtName,
      coverUrl: pickUrl(data['coverUrl']) ?? pickUrl(data['arenaCoverUrl']) ?? pickUrl(data['coverImageUrl']),
      logoUrl: pickUrl(data['logoUrl']) ?? pickUrl(data['arenaLogoUrl']) ?? pickUrl(data['logoImageUrl']),
      dateRaw: dateRaw,
      startTime: start,
      endTime: end,
      rawStatus: status,
      amountReais: amountReais,
      paymentType: paymentType,
      paymentDisplay: myBookingPaymentDisplayFromData(data),
      createdAt: createdAt,
      attendanceConfirmed: data['attendanceConfirmed'] == true,
      attendanceStatus: ((data['attendanceStatus'] as String?)?.trim().isNotEmpty ?? false)
          ? (data['attendanceStatus'] as String).trim()
          : 'pending',
      attendanceConfirmedAt: (data['attendanceConfirmedAt'] as Timestamp?)?.toDate(),
      confirmationDeadline: (data['confirmationDeadline'] as Timestamp?)?.toDate(),
      confirmedParticipants: confirmedParticipants,
      confirmedAthletes: confirmedAthletes,
    );
  }

  /// Extrai convidados/parceiros confirmados de campos conhecidos em `arenaBookings`.
  static List<MyBookingConfirmedAthlete> parseConfirmedAthletesFromBooking(
    Map<String, dynamic> data,
  ) {
    final out = <MyBookingConfirmedAthlete>[];
    final seen = <String>{};

    void add({
      String? userId,
      String? name,
      String? avatarUrl,
    }) {
      final uid = userId?.trim();
      final label = name?.trim() ?? '';
      if (uid != null && uid.isNotEmpty) {
        if (seen.contains('uid:$uid')) return;
        seen.add('uid:$uid');
        out.add(
          MyBookingConfirmedAthlete(
            userId: uid,
            displayName: label.isEmpty ? null : label,
            avatarUrl: avatarUrl,
          ),
        );
        return;
      }
      if (label.isNotEmpty) {
        final key = 'name:$label';
        if (seen.contains(key)) return;
        seen.add(key);
        out.add(
          MyBookingConfirmedAthlete(
            displayName: label,
            avatarUrl: avatarUrl,
          ),
        );
      }
    }

    for (final key in [
      'confirmedAthletes',
      'participants',
      'attendees',
      'guests',
      'players',
    ]) {
      final raw = data[key];
      if (raw is! List) continue;
      for (final entry in raw) {
        if (entry is Map) {
          add(
            userId: _pickString(entry['userId']) ??
                _pickString(entry['uid']) ??
                _pickString(entry['athleteId']),
            name: _pickString(entry['name']) ??
                _pickString(entry['displayName']) ??
                _pickString(entry['fullName']) ??
                _pickString(entry['nickname']),
            avatarUrl: _pickString(entry['avatarUrl']) ??
                _pickString(entry['photoUrl']) ??
                _pickString(entry['profilePhotoUrl']),
          );
        } else if (entry is String) {
          final t = entry.trim();
          if (t.contains(' ')) {
            add(name: t);
          } else if (t.isNotEmpty) {
            add(userId: t);
          }
        }
      }
    }

    const guestPairs = <(String idKey, String nameKey)>[
      ('guestAthleteId', 'guestAthleteName'),
      ('guestUserId', 'guestName'),
      ('partnerAthleteId', 'partnerName'),
      ('partnerUserId', 'partnerUserName'),
      ('secondAthleteId', 'secondAthleteName'),
      ('invitedAthleteId', 'invitedAthleteName'),
    ];
    for (final pair in guestPairs) {
      final id = _pickString(data[pair.$1]);
      final name = _pickString(data[pair.$2]);
      if (id != null || name != null) {
        add(userId: id, name: name);
      }
    }

    return out;
  }

  static String? _pickString(dynamic value) {
    if (value is! String) return null;
    final t = value.trim();
    return t.isEmpty ? null : t;
  }

  static String _timeStr(dynamic v) {
    if (v == null) return '--:--';
    if (v is String) {
      final t = v.trim();
      return t.length >= 5 ? t.substring(0, 5) : t;
    }
    return '--:--';
  }

  /// Ordenação decrescente (mais recente primeiro).
  int get sortMillis {
    final ca = createdAt;
    if (ca != null) return ca.millisecondsSinceEpoch;
    final d = DateTime.tryParse(dateRaw.length >= 10 ? dateRaw : '');
    if (d == null) return 0;
    final parts = startTime.split(':');
    final h = parts.isNotEmpty ? int.tryParse(parts[0]) ?? 0 : 0;
    final m = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
    return DateTime(d.year, d.month, d.day, h, m).millisecondsSinceEpoch;
  }
}
