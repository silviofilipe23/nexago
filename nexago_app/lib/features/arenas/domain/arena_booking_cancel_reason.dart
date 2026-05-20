/// Motivo de cancelamento pelo gestor (`arenaBookings.cancelReason`).
enum ArenaBookingCancelReason {
  athleteRequest,
  scheduleConflict,
  maintenance,
  other,
}

extension ArenaBookingCancelReasonX on ArenaBookingCancelReason {
  String get firestoreValue => switch (this) {
        ArenaBookingCancelReason.athleteRequest => 'athlete_request',
        ArenaBookingCancelReason.scheduleConflict => 'schedule_conflict',
        ArenaBookingCancelReason.maintenance => 'maintenance',
        ArenaBookingCancelReason.other => 'other',
      };

  String get displayLabel => switch (this) {
        ArenaBookingCancelReason.athleteRequest => 'A pedido do atleta',
        ArenaBookingCancelReason.scheduleConflict => 'Conflito de agenda',
        ArenaBookingCancelReason.maintenance => 'Manutenção urgente',
        ArenaBookingCancelReason.other => 'Outro motivo',
      };

  static ArenaBookingCancelReason? fromFirestore(String? raw) {
    final v = raw?.trim().toLowerCase();
    if (v == null || v.isEmpty) return null;
    for (final r in ArenaBookingCancelReason.values) {
      if (r.firestoreValue == v) return r;
    }
    return ArenaBookingCancelReason.other;
  }
}
