import 'package:cloud_firestore/cloud_firestore.dart';

/// Slot em `arenaSlots` (campos alinhados ao vôleiGO web).
///
/// `status`: `available` | `booked` | `blocked`
class ArenaSlot {
  const ArenaSlot({
    required this.id,
    required this.arenaId,
    required this.courtId,
    required this.date,
    required this.startTime,
    required this.endTime,
    required this.rawStatus,
    this.priceReais,
    this.isVirtual = false,
    this.bookingId,
    this.bookingAthleteId,
  });

  final String id;
  final String arenaId;
  final String courtId;

  /// Gerado localmente (sem documento em `arenaSlots`).
  final bool isVirtual;

  /// Apenas a data (meia-noite local), sem hora.
  final DateTime date;

  /// `YYYY-MM-DD` (alinhado à query de slots e ao Firestore).
  String get dateKey {
    final d = date;
    final y = d.year.toString().padLeft(4, '0');
    final m = d.month.toString().padLeft(2, '0');
    final day = d.day.toString().padLeft(2, '0');
    return '$y-$m-$day';
  }

  /// Labels "HH:mm" para exibição.
  final String startTime;
  final String endTime;
  final String rawStatus;
  final double? priceReais;

  /// [arenaBookings] quando `status` é reservado (paridade com o web).
  final String? bookingId;

  /// UID do atleta titular da reserva.
  final String? bookingAthleteId;

  bool get isAvailable {
    final s = rawStatus.toLowerCase();
    return s == 'available';
  }

  bool get isBlocked {
    final s = rawStatus.toLowerCase();
    return s == 'blocked' || s == 'bloqueado';
  }

  bool get isBooked {
    final s = rawStatus.toLowerCase();
    return s == 'booked' ||
        s == 'occupied' ||
        s == 'busy' ||
        s == 'reservado' ||
        s == 'ocupado';
  }

  /// Indisponível para reserva (ocupado, bloqueado ou outro).
  bool get isSelectable => isAvailable;

  factory ArenaSlot.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data() ?? {};
    final arenaId = (data['arenaId'] as String?)?.trim() ?? '';
    final courtRaw = data['courtId'] ?? data['court_id'];
    final courtId = courtRaw is String ? courtRaw.trim() : '';

    final date = _parseDate(
      data['date'] ?? data['slotDate'] ?? data['day'] ?? data['dateKey'],
    );
    if (date == null) {
      throw FormatException('Slot ${doc.id}: campo date inválido');
    }

    final start = _parseTime(
      data['startTime'] ?? data['start'] ?? data['horaInicio'],
    );
    final end = _parseTime(
      data['endTime'] ?? data['end'] ?? data['horaFim'],
    );

    final statusRaw = data['status'];
    final status = statusRaw is String && statusRaw.trim().isNotEmpty
        ? statusRaw.trim()
        : 'available';

    final price = (data['priceReais'] as num?)?.toDouble() ??
        (data['price'] as num?)?.toDouble();

    final bid = data['bookingId'];
    final bookingId = bid is String && bid.trim().isNotEmpty ? bid.trim() : null;
    final aid = data['bookingAthleteId'] ?? data['athleteId'];
    final bookingAthleteId =
        aid is String && aid.trim().isNotEmpty ? aid.trim() : null;

    return ArenaSlot(
      id: doc.id,
      arenaId: arenaId,
      courtId: courtId,
      date: date,
      startTime: start,
      endTime: end,
      rawStatus: status,
      priceReais: price,
      isVirtual: false,
      bookingId: bookingId,
      bookingAthleteId: bookingAthleteId,
    );
  }

  /// Slot sintético para exibição quando não há documento ou para preencher grade.
  factory ArenaSlot.virtual({
    required String arenaId,
    required String courtId,
    required DateTime date,
    required String startTime,
    required String endTime,
    double? priceReais,
  }) {
    final day = DateTime(date.year, date.month, date.day);
    final id =
        'v_${day.year}${day.month.toString().padLeft(2, '0')}${day.day.toString().padLeft(2, '0')}_${courtId}_${startTime.replaceAll(':', '')}_${endTime.replaceAll(':', '')}';
    return ArenaSlot(
      id: id,
      arenaId: arenaId,
      courtId: courtId,
      date: day,
      startTime: startTime,
      endTime: endTime,
      rawStatus: 'available',
      priceReais: priceReais,
      isVirtual: true,
      bookingId: null,
      bookingAthleteId: null,
    );
  }

  static DateTime? _parseDate(dynamic value) {
    if (value == null) return null;
    if (value is Timestamp) {
      final d = value.toDate();
      return DateTime(d.year, d.month, d.day);
    }
    if (value is DateTime) {
      return DateTime(value.year, value.month, value.day);
    }
    if (value is String) {
      final t = value.trim();
      if (t.length >= 10) {
        final p = DateTime.tryParse(t.substring(0, 10));
        if (p != null) return DateTime(p.year, p.month, p.day);
      }
      final p = DateTime.tryParse(t);
      if (p != null) return DateTime(p.year, p.month, p.day);
    }
    return null;
  }

  static String _parseTime(dynamic value) {
    if (value == null) return '--:--';
    if (value is String) {
      final t = value.trim();
      if (t.isNotEmpty) return t.length >= 5 ? t.substring(0, 5) : t;
    }
    if (value is int) {
      final h = value ~/ 60;
      final m = value % 60;
      return '${h.toString().padLeft(2, '0')}:${m.toString().padLeft(2, '0')}';
    }
    return '--:--';
  }
}
