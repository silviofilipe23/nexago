import 'dart:math' as math;
import 'dart:ui';

import 'bracket_feed_tree.dart';
import 'tournament_match.dart';
import 'tournament_match_display.dart';
import 'tournament_matches_logic.dart';

/// Dimensões do canvas da chave interativa (protótipo NexaGO).
/// cardHeight inclui o rodapé de agendamento do card (dia · hora · quadra);
/// rowUnit acompanha o painel web (`bracket-tree.ts`: 88 pra card 154 → gap
/// 22 entre jogos adjacentes).
abstract final class BracketLayoutMetrics {
  static const cardWidth = 280.0;
  static const cardHeight = 154.0;
  static const columnGap = 56.0;
  static const rowUnit = 88.0;
  static const canvasPadding = 24.0;
  static const columnHeaderHeight = 32.0;
}

/// Gap vertical entre jogos adjacentes de uma coluna (2·rowUnit − cardHeight).
const _adjacentGap =
    2 * BracketLayoutMetrics.rowUnit - BracketLayoutMetrics.cardHeight;

class BracketLayoutNode {
  const BracketLayoutNode({
    required this.matchId,
    required this.columnKey,
    required this.slotIndex,
    required this.position,
    required this.size,
    required this.isFinal,
  });

  final String matchId;
  final String columnKey;
  final int slotIndex;
  final Offset position;
  final Size size;
  final bool isFinal;
}

class BracketLayoutEdge {
  const BracketLayoutEdge({
    required this.fromMatchId,
    required this.toMatchId,
  });

  final String fromMatchId;
  final String toMatchId;
}

class BracketLayoutColumn {
  const BracketLayoutColumn({
    required this.key,
    required this.label,
    required this.matchIds,
    required this.headerPosition,
  });

  final String key;
  final String label;
  final List<String> matchIds;
  final Offset headerPosition;
}

class DoubleEliminationBracketLayout {
  const DoubleEliminationBracketLayout({
    required this.nodes,
    required this.edges,
    required this.columns,
    required this.canvasSize,
  });

  final List<BracketLayoutNode> nodes;
  final List<BracketLayoutEdge> edges;
  final List<BracketLayoutColumn> columns;
  final Size canvasSize;

  BracketLayoutNode? nodeForMatch(String matchId) {
    for (final node in nodes) {
      if (node.matchId == matchId) return node;
    }
    return null;
  }
}

/// `matchType` da decisão em minúsculas, considerando o alias `Grand Final`
/// (com ou sem underline) que a CF nunca grava hoje, mas que o resto do
/// código (`tournament_matches_logic.dart`, `tournament_match_display.dart`,
/// `focus_journey_logic.dart`, `focus_double_elimination.dart`) já trata como
/// sinônimo de `Final` — este arquivo não pode ser o único que não reconhece.
bool _isFinalType(String typeLower) =>
    typeLower == 'final' ||
    typeLower == 'grand final' ||
    typeLower == 'grand_final';

bool _isThirdPlaceType(String typeLower) => typeLower == 'third place';

/// Cabeçalho de coluna no formato do portal web: WB/LB por rodada e as
/// fases eliminatórias pelo TAMANHO da rodada inteira ("Quartas de final",
/// "Semifinais") — rotular por uma partida só rebaixava tudo pra
/// "Eliminatórias".
String bracketColumnHeaderLabel(List<TournamentMatch> columnMatches) {
  if (columnMatches.isEmpty) return '';
  final first = columnMatches.first;
  final type = first.matchType.trim().toLowerCase();
  if (type == 'wb' || type == 'lb') {
    return '${type.toUpperCase()} · RODADA ${first.round}';
  }
  if (_isFinalType(type)) return 'FINAL';
  if (_isThirdPlaceType(type)) return '3º LUGAR';
  return bracketRoundGroupLabel(columnMatches).toUpperCase();
}

