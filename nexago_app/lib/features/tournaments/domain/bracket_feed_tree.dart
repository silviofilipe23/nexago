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

/// Um jogo e os LUGARES que a sua subárvore de alimentação ocupa.
class BracketFeedNode {
  const BracketFeedNode({
    required this.matchNumber,
    required this.children,
    required this.span,
  });

  /// `null` é LUGAR VAGO: o lado da partida que não tem alimentador desenhado —
  /// o bye na WB e a entrada do perdedor na LB. Ocupa espaço e não vira card;
  /// é ele que empurra o jogo para a altura certa, como na tabela impressa.
  final int? matchNumber;
  final List<BracketFeedNode> children;

  /// Lugares ocupados pela subárvore. Uma ponta (ou um vago) ocupa 1.
  final int span;

  bool get isEmptySlot => matchNumber == null;
}

const _emptySlot = BracketFeedNode(
  matchNumber: null,
  children: <BracketFeedNode>[],
  span: 1,
);

int _slotRank(TournamentMatch m) {
  if (m.winnerAdvanceSlot == 'A') return 0;
  if (m.winnerAdvanceSlot == 'B') return 1;
  return 2;
}

/// Árvore de alimentação que entra em [rootMatchNumber] pelo lado de [track]
/// (`'wb'` ou `'lb'`), descendo só por jogos daquela chave. `null` quando a
/// chave não alimenta aquela partida.
///
/// Toda partida tem DOIS lados: o que não tem alimentador desenhado vira lugar
/// vago. Sem isso o jogo se alinha em linha reta com o único alimentador e o
/// lado vazio desaparece da leitura — some o bye e some a entrada do perdedor.
BracketFeedNode? buildBracketFeedTree(
  List<TournamentMatch> matches,
  int rootMatchNumber,
  String track,
) {
  final feeders = <int, List<TournamentMatch>>{};
  for (final m in matches) {
    final dest = m.winnerAdvanceMatchNumber;
    if (dest == null) continue;
    if (m.matchType.trim().toLowerCase() != track) continue;
    (feeders[dest] ??= <TournamentMatch>[]).add(m);
  }
  for (final list in feeders.values) {
    list.sort((a, b) {
      final cmp = _slotRank(a).compareTo(_slotRank(b));
      if (cmp != 0) return cmp;
      return a.matchNumber.compareTo(b.matchNumber);
    });
  }

  BracketFeedNode build(int number, Set<int> seen) {
    if (!seen.add(number)) return _emptySlot; // fiação cíclica: não trava
    final sources = feeders[number] ?? const <TournamentMatch>[];
    if (sources.isEmpty) {
      return BracketFeedNode(
        matchNumber: number,
        children: const <BracketFeedNode>[],
        span: 1,
      );
    }
    final children = <BracketFeedNode>[
      for (final s in sources) build(s.matchNumber, seen),
    ];
    if (children.length < 2) {
      // O alimentador que entra pelo slot B fica EMBAIXO; o vago, em cima.
      if (sources.first.winnerAdvanceSlot == 'B') {
        children.insert(0, _emptySlot);
      } else {
        children.add(_emptySlot);
      }
    }
    return BracketFeedNode(
      matchNumber: number,
      children: children,
      span: children.fold<int>(0, (sum, c) => sum + c.span),
    );
  }

  final entry = feeders[rootMatchNumber];
  if (entry == null || entry.isEmpty) return null;
  return build(entry.first.matchNumber, <int>{});
}
