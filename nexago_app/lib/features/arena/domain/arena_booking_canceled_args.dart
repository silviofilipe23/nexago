import 'package:flutter/foundation.dart';

import '../../arenas/domain/arena_slot.dart';

/// Argumentos para a tela pós-cancelamento (undo).
@immutable
class ArenaBookingCanceledArgs {
  const ArenaBookingCanceledArgs({
    required this.bookingId,
    required this.arenaId,
    required this.athleteNames,
    required this.slotHighlight,
    required this.slotTimeRange,
    this.releasedSlot,
    this.courtName = '',
  });

  final String bookingId;
  final String arenaId;
  final String athleteNames;

  /// Destaque na descrição (ex.: `Sáb 11h–12h · Q1`).
  final String slotHighlight;

  /// Horário no card de slot (ex.: `11H–12H`).
  final String slotTimeRange;

  /// Horário que o cancelamento liberou — base do "Criar reserva". `null` em
  /// reserva antiga sem quadra: aí o botão fica desabilitado.
  final ArenaSlot? releasedSlot;

  /// Nome da quadra para o cabeçalho da folha de reserva.
  final String courtName;
}

/// Horário livre que a reserva cancelada deixou na quadra, ou `null` quando
/// falta algum dado para reservá-lo de novo (reserva antiga sem `courtId`).
ArenaSlot? arenaReleasedSlot({
  required String arenaId,
  required String courtId,
  required String dateKey,
  required String startTime,
  required String endTime,
}) {
  final arena = arenaId.trim();
  final court = courtId.trim();
  final start = startTime.trim();
  final end = endTime.trim();
  if (arena.isEmpty || court.isEmpty || start.isEmpty || end.isEmpty) {
    return null;
  }
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(dateKey.trim());
  if (m == null) return null;
  final date = DateTime(
    int.parse(m.group(1)!),
    int.parse(m.group(2)!),
    int.parse(m.group(3)!),
  );
  return ArenaSlot.virtual(
    arenaId: arena,
    courtId: court,
    date: date,
    startTime: start,
    endTime: end,
  );
}