/// Monta a chave interativa na forma CONVERGENTE da tabela impressa: a faixa
/// central é o desfecho (cruzamento WB×LB, Final e 3º lugar), e os dois lados
/// caminham para trás dela — WB da esquerda, LB da direita espelhada — paridade
/// com o desenho manual que o dono usa (ver spec de 13/09, `2026-09-13-chave-convergente`).
///
/// **Geometria convergente:**
/// - `bracketConvergenceMatches` marca a faixa central. Para cada ponto de
///   convergência, `buildBracketFeedTree` monta a árvore de alimentação de cada
///   lado (WB e LB). `assignFeedCenters`/`assignFeedDepths` convertem essa
///   árvore em centro vertical (em LUGARES, resultado de subárvore real dos
///   filhos) e profundidade (que vira coluna: WB em `centerColumn - depth`, LB
///   em `centerColumn + depth`).
/// - Posição vertical segue a subárvore real: cada partida fica na média das
///   posições reais dos seus alimentadores. O lado sem alimentador desenhado
///   (bye na WB, entrada do perdedor na LB) RESERVA o lugar que empurra a
///   partida para a altura certa, mas não desenha nada — nem card, nem traço
///   (pedido do dono: sem linha sobrando onde não há partida).
/// - Final e 3º lugar ficam LADO A LADO, na mesma linha horizontal — não mais
///   empilhados na coluna central (pedido do dono: "não precisa de ligamento
///   pras finais, apenas deixe a final e o terceiro na mesma linha
///   horizontal"). Ordem da folha impressa (Goiânia Open: "22 - FINAL" à
///   esquerda, "21 - 3º Lugar" à direita): a Final vai pra coluna vizinha à
///   ESQUERDA do centro (`centerColumn - 1`, lado WB); o 3º lugar (nunca tem
///   árvore própria) vai pra vizinha à DIREITA (`centerColumn + 1`, lado
///   LB) — aproveitando o vão vertical que já sobra nessas colunas em vez de
///   abrir coluna nova. Altura-alvo: a da Final quando ela converge direto
///   (a maioria das plantas — "mesma linha horizontal" da Final de
///   verdade); o meio do bloco quando as duas ficam sem árvore ao mesmo
///   tempo (plantas 10, 12 e 32, mais as de 28 a 31, derivadas dela). Se o
///   vizinho já tiver jogo na altura-alvo
///   (o caso comum: a Final converge direto, e seu próprio alimentador
///   daquele lado mora exatamente na vizinha) a partida ganha coluna
///   PRÓPRIA, mas ADJACENTE ao centro — empurrando pra fora o que já
///   estava lá, nunca anexando no fim da chave. Custa uma coluna de largura
///   nas plantas sem cruzamento (a maioria), mas é o preço de ficarem lado
///   a lado de verdade, não só na mesma altura em algum canto da figura.
/// - Guarda de colisão em duas passadas na materialização de toda coluna:
///   primeiro posiciona as partidas com subárvore própria, depois encaixa as
///   sem-árvore (Final/3º lugar quando dividem coluna com uma rodada de
///   verdade) nos espaços que sobram — sem jamais mexer nas já fixadas.
/// - Final e 3º lugar são PASSAGEIROS quando dividem coluna com uma rodada
///   de verdade: não sequestram o rótulo dela (a coluna das quartas
///   continua "WB · RODADA N"). A coluna de CRUZAMENTO de verdade (abre
///   bloco de convergência com árvore dos dois lados, mas não é a Final —
///   plantas 10, 12, 32 e as de 28 a 31) se identifica como `'SEMIFINAIS'`,
///   o encontro das
///   duas chaves — nunca pelo número da planta ou tamanho da chave, sempre
///   por essa propriedade. Quando a Final converge direto e fica sozinha
///   numa coluna (a maioria das plantas), o rótulo continua `'FINAL'`.
///   `columnKey` do nó sempre concorda com a key da coluna em que foi
///   colocado.
///
/// **Conectores:**
/// - Arestas seguem os ponteiros reais de avanço (`winnerAdvance`) em qualquer
///   direção — inclusive LB→faixa central, que é o que faz os dois lados se
///   encontrarem na forma convergente.
/// - `loserAdvance` NÃO gera aresta (a queda do perdedor não se desenha,
///   decisão do dono — como a tabela impressa que escreve "P 15" em vez de
///   puxar uma linha).
/// - Em chave de dupla eliminação, Final e 3º lugar também não recebem
///   NENHUMA aresta — outro pedido do dono, já que elas moram lado a lado
///   sem precisar de seta indicando quem alimentou quem. No mata-mata
///   simples (sem `wb`/`lb`, caminho legado) a Final é o fim natural da
///   árvore de rodadas e continua recebendo linha normalmente. Ver
///   `_buildAdvanceEdges`.
///
/// **Caminho legado (sem convergência):**
/// - Dispara quando: `bracketConvergenceMatches` é vazio, OU nenhuma partida
///   tem `winnerAdvanceMatchNumber`, OU a chave não tem partidas de AMBAS as
///   chaves (nenhuma `wb` ou nenhuma `lb` — o caso da eliminatória simples,
///   que também é servida por esta função). Sem dois lados não existe ponto de
///   encontro para a geometria convergente.
/// - Agrupa por `bracketGroupKey`, ordenado por `bracketGroupSortOrder` —
///   com uma exceção: a Final vem antes do 3º lugar (`bracketGroupSortOrder`
///   continua intacta, só a ordenação das colunas em `_placeLegacyGroups` é
///   ajustada; ver lá o porquê). Cascata: 1ª coluna em `i + 0.5`, demais na
///   média dos alimentadores (paridade com `buildKnockoutTreeLayout` web).
///   Resultado visual: rodadas em ordem, depois a Final, depois o 3º lugar.
/// - Partidas que sobrarem sem coluna mesmo numa chave COM convergência (caso
///   misto, não ocorre nas 25 plantas reais mas é possível numa chave editada
///   à mão) caem no agrupamento legado, em colunas extras à direita de tudo.
///
/// **Keys de coluna únicas:**
/// - Duas colunas distintas (índices diferentes) podem calcular o mesmo
///   `bracketGroupKey` por coincidência — ex.: planta 25, onde o play-in
///   `#10` (LB, `round` 2) fica numa coluna própria mas tem o MESMO round da
///   coluna "LB · RODADA 2" de verdade (`#19`…`#26`). `_uniqueColumnKey` sufixa
///   (`+2`, `+3`, …) a segunda ocorrência em diante, e `columnKey` do nó sempre
///   recebe a key FINAL (já sufixada) da coluna.
DoubleEliminationBracketLayout buildDoubleEliminationBracketLayout(
  List<TournamentMatch> matches,
) {
  if (matches.isEmpty) {
    return const DoubleEliminationBracketLayout(
      nodes: [],
      edges: [],
      columns: [],
      canvasSize: Size.zero,
    );
  }

  final convergence = bracketConvergenceMatches(matches);
  final byNumber = {for (final m in matches) m.matchNumber: m};
  final hasAnyWiring = matches.any((m) => m.winnerAdvanceMatchNumber != null);
  final hasWb = matches.any((m) => m.matchType.trim().toLowerCase() == 'wb');
  final hasLb = matches.any((m) => m.matchType.trim().toLowerCase() == 'lb');

  // Centros (em lugares) e colunas de cada jogo, montados bloco a bloco.
  final centerSlot = <int, double>{};
  final columnOf = <int, int>{};

  /// Partidas de convergência SEM árvore de alimentação própria (Final e 3º
  /// lugar que não convergem direto — plantas 10, 12, 32 e as de 28 a 31,
  /// derivadas da de 32, onde quem cruza
  /// são as partidas de cruzamento, não elas). O centro delas é só um palpite
  /// em volta do meio do bloco: a materialização nunca deixa uma partida
  /// desta lista empurrar uma partida com centro próprio calculado.
  final semArvore = <int>{};

  /// Partidas de CRUZAMENTO de verdade: abrem bloco de convergência (não são
  /// alimentadas por outra partida de convergência) e têm árvore própria dos
  /// dois lados — mas NÃO são a Final. É essa propriedade (não o número da
  /// planta, não o tamanho da chave) que decide o rótulo `'SEMIFINAIS'` da
  /// coluna onde moram: a Final, quando ela mesma converge direto (a
  /// maioria das plantas, ex. planta 8), abre bloco do mesmo jeito, mas
  /// `_isFinalType` a exclui daqui — a coluna dela continua rotulada
  /// `'FINAL'`.
  final cruzamentoRoots = <int>{};
  var centerColumn = 0;

  if (convergence.isEmpty || !hasAnyWiring || !hasWb || !hasLb) {
    // Sem ponto de encontro alcançável: chave sem fiação nenhuma (o legado
    // anterior à migração que passou a gravar `winnerAdvance`), fiação que
    // nunca cruza WB×LB nem chega numa Final/3º lugar, OU chave sem as DUAS
    // chaves (eliminatória simples — sem WB e LB não há convergência a
    // ancorar; esta função também serve esse formato, ver
    // `tournament_category_view_page.dart`). A geometria convergente não tem
    // onde se ancorar. Cai no agrupamento simples, sem coluna central.
    _placeLegacyGroups(matches, 0, columnOf, centerSlot);
  } else {
    // Uma partida de convergência alimentada por OUTRA partida de convergência
    // não abre bloco: o encontro das duas chaves aconteceu antes dela. É o caso
    // da final nas plantas 10, 12 e 32 — ela vem DEPOIS do cruzamento, não é o
    // cruzamento. Sem este filtro, montar a árvore da final remontaria subárvores
    // já posicionadas e sobrescreveria os centros que o bloco anterior calculou.
    final feedersDe = <int, List<TournamentMatch>>{};
    for (final m in matches) {
      final dest = m.winnerAdvanceMatchNumber;
      if (dest == null) continue;
      (feedersDe[dest] ??= <TournamentMatch>[]).add(m);
    }
    final blocos = convergence.where((n) {
      final fontes = feedersDe[n] ?? const <TournamentMatch>[];
      return !fontes.any((f) => convergence.contains(f.matchNumber));
    }).toList()
      ..sort();

    // Profundidade máxima da WB decide onde fica o centro: a WB começa na
    // coluna 0 e a faixa central fica logo depois da coluna mais funda dela.
    var wbDepth = 0;
    final trees = <int, Map<String, BracketFeedNode?>>{};
    for (final root in blocos) {
      final wb = buildBracketFeedTree(matches, root, 'wb');
      final lb = buildBracketFeedTree(matches, root, 'lb');
      trees[root] = {'wb': wb, 'lb': lb};
      if (wb != null) {
        final depths = <int, int>{};
        assignFeedDepths(wb, 1, depths);
        for (final d in depths.values) {
          if (d > wbDepth) wbDepth = d;
        }
      }
    }
    centerColumn = wbDepth;

    // Cada bloco ocupa uma faixa vertical própria, empilhadas de cima para
    // baixo — sem folga entre elas: a Final e o 3º lugar não moram mais
    // nesta faixa (ver abaixo), então não sobra nada pra reservar aqui.
    var slotCursor = 0.0;
    for (final root in blocos) {
      final wb = trees[root]!['wb'];
      final lb = trees[root]!['lb'];
      if (wb == null && lb == null) continue; // 3º lugar: posicionado depois

      // Abre bloco com árvore própria e não é a Final: é uma partida de
      // CRUZAMENTO de verdade (o encontro das duas chaves), não o desfecho
      // de uma delas. Vira `'SEMIFINAIS'` na materialização, mais abaixo.
      if (!_isFinalType(byNumber[root]!.matchType.trim().toLowerCase())) {
        cruzamentoRoots.add(root);
      }

      final span = math.max(wb?.span ?? 0, lb?.span ?? 0);
      for (final entry in <MapEntry<String, BracketFeedNode?>>[
        MapEntry('wb', wb),
        MapEntry('lb', lb),
      ]) {
        final tree = entry.value;
        if (tree == null) continue;
        // Blocos de spans diferentes ficam centralizados um sobre o outro.
        final inicio = slotCursor + (span - tree.span) / 2;
        final centers = <int, double>{};
        assignFeedCenters(tree, inicio, centers);
        centerSlot.addAll(centers);
        final depths = <int, int>{};
        assignFeedDepths(tree, 1, depths);
        depths.forEach((number, d) {
          columnOf[number] =
              entry.key == 'wb' ? centerColumn - d : centerColumn + d;
        });
      }

      final wbCenter =
          wb?.matchNumber != null ? centerSlot[wb!.matchNumber!] : null;
      final lbCenter =
          lb?.matchNumber != null ? centerSlot[lb!.matchNumber!] : null;
      final both = [wbCenter, lbCenter].whereType<double>().toList();
      centerSlot[root] = both.reduce((a, b) => a + b) / both.length;
      columnOf[root] = centerColumn;
      slotCursor += span;
    }

    // Final e 3º lugar lado a lado, na mesma linha horizontal — pedido do
    // dono: nada de empilhar as duas na coluna central. Ordem da folha
    // impressa do Goiânia Open ("22 - FINAL" à esquerda, "21 - 3º Lugar" à
    // direita): a Final vai pro lado WB (`centerColumn - 1`), o 3º lugar pro
    // lado LB (`centerColumn + 1`). O 3º lugar nunca tem árvore própria (só
    // recebe perdedores, e `loserAdvance` não é rastreado por
    // `buildBracketFeedTree`); a Final só fica sem árvore quando ela mesma é
    // o desfecho de um cruzamento (plantas 10, 12, 32 — as duas partidas de
    // cruzamento é que convergem, não ela).
    //
    // Em vez de dar coluna própria a cada uma (o que empurraria a LB pra
    // longe), TENTA aproveitar o vão vertical das colunas VIZINHAS ao
    // centro primeiro. Nas plantas que cruzam (10, 12, 32) isso sempre cabe:
    // a vizinha ali é a quarta que alimenta a partida de CRUZAMENTO, dois
    // níveis afastada da Final, com folga de sobra. Na maioria das plantas
    // (Final converge direto) a vizinha da Final é sua PRÓPRIA quarta —
    // sempre à mesma altura (é dela que a média da Final sai) — então nunca
    // cabe ali: cai na coluna própria ADJACENTE ao centro (empurrando o que
    // vier depois pro lado de fora, nunca anexando no fim da chave — "lado a
    // lado", não "em algum lugar na mesma altura"), preservando a
    // altura-alvo.
    //
    // Altura-alvo: quando a Final já converge direto, o 3º lugar mira nela —
    // é a "mesma linha horizontal" de verdade. Só quando a Final também não
    // converge direto (10, 12, 32) é que as duas miram o meio do bloco.
    final middle = slotCursor / 2;
    final finalRoot = convergence.firstWhere(
      (n) => _isFinalType(byNumber[n]?.matchType.trim().toLowerCase() ?? ''),
      orElse: () => -1,
    );
    final thirdPlaceRoot = convergence.firstWhere(
      (n) =>
          _isThirdPlaceType(byNumber[n]?.matchType.trim().toLowerCase() ?? ''),
      orElse: () => -1,
    );
    final targetSlot =
        centerSlot.containsKey(finalRoot) ? centerSlot[finalRoot]! : middle;

    // Só cabe no vizinho se não colidir com nenhum jogo que a árvore daquele
    // lado já colocou ali — a mesma régua de 1 LUGAR (162px) que separa
    // qualquer par de jogos adjacentes no resto do desenho.
    bool cabeNaColuna(int coluna, double alvo) {
      for (final entry in columnOf.entries) {
        if (entry.value != coluna) continue;
        final outro = centerSlot[entry.key];
        if (outro != null && (outro - alvo).abs() < 1) return false;
      }
      return true;
    }

    void posicionaAoLado(int root, int coluna, {bool marcaSemArvore = true}) {
      columnOf[root] = coluna;
      centerSlot[root] = targetSlot;
      if (marcaSemArvore) semArvore.add(root);
    }

    // Insere uma coluna nova, exclusiva, ADJACENTE a `centerColumn` do lado
    // indicado — empurra pra fora o que já estava lá (e além de lá), nunca
    // anexa no fim da chave. Custa uma coluna de largura no lado empurrado;
    // é o preço combinado por ficarem lado a lado de verdade, não só na
    // mesma altura em algum canto da figura.
    int inserirColunaAdjacente({required bool aEsquerda}) {
      if (aEsquerda) {
        for (final k in columnOf.keys.toList()) {
          if (columnOf[k]! < centerColumn) columnOf[k] = columnOf[k]! - 1;
        }
        return centerColumn - 1;
      }
      for (final k in columnOf.keys.toList()) {
        if (columnOf[k]! > centerColumn) columnOf[k] = columnOf[k]! + 1;
      }
      return centerColumn + 1;
    }

    // Não entra em `semArvore`: sozinha na própria coluna, não tem quem a
    // guarda de colisão precise proteger.
    void posicionaEmColunaPropria(int root, {required bool aEsquerda}) {
      final novaColuna = inserirColunaAdjacente(aEsquerda: aEsquerda);
      posicionaAoLado(root, novaColuna, marcaSemArvore: false);
    }

    if (finalRoot != -1 && !centerSlot.containsKey(finalRoot)) {
      final coluna = centerColumn - 1;
      if (cabeNaColuna(coluna, targetSlot)) {
        posicionaAoLado(finalRoot, coluna);
      } else {
        posicionaEmColunaPropria(finalRoot, aEsquerda: true);
      }
    }
    if (thirdPlaceRoot != -1 && !centerSlot.containsKey(thirdPlaceRoot)) {
      final coluna = centerColumn + 1;
      if (cabeNaColuna(coluna, targetSlot)) {
        posicionaAoLado(thirdPlaceRoot, coluna);
      } else {
        posicionaEmColunaPropria(thirdPlaceRoot, aEsquerda: false);
      }
    }

    // Rede de segurança: qualquer OUTRA partida de convergência que sobre
    // sem árvore (não deveria acontecer nas 25 plantas reais — só Final e
    // 3º lugar ficam sem árvore própria) cai no comportamento antigo,
    // empilhada na coluna central.
    for (final root in convergence.toList()..sort()) {
      if (centerSlot.containsKey(root)) continue;
      if (root == finalRoot || root == thirdPlaceRoot) continue;
      centerSlot[root] = middle;
      columnOf[root] = centerColumn;
      semArvore.add(root);
    }

    // Órfãs: partidas que sobraram sem coluna mesmo numa chave COM
    // convergência — não ocorre nas 25 plantas reais, mas é possível numa
    // chave editada à mão (ex.: um jogo com `winnerAdvance` apontando pra
    // fora de qualquer árvore alcançada). Melhor aparecer fora de lugar do
    // que sumir da tela: mesmo agrupamento do caminho legado, em colunas
    // extras à direita de tudo.
    final orphans = [
      for (final m in matches)
        if (!columnOf.containsKey(m.matchNumber)) m,
    ];
    if (orphans.isNotEmpty) {
      final maxCol = columnOf.values.reduce(math.max);
      _placeLegacyGroups(orphans, maxCol + 1, columnOf, centerSlot);
    }

    // Normaliza os índices de coluna pra sempre começar em 0 — inserir uma
    // coluna adjacente à ESQUERDA do centro (`inserirColunaAdjacente`,
    // acima) empurra as colunas da WB pra índices negativos. Devolve tudo
    // pro zero somando a MESMA constante em todo mundo — não muda a ordem
    // relativa de nada — e atualiza `centerColumn` junto, já que ele
    // também é um índice de coluna e precisa continuar apontando pro mesmo
    // lugar depois da soma.
    if (columnOf.isNotEmpty) {
      final minCol = columnOf.values.reduce(math.min);
      if (minCol < 0) {
        final offset = -minCol;
        for (final k in columnOf.keys.toList()) {
          columnOf[k] = columnOf[k]! + offset;
        }
        centerColumn += offset;
      }
    }
  }

  // Materializa nós e colunas.
  final nodes = <BracketLayoutNode>[];
  final columns = <BracketLayoutColumn>[];
  final nodeByMatchNumber = <int, BracketLayoutNode>{};
  const top = BracketLayoutMetrics.canvasPadding +
      BracketLayoutMetrics.columnHeaderHeight;

  final byColumnIndex = <int, List<TournamentMatch>>{};
  for (final m in matches) {
    final col = columnOf[m.matchNumber];
    if (col == null) continue;
    (byColumnIndex[col] ??= []).add(m);
  }

  final columnKeys = byColumnIndex.keys.toList()..sort();
  final usedColumnKeys = <String>{};
  for (final col in columnKeys) {
    final columnMatches = byColumnIndex[col]!
      ..sort((a, b) =>
          centerSlot[a.matchNumber]!.compareTo(centerSlot[b.matchNumber]!));
    final x = _columnX(col);
    // Final e 3º lugar são PASSAGEIROS quando dividem coluna com uma rodada
    // de verdade (a quarta da WB, a rodada da LB): não sequestram o rótulo
    // dela — a coluna das quartas continua "WB · RODADA N", a da LB
    // continua "LB · RODADA N". O rótulo (e a key) saem das partidas HOST
    // (tudo que não está em `semArvore`); só quando a coluna não tem
    // NENHUM host (a Final ou o 3º lugar sozinhos, de coluna própria) é que
    // o rótulo vem delas mesmas — daí "FINAL"/"3º LUGAR" continuam corretos.
    //
    // A coluna de CRUZAMENTO de verdade (`cruzamentoRoots` — abre bloco de
    // convergência com árvore dos dois lados, mas não é a Final) se
    // identifica como o encontro das duas chaves: `'SEMIFINAIS'`, nunca o
    // rótulo por tipo/round da partida (que enterraria o cruzamento atrás
    // de "WB · RODADA N", escondendo que é ali que as chaves se encontram).
    //
    // Duas colunas (índices diferentes) também podem calcular o MESMO
    // `bracketGroupKey` por coincidência de round (planta 25: o play-in #10
    // e a coluna real "LB · RODADA 2" são as duas round 2) —
    // `_uniqueColumnKey` sufixa a partir da segunda ocorrência. `columnKey`
    // do nó sempre recebe a key FINAL (já única) da coluna: são a MESMA
    // identidade.
    final hasCruzamento =
        columnMatches.any((m) => cruzamentoRoots.contains(m.matchNumber));
    final hostMatches = [
      for (final m in columnMatches)
        if (!semArvore.contains(m.matchNumber)) m,
    ];
    final referencia = hostMatches.isNotEmpty ? hostMatches : columnMatches;
    final hostGroupKeys = {for (final m in referencia) bracketGroupKey(m)};
    final String baseKey;
    final String label;
    if (hasCruzamento) {
      baseKey = 'SEMIFINAIS';
      label = 'SEMIFINAIS';
    } else if (hostGroupKeys.length > 1) {
      // Mistura inesperada entre hosts de verdade (não deveria ocorrer nas
      // 25 plantas reais) — mantém o aviso genérico de antes.
      baseKey = 'DESFECHO';
      label = 'DESFECHO';
    } else {
      baseKey = bracketGroupKey(referencia.first);
      label = bracketColumnHeaderLabel(referencia);
    }
    final columnKey = _uniqueColumnKey(baseKey, usedColumnKeys);
    columns.add(
      BracketLayoutColumn(
        key: columnKey,
        label: label,
        matchIds: [for (final m in columnMatches) m.id],
        headerPosition: Offset(x, BracketLayoutMetrics.canvasPadding),
      ),
    );

    // Guarda de colisão em DUAS passadas. 1ª: só as partidas com centro
    // PRÓPRIO (tudo que não está em `semArvore`), na ordem de sempre — é
    // exatamente a guarda de antes, e por isso não muda nada em nenhuma
    // coluna sem Final/3º lugar pendente. 2ª: cada BLOCO de partidas SEM
    // árvore consecutivas (ex.: Final+3º lugar juntas, planta 10) é
    // distribuído por igual dentro da janela livre entre o jogo real
    // anterior e o seguinte — nunca reabrindo uma posição já fixada na 1ª
    // passada. Quando a janela é curta demais pra caber todo mundo com o
    // espaçamento padrão (planta 10: só 121,5px pra Final+3º lugar, que
    // precisariam de 162px só entre si), o espaçamento ENCOLHE em vez de
    // estourar pra fora da janela — a sobra vira uma leve proximidade entre
    // Final e 3º lugar, nunca um empurrão na partida de cruzamento vizinha.
    final centerYByNumber = <int, double>{};
    var prevComArvore = double.negativeInfinity;
    for (final match in columnMatches) {
      if (semArvore.contains(match.matchNumber)) continue;
      final wanted = top +
          centerSlot[match.matchNumber]! * 2 * BracketLayoutMetrics.rowUnit;
      final minCenter =
          prevComArvore + BracketLayoutMetrics.cardHeight + _adjacentGap;
      final centerY = math.max(wanted, minCenter);
      prevComArvore = centerY;
      centerYByNumber[match.matchNumber] = centerY;
    }

    const passo = BracketLayoutMetrics.cardHeight + _adjacentGap;
    var idx = 0;
    while (idx < columnMatches.length) {
      if (!semArvore.contains(columnMatches[idx].matchNumber)) {
        idx++;
        continue;
      }
      var fim = idx;
      while (fim < columnMatches.length &&
          semArvore.contains(columnMatches[fim].matchNumber)) {
        fim++;
      }
      // Bloco de partidas sem árvore em [idx, fim).
      final n = fim - idx;
      final piso = idx == 0
          ? double.negativeInfinity
          : centerYByNumber[columnMatches[idx - 1].matchNumber]! + passo;
      final teto = fim == columnMatches.length
          ? double.infinity
          : centerYByNumber[columnMatches[fim].matchNumber]! - passo;
      final disponivel = (piso.isFinite && teto.isFinite) ? teto - piso : null;

      if (n == 1) {
        final wanted = top +
            centerSlot[columnMatches[idx].matchNumber]! *
                2 *
                BracketLayoutMetrics.rowUnit;
        double pos;
        if (disponivel != null && disponivel < 0) {
          pos = (piso + teto) / 2; // sem espaço algum — meio do conflito
        } else {
          pos = wanted;
          if (piso.isFinite) pos = math.max(pos, piso);
          if (teto.isFinite) pos = math.min(pos, teto);
        }
        centerYByNumber[columnMatches[idx].matchNumber] = pos;
      } else {
        final espacamentoIdeal = passo * (n - 1);
        final espacamento = disponivel == null
            ? passo
            : (disponivel >= espacamentoIdeal ? passo : disponivel / (n - 1));
        final vao = espacamento * (n - 1);
        double inicio;
        if (piso.isFinite && teto.isFinite) {
          inicio = piso + math.max(0.0, (disponivel! - vao) / 2);
        } else if (piso.isFinite) {
          inicio = piso;
        } else if (teto.isFinite) {
          inicio = teto - vao;
        } else {
          inicio = top +
              centerSlot[columnMatches[idx].matchNumber]! *
                  2 *
                  BracketLayoutMetrics.rowUnit;
        }
        for (var k = 0; k < n; k++) {
          centerYByNumber[columnMatches[idx + k].matchNumber] =
              inicio + k * espacamento;
        }
      }
      idx = fim;
    }

    for (var i = 0; i < columnMatches.length; i++) {
      final match = columnMatches[i];
      final centerY = centerYByNumber[match.matchNumber]!;
      final node = BracketLayoutNode(
        matchId: match.id,
        columnKey: columnKey,
        slotIndex: i,
        position: Offset(
          x,
          centerY - BracketLayoutMetrics.cardHeight / 2,
        ),
        size: const Size(
          BracketLayoutMetrics.cardWidth,
          BracketLayoutMetrics.cardHeight,
        ),
        isFinal: _isFinalType(match.matchType.trim().toLowerCase()),
      );
      nodes.add(node);
      nodeByMatchNumber[match.matchNumber] = node;
    }
  }

  final edges = _buildAdvanceEdges(matches, nodeByMatchNumber);

  var maxX = BracketLayoutMetrics.canvasPadding;
  var maxY = BracketLayoutMetrics.canvasPadding;
  for (final node in nodes) {
    maxX = math.max(maxX, node.position.dx + node.size.width);
    maxY = math.max(maxY, node.position.dy + node.size.height);
  }

  return DoubleEliminationBracketLayout(
    nodes: nodes,
    edges: edges,
    columns: columns,
    canvasSize: Size(
      maxX + BracketLayoutMetrics.canvasPadding,
      maxY + BracketLayoutMetrics.canvasPadding,
    ),
  );
}

