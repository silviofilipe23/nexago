/// Ação pontual registrada pelo placarista em `matches.lastActions`.
class TournamentMatchPointAction {
  const TournamentMatchPointAction({
    required this.type,
    required this.side,
    required this.setIndex,
    required this.delta,
    required this.ts,
  });

  final String type;
  final String side;
  final int setIndex;
  final int delta;
  final DateTime ts;

  bool get isPoint => type.trim().toLowerCase() == 'point';

  bool get isSideA => side.trim().toUpperCase() == 'A';

  bool get isSideB => side.trim().toUpperCase() == 'B';
}
