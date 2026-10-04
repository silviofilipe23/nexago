/// Evento append-only em `matches/{id}/pointEvents`.
class TournamentMatchPointEvent {
  const TournamentMatchPointEvent({
    required this.seq,
    required this.type,
    required this.setIndex,
    required this.scoreA,
    required this.scoreB,
    required this.ts,
    this.side,
    this.gameA = 0,
    this.gameB = 0,
    this.prev,
  });

  final int seq;
  final String type;
  final int setIndex;
  final String? side;
  final int scoreA;
  final int scoreB;
  final DateTime ts;

  /// Partida de games: pontos do game depois do lance.
  final int gameA;
  final int gameB;

  /// Partida de games: estado da mesa ANTES do lance — o desfazer repõe isto.
  final Map<String, dynamic>? prev;

  bool get isPoint => type.trim().toLowerCase() == 'point';

  bool get isUndoPoint => type.trim().toLowerCase() == 'undo-point';

  bool get isSideA => side?.trim().toUpperCase() == 'A';

  bool get isSideB => side?.trim().toUpperCase() == 'B';
}