double _columnX(int columnIndex) {
  return BracketLayoutMetrics.canvasPadding +
      columnIndex *
          (BracketLayoutMetrics.cardWidth + BracketLayoutMetrics.columnGap);
}

/// Garante que cada coluna materializada tenha uma key única. Duas colunas
/// (índices diferentes, portanto profundidades/posições diferentes) podem
/// calcular o MESMO `bracketGroupKey` por coincidência de round — ex.: planta
/// 25, onde o play-in `#10` (LB, round 2) e a coluna real "LB · RODADA 2"
/// (`#19`…`#26`) são as duas round 2 — mas nunca podem reivindicar a mesma
/// identidade visual. Sufixa a partir da segunda ocorrência (`+2`, `+3`, …).
String _uniqueColumnKey(String base, Set<String> used) {
  var key = base;
  var n = 2;
  while (!used.add(key)) {
    key = '$base+${n++}';
  }
  return key;
}

/// Caminho legado, sem geometria convergente: uma coluna por
/// `bracketGroupKey`, colunas ordenadas por `bracketGroupSortOrder` da
/// esquerda para a direita — com UMA exceção: a Final vem antes do 3º lugar
/// (`bracketGroupSortOrder` continua intacta, com o 3º lugar em 8900 e a
/// Final em 9000 — ela é compartilhada com listagens fora do layout; a
/// inversão vale só aqui, na ordenação das colunas). Duas razões: é a ordem
/// da folha impressa (Final à esquerda, 3º lugar à direita — mesmo critério
/// da faixa central convergente) e evita que a aresta semi→final pule por
/// cima do card do 3º lugar quando os dois saem do mesmo bloco de semis —
/// com a Final logo depois das semis, a aresta liga colunas vizinhas, sem
/// nada no meio.
///
/// **Cascata:** a 1ª coluna espalha folhas em `i + 0.5`; cada coluna seguinte
/// põe o jogo na MÉDIA dos alimentadores (`winnerAdvance` → este número),
/// caindo no pareamento posicional `prev[i·2]`/`prev[i·2+1]` (mesma regra do
/// `buildKnockoutTreeLayout` web) quando a fiação falta. Empilhar `i + 0.5`
/// em toda coluna alinhava a semi com a 1ª quarta — a cascata da referência
/// sumia. Usado tanto para a chave inteira (sem nenhum ponto de convergência
/// alcançável) quanto para as partidas órfãs que sobrarem fora da árvore
/// convergente.
void _placeLegacyGroups(
  List<TournamentMatch> matches,
  int startColumn,
  Map<int, int> columnOf,
  Map<int, double> centerSlot,
) {
  final byGroup = <String, List<TournamentMatch>>{};
  for (final m in matches) {
    byGroup.putIfAbsent(bracketGroupKey(m), () => []).add(m);
  }
  final keys = byGroup.keys.toList()
    ..sort((a, b) {
      final typeA = byGroup[a]!.first.matchType.trim().toLowerCase();
      final typeB = byGroup[b]!.first.matchType.trim().toLowerCase();
      if (_isFinalType(typeA) && _isThirdPlaceType(typeB)) return -1;
      if (_isThirdPlaceType(typeA) && _isFinalType(typeB)) return 1;
      final cmp = bracketGroupSortOrder(byGroup[a]!.first)
          .compareTo(bracketGroupSortOrder(byGroup[b]!.first));
      if (cmp != 0) return cmp;
      return a.compareTo(b);
    });

  final feedersOf = <int, List<int>>{};
  for (final m in matches) {
    final dest = m.winnerAdvanceMatchNumber;
    if (dest == null) continue;
    (feedersOf[dest] ??= <int>[]).add(m.matchNumber);
  }

  var col = startColumn;
  List<TournamentMatch>? prevColumn;
  for (final key in keys) {
    final columnMatches = [...byGroup[key]!]
      ..sort((a, b) => a.matchNumber.compareTo(b.matchNumber));
    for (var i = 0; i < columnMatches.length; i++) {
      final m = columnMatches[i];
      columnOf[m.matchNumber] = col;
      centerSlot[m.matchNumber] = _legacyCascadeSlot(
        matchNumber: m.matchNumber,
        indexInColumn: i,
        feedersOf: feedersOf,
        centerSlot: centerSlot,
        prevColumn: prevColumn,
      );
    }
    prevColumn = columnMatches;
    col++;
  }
}

