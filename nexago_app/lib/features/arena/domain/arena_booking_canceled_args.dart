import 'package:flutter/foundation.dart';

/// Argumentos para a tela pós-cancelamento (undo).
@immutable
class ArenaBookingCanceledArgs {
  const ArenaBookingCanceledArgs({
    required this.bookingId,
    required this.arenaId,
    required this.athleteNames,
    required this.slotHighlight,
    required this.slotTimeRange,
  });

  final String bookingId;
  final String arenaId;
  final String athleteNames;

  /// Destaque na descrição (ex.: `Sáb 11h–12h · Q1`).
  final String slotHighlight;

  /// Horário no card de slot (ex.: `11H–12H`).
  final String slotTimeRange;
}
