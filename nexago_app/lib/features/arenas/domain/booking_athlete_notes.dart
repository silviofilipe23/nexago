/// Recado do atleta para a arena na reserva de quadra ("Vamos chegar 10 min
/// antes"). Vai no `createArenaBooking` como `athleteNotes` e a arena lê no
/// detalhe da reserva. Mesmo limite do servidor
/// (`functions/src/arena-booking-athlete-notes.ts`).
const int kAthleteNotesMaxLength = 280;

/// Texto aparado, ou `null` quando não há recado (vazio ou só espaços).
String? normalizeAthleteNotes(String? raw) {
  final text = raw?.trim() ?? '';
  return text.isEmpty ? null : text;
}
