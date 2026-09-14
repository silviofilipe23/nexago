import 'tournament_match.dart';

/// Partidas da FAIXA CENTRAL da chave convergente: as que juntam um alimentador
/// da WB com um da LB, mais a Final e a disputa de 3º lugar.
///
/// A identificação sai da FIAÇÃO, nunca do `matchType`: algumas plantas fecham
/// com cruzamento WB×LB antes da final, e nelas a partida de cruzamento pode
/// estar tipada "WB" ou "LB". Exemplo: na planta de 10, a partida #15 é "WB"
/// e a #16 é "LB", ambas alimentando a final. Uma lista de tipos nunca
/// funcionaria. Marcá-las incorretamente faria o resolvedor de colocação premiar
/// o perdedor antes do 3º lugar.
Set<int> bracketConvergenceMatches(List<TournamentMatch> matches) {
  final typeByNumber = <int, String>{
    for (final m in matches) m.matchNumber: m.matchType.trim().toLowerCase(),
  };
  final feeders = <int, List<int>>{};
  for (final m in matches) {
    final dest = m.winnerAdvanceMatchNumber;
    if (dest == null) continue;
    (feeders[dest] ??= <int>[]).add(m.matchNumber);
  }

  final result = <int>{};
  for (final m in matches) {
    final type = m.matchType.trim().toLowerCase();
    if (type == 'final' || type == 'third place') {
      result.add(m.matchNumber);
      continue;
    }
    final sources = feeders[m.matchNumber] ?? const <int>[];
    final hasWb = sources.any((n) => typeByNumber[n] == 'wb');
    final hasLb = sources.any((n) => typeByNumber[n] == 'lb');
    if (hasWb && hasLb) result.add(m.matchNumber);
  }
  return result;
}