/// Centro em LUGARES pra uma partida do caminho legado (cascata).
double _legacyCascadeSlot({
  required int matchNumber,
  required int indexInColumn,
  required Map<int, List<int>> feedersOf,
  required Map<int, double> centerSlot,
  required List<TournamentMatch>? prevColumn,
}) {
  final feederSlots = <double>[
    for (final n in feedersOf[matchNumber] ?? const <int>[])
      if (centerSlot.containsKey(n)) centerSlot[n]!,
  ];
  if (feederSlots.length >= 2) {
    return feederSlots.reduce((a, b) => a + b) / feederSlots.length;
  }
  if (feederSlots.length == 1) {
    return feederSlots.first;
  }
  if (prevColumn != null) {
    final a = indexInColumn * 2 < prevColumn.length
        ? centerSlot[prevColumn[indexInColumn * 2].matchNumber]
        : null;
    final b = indexInColumn * 2 + 1 < prevColumn.length
        ? centerSlot[prevColumn[indexInColumn * 2 + 1].matchNumber]
        : null;
    final pair = [a, b].whereType<double>().toList();
    if (pair.isNotEmpty) {
      return pair.reduce((x, y) => x + y) / pair.length;
    }
  }
  return indexInColumn + 0.5;
}

/// Conectores pelos ponteiros reais de avanço (`winnerAdvance`), em qualquer
/// direção — inclusive LB→faixa central, que na forma convergente é o que faz
/// os dois lados se encontrarem. `loserAdvance` NÃO gera aresta: a queda do
/// perdedor não se desenha (decisão do dono, ver a spec de 13/09), do mesmo
/// jeito que a tabela impressa escreve "P 15" em vez de puxar uma linha.
///
/// Em chave de DUPLA ELIMINAÇÃO (tem partidas `wb` E `lb`), a Final e o 3º
/// lugar também não recebem linha — pedido do dono: "não precisa de
/// ligamento pras finais". Critério usado para distinguir do mata-mata
/// simples: a MESMA condição `hasWb && hasLb` que decide o caminho legado
/// logo acima — sem as duas chaves não há o que "ligar" de qualquer forma, e
/// COM as duas chaves a Final é sempre o desfecho de um cruzamento, nunca o
/// fim natural de uma única árvore de rodadas. No mata-mata simples (chave
/// tipada `knockout`/`Final`, sem `wb`/`lb`, caminho legado) a Final é
/// exatamente esse fim natural — a linha até ela continua o desenho certo.
List<BracketLayoutEdge> _buildAdvanceEdges(
  List<TournamentMatch> matches,
  Map<int, BracketLayoutNode> nodeByMatchNumber,
) {
  final byNumber = {for (final m in matches) m.matchNumber: m};
  final isDoubleElimination =
      matches.any((m) => m.matchType.trim().toLowerCase() == 'wb') &&
          matches.any((m) => m.matchType.trim().toLowerCase() == 'lb');
  final edges = <BracketLayoutEdge>[];
  for (final m in matches) {
    final dest = m.winnerAdvanceMatchNumber;
    if (dest == null) continue;
    final target = byNumber[dest];
    if (target == null) continue;
    if (isDoubleElimination) {
      final targetType = target.matchType.trim().toLowerCase();
      if (_isFinalType(targetType) || _isThirdPlaceType(targetType)) continue;
    }
    if (!nodeByMatchNumber.containsKey(m.matchNumber) ||
        !nodeByMatchNumber.containsKey(dest)) {
      continue;
    }
    edges.add(BracketLayoutEdge(fromMatchId: m.id, toMatchId: target.id));
  }
  return edges;
}
