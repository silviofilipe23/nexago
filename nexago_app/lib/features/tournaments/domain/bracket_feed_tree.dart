import 'tournament_match.dart';

/// `matchType` da decisão em minúsculas, considerando o alias `Grand Final`
/// (com ou sem underline) — mesmo reconhecimento de `_isFinalType` em
/// `double_elimination_bracket_layout.dart` (privado lá, então não dá pra
/// importar; duplicado aqui de propósito, não fundido, porque este arquivo é
/// importado POR aquele, nunca o contrário).
bool _isFinalType(String typeLower) =>
    typeLower == 'final' ||
    typeLower == 'grand final' ||
    typeLower == 'grand_final';

bool _isThirdPlaceType(String typeLower) => typeLower == 'third place';

/// Partidas da FAIXA CENTRAL da chave convergente: as que juntam um alimentador
/// da WB com um da LB, mais a Final e a disputa de 3º lugar.
///
/// A identificação sai da FIAÇÃO, nunca do `matchType`: algumas plantas fecham
/// com cruzamento WB×LB antes da final, e nelas a partida de cruzamento pode
/// estar tipada "WB" ou "LB". Exemplo: na planta de 10, a partida #15 é "WB"
/// e a #16 é "LB", ambas alimentando a final. Uma lista de tipos nunca
/// funcionaria. Marcá-las incorretamente faria o resolvedor de colocação premiar
/// o perdedor antes do 3º lugar.
///
/// Usa `_isFinalType`/`_isThirdPlaceType` (não comparação literal) pra
/// reconhecer também o alias `Grand Final`/`grand_final`: uma final gravada
/// assim ficava de fora daqui, não virava a raiz da Final mais acima
/// (`double_elimination_bracket_layout.dart`), e sobrava como órfã numa coluna
/// extra à direita de tudo — mesmo bug no porte web (`bracket-tree.ts`).
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
    if (_isFinalType(type) || _isThirdPlaceType(type)) {
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
  /// o bye na WB e a entrada do perdedor na LB. Ocupa espaço e não desenha
  /// nada; é ele que empurra o jogo para a altura certa.
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
/// chave não alimenta aquela partida por exatamente UM lado.
///
/// Toda partida tem DOIS lados: o que não tem alimentador desenhado vira lugar
/// vago. Sem isso o jogo se alinha em linha reta com o único alimentador e o
/// lado vazio desaparece da leitura — some o bye e some a entrada do perdedor.
///
/// O invariante é "esta é a árvore que entra em [rootMatchNumber] por UM
/// lado": exige exatamente um alimentador daquela chave na raiz. Zero
/// alimentadores é o caso comum de `null` (a chave não alimenta ali — ex.: o
/// 3º lugar, que só recebe perdedores). DOIS alimentadores da MESMA chave
/// também devolve `null`, e por um motivo diferente: nesse caso
/// [rootMatchNumber] não é o ponto de encontro das duas chaves, é uma partida
/// DEPOIS dele — a final das plantas de 12 e 32, por exemplo, onde `#19` e
/// `#20` (ambas WB) alimentam a final `#22` pelos dois lados. Ali não existe
/// "a árvore que entra por um lado"; cada alimentador é a raiz da sua própria
/// árvore, chamada separadamente. Devolver metade da árvore em silêncio
/// sobrescreveria posições que o outro lado já calculou — pior que `null`.
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
  // Exatamente um: zero é "chave não alimenta aqui", dois é "isto não é o
  // ponto de encontro das chaves" — os dois casos devolvem null.
  if (entry == null || entry.length != 1) return null;
  return build(entry.first.matchNumber, <int>{});
}

/// Centro vertical de cada jogo, em LUGARES, a partir de [slotStart].
///
/// Percorre a árvore dando um lugar a cada ponta e pondo cada jogo interno na
/// MÉDIA das posições REAIS dos filhos — a posição já calculada para cada
/// filho (`out[child.matchNumber]`), não o meio geométrico do intervalo que
/// ele ocupa. As duas coisas só coincidem quando a subárvore do filho é
/// simétrica; em plantas irregulares (entrada desigual na LB das plantas 20 a
/// 24) o filho fica deslocado dentro do próprio intervalo, e usar o meio
/// geométrico ali gera um conector torto. O meio geométrico só é usado para o
/// LUGAR VAGO, que é sempre uma ponta sem posição própria — é ele quem não
/// vira entrada no mapa, o que reserva o espaço do bye sem desenhar nada.
/// Medir por extensão de subárvore (e não dobrar por rodada) é o que mantém
/// as plantas irregulares de pé — play-ins e a entrada desigual na LB das
/// plantas 20 a 24.
void assignFeedCenters(
  BracketFeedNode node,
  double slotStart,
  Map<int, double> out,
) {
  if (node.children.isEmpty) {
    if (node.matchNumber != null) out[node.matchNumber!] = slotStart + 0.5;
    return;
  }
  var cursor = slotStart;
  final childCenters = <double>[];
  for (final child in node.children) {
    assignFeedCenters(child, cursor, out);
    final real = child.matchNumber != null ? out[child.matchNumber!] : null;
    childCenters.add(real ?? cursor + child.span / 2);
    cursor += child.span;
  }
  if (node.matchNumber != null) {
    out[node.matchNumber!] =
        childCenters.reduce((a, b) => a + b) / childCenters.length;
  }
}

/// Profundidade de cada jogo: [depth] na raiz da árvore (a coluna encostada na
/// faixa central), crescendo ao se afastar do centro.
void assignFeedDepths(BracketFeedNode node, int depth, Map<int, int> out) {
  if (node.matchNumber != null) out[node.matchNumber!] = depth;
  for (final child in node.children) {
    assignFeedDepths(child, depth + 1, out);
  }
}
