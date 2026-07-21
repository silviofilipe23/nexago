import 'package:cloud_firestore/cloud_firestore.dart';

/// Status de uma entrada em `arenaBookingWaitlist` (lista de espera de
/// horário de quadra lotado — distinto da lista de espera de INSCRIÇÃO em
/// torneio, que vive em outra coleção).
enum ArenaBookingWaitlistStatus { waiting, notified, expired, converted }

ArenaBookingWaitlistStatus _statusFromRaw(String? raw) {
  switch (raw?.trim().toLowerCase()) {
    case 'notified':
      return ArenaBookingWaitlistStatus.notified;
    case 'expired':
      return ArenaBookingWaitlistStatus.expired;
    case 'converted':
      return ArenaBookingWaitlistStatus.converted;
    case 'waiting':
    default:
      return ArenaBookingWaitlistStatus.waiting;
  }
}

/// Linha de `arenaBookingWaitlist` — fila FIFO para um horário exato
/// (arenaId/courtId/date/startTime/endTime) que estava lotado no momento em
/// que o atleta entrou na lista.
class ArenaBookingWaitlistEntry {
  const ArenaBookingWaitlistEntry({
    required this.id,
    required this.arenaId,
    required this.courtId,
    required this.dateKey,
    required this.startTime,
    required this.endTime,
    required this.athleteId,
    required this.status,
    this.arenaName,
    this.courtName,
    this.createdAt,
    this.notifiedAt,
    this.expiresAt,
  });

  final String id;
  final String arenaId;
  final String courtId;

  /// `YYYY-MM-DD`.
  final String dateKey;
  final String startTime;
  final String endTime;
  final String athleteId;
  final ArenaBookingWaitlistStatus status;
  final String? arenaName;
  final String? courtName;
  final DateTime? createdAt;
  final DateTime? notifiedAt;
  final DateTime? expiresAt;

  bool get isWaiting => status == ArenaBookingWaitlistStatus.waiting;
  bool get isNotified => status == ArenaBookingWaitlistStatus.notified;

  /// A entrada ainda importa para a UI (não é histórico morto).
  bool get isActive => isWaiting || isNotified;

  Duration? get remainingNotifyWindow {
    final exp = expiresAt;
    if (exp == null || status != ArenaBookingWaitlistStatus.notified) return null;
    final remaining = exp.difference(DateTime.now());
    return remaining.isNegative ? Duration.zero : remaining;
  }

  factory ArenaBookingWaitlistEntry.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? const <String, dynamic>{};

    DateTime? asDate(dynamic v) => v is Timestamp ? v.toDate() : null;
    String asTrimmed(dynamic v) => v is String ? v.trim() : '';
    String? asOptionalTrimmed(dynamic v) {
      final t = asTrimmed(v);
      return t.isEmpty ? null : t;
    }

    return ArenaBookingWaitlistEntry(
      id: doc.id,
      arenaId: asTrimmed(data['arenaId']),
      courtId: asTrimmed(data['courtId']),
      dateKey: asTrimmed(data['date']),
      startTime: asTrimmed(data['startTime']),
      endTime: asTrimmed(data['endTime']),
      athleteId: asTrimmed(data['athleteId']),
      status: _statusFromRaw(data['status'] as String?),
      arenaName: asOptionalTrimmed(data['arenaName']),
      courtName: asOptionalTrimmed(data['courtName']),
      createdAt: asDate(data['createdAt']),
      notifiedAt: asDate(data['notifiedAt']),
      expiresAt: asDate(data['expiresAt']),
    );
  }
}
