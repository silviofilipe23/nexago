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
    this.expiredReason,
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

  /// Por que a entrada foi encerrada (`left_by_athlete`, `slot_started`); null quando o
  /// prazo de 15 min acabou ou a entrada é antiga.
  final String? expiredReason;

  bool get isWaiting => status == ArenaBookingWaitlistStatus.waiting;
  bool get isNotified => status == ArenaBookingWaitlistStatus.notified;

  /// O horário da entrada já começou: a vaga não serve mais. O servidor encerra a
  /// entrada em até 5 min (`expireArenaBookingWaitlistEntries`); até lá a Agenda esconde.
  bool slotStarted(DateTime now) {
    final day = dateKey.length >= 10 ? DateTime.tryParse(dateKey.substring(0, 10)) : null;
    final parts = startTime.split(':');
    final h = parts.isNotEmpty ? int.tryParse(parts[0]) : null;
    final m = parts.length > 1 ? int.tryParse(parts[1]) : 0;
    if (day == null || h == null || m == null) return false;
    return !now.isBefore(DateTime(day.year, day.month, day.day, h, m));
  }

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
      expiredReason: asOptionalTrimmed(data['expiredReason']),
    );
  }
}
