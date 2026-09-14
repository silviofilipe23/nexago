import 'dart:math' as math;
import 'dart:ui';

import 'bracket_feed_tree.dart';
import 'tournament_match.dart';
import 'tournament_match_display.dart';
import 'tournament_matches_logic.dart';

/// Dimensões do canvas da chave interativa (protótipo NexaGO).
/// cardHeight inclui o rodapé de agendamento do card (dia · hora · quadra);
/// rowUnit acompanha pra manter o gap de 12 entre jogos adjacentes (2·81−150).
abstract final class BracketLayoutMetrics {
  static const cardWidth = 280.0;
  static const cardHeight = 150.0;
  static const columnGap = 56.0;
  static const rowUnit = 81.0;
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
    this.isEmptySlot = false,
  });

  final String matchId;
  final String columnKey;
  final int slotIndex;
  final Offset position;
  final Size size;
  final bool isFinal;

  /// Marca o card cujo lado oposto não tem alimentador desenhado (bye da WB,
  /// entrada do perdedor na LB) — é nele que o conector desenha a linha livre
  /// em vez de uma seta vinda de outro card.
  final bool isEmptySlot;
}

/// Um lado de partida sem alimentador desenhado — o bye da WB e a entrada do
/// perdedor na LB. Não vira card: vira a linha livre que a tabela impressa
/// estica até a coluna vizinha, e é ela que mostra que aquele lado existe.
class BracketLayoutEmptySlot {
  const BracketLayoutEmptySlot({
    required this.matchId,
    required this.from,
    required this.to,
  });

  /// A partida DONA do lado vago.
  final String matchId;
  final Offset from;
  final Offset to;
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
    required this.emptySlots,
    required this.canvasSize,
  });

  final List<BracketLayoutNode> nodes;
  final List<BracketLayoutEdge> edges;
  final List<BracketLayoutColumn> columns;
  final List<BracketLayoutEmptySlot> emptySlots;
  final Size canvasSize;

  BracketLayoutNode? nodeForMatch(String matchId) {
    for (final node in nodes) {
      if (node.matchId == matchId) return node;
    }
    return null;
  }
}

/// Cabeçalho de coluna no formato do portal web: WB/LB por rodada e as
/// fases eliminatórias pelo TAMANHO da rodada inteira ("Quartas de final",
/// "Semifinais") — rotular por uma partida só rebaixava tudo pra
/// "Eliminatórias".
String bracketColumnHeaderLabel(List<TournamentMatch> columnMatches) {
  if (columnMatches.isEmpty) return '';
  final first = columnMatches.first;
  final type = first.matchType.trim().toUpperCase();
  if (type == 'WB' || type == 'LB') {
    return '$type · RODADA ${first.round}';
  }
  if (type == 'FINAL') return 'FINAL';
  if (type == 'THIRD PLACE') return '3º LUGAR';
  return bracketRoundGroupLabel(columnMatches).toUpperCase();
}

/// Monta a chave interativa na forma CONVERGENTE da tabela impressa: a chave
/// dos vencedores cresce da esquerda para o centro, a dos perdedores cresce
/// espelhada da direita para o centro, e o desfecho (cruzamento WB×LB, Final
/// e 3º lugar) mora na faixa do meio — paridade com o desenho manual que o
/// dono usa (ver spec de 13/09, `2026-09-13-chave-convergente`).
///
/// - `bracketConvergenceMatches` marca a faixa central; `buildBracketFeedTree`
///   (por `matches`, `rootMatchNumber`, `'wb'`/`'lb'`) monta, para cada ponto
///   de convergência, a árvore de alimentação de cada lado. `assignFeedCenters`
///   /`assignFeedDepths` convertem essa árvore em centro vertical (em LUGARES)
///   e profundidade (que vira coluna: WB em `centerColumn - depth`, LB em
///   `centerColumn + depth`). Lados sem alimentador desenhado (bye da WB,
///   entrada do perdedor na LB) viram linha livre (`emptySlots`), não card.
/// - Final e 3º lugar que não convergem direto (plantas 12 e 32, onde quem
///   cruza são as semifinais) ficam empilhados na MESMA coluna central,
///   ordenados pelo centro, com guarda de colisão separando.
/// - Coluna central mista (cruzamento + Final + 3º lugar juntos, como nas
///   plantas 10/12/32): rótulo E key viram `'DESFECHO'` em vez do rótulo da
///   primeira partida — senão a Final ficaria escondida atrás de "WB · RODADA
///   N" no seletor de fases do canvas. `columnKey` do nó sempre concorda com
///   a key da coluna em que ele foi colocado.
/// - **Caminho legado**: quando `bracketConvergenceMatches` devolve vazio OU
///   nenhuma partida tem `winnerAdvanceMatchNumber`, não existe ponto de
///   encontro para ancorar a geometria convergente — é o caso de chaves
///   anteriores à migração que passou a gravar `winnerAdvance`
///   (`bracket-placement-tiers.ts` trata o mesmo buraco do lado do servidor:
///   sem fiação não dá para saber quem seguiu vivo). Nesse caso o motor cai
///   num agrupamento simples por `bracketGroupKey`, ordenado por
///   `bracketGroupSortOrder`, jogos em slots fixos `(2i+1)·rowUnit` na ordem
///   de `matchNumber` — sem geometria convergente, sem linha livre. Partidas
///   que sobrarem sem coluna mesmo numa chave COM convergência (caso misto,
///   que não ocorre nas 25 plantas reais mas é possível numa chave editada à
///   mão) caem no mesmo agrupamento, em colunas extras à direita de tudo.
/// - Conectores: ponteiros reais de avanço (`winnerAdvance`), só dentro da
///   mesma chave (WB→WB, LB→LB) — sem linha cruzando WB↔LB nem entrando na
///   Final. `loserAdvance` nunca vira aresta (a queda do perdedor não se
///   desenha, decisão do dono).
DoubleEliminationBracketLayout buildDoubleEliminationBracketLayout(
  List<TournamentMatch> matches,
) {
  if (matches.isEmpty) {
    return const DoubleEliminationBracketLayout(
      nodes: [],
      edges: [],
      columns: [],
      emptySlots: [],
      canvasSize: Size.zero,
    );
  }

  final convergence = bracketConvergenceMatches(matches);
  final byNumber = {for (final m in matches) m.matchNumber: m};
  final hasAnyWiring = matches.any((m) => m.winnerAdvanceMatchNumber != null);

  // Centros (em lugares) e colunas de cada jogo, montados bloco a bloco.
  final centerSlot = <int, double>{};
  final columnOf = <int, int>{};

  /// Centros dos lados sem alimentador, por partida — viram a linha livre.
  final vagos = <int, List<double>>{};
  var centerColumn = 0;

  if (convergence.isEmpty || !hasAnyWiring) {
    // Sem ponto de encontro alcançável (chave sem fiação nenhuma — o legado
    // anterior à migração que passou a gravar `winnerAdvance` — ou com
    // fiação que nunca cruza WB×LB nem chega numa Final/3º lugar): a
    // geometria convergente não tem onde se ancorar. Cai no agrupamento
    // simples, sem linha livre e sem coluna central.
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

    // Cada bloco ocupa uma faixa vertical própria, empilhadas de cima para baixo.
    var slotCursor = 0.0;
    for (final root in blocos) {
      final wb = trees[root]!['wb'];
      final lb = trees[root]!['lb'];
      if (wb == null && lb == null) continue; // 3º lugar: posicionado depois

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
        assignEmptySlotCenters(tree, inicio, vagos);
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

    // Final e 3º lugar que NÃO convergem direto (plantas 12 e 32, onde quem
    // converge são as semifinais): centro vertical do conjunto, na MESMA coluna
    // central das semifinais — é o que a folha faz, com a final no meio e as
    // semifinais acima e abaixo. Dar coluna própria a elas empurraria a LB para
    // longe e roubaria o lugar da LB R3.
    final middle = slotCursor / 2;
    for (final root in convergence.toList()..sort()) {
      if (centerSlot.containsKey(root)) continue;
      centerSlot[root] = middle;
      columnOf[root] = centerColumn;
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
  for (final col in columnKeys) {
    final columnMatches = byColumnIndex[col]!
      ..sort((a, b) =>
          centerSlot[a.matchNumber]!.compareTo(centerSlot[b.matchNumber]!));
    final x = _columnX(col);
    // A coluna central mistura tipos nas plantas que cruzam (10, 12, 32):
    // cruzamento + final + 3º lugar juntos. Rotular pela primeira partida
    // ("WB · RODADA 4") esconderia a final do seletor de fases do canvas —
    // por isso o rótulo E a key viram 'DESFECHO' quando a coluna mistura
    // mais de um `bracketGroupKey`. `columnKey` do nó tem de concordar com a
    // key da coluna: são a MESMA identidade.
    final groupKeys = {for (final m in columnMatches) bracketGroupKey(m)};
    final isDesfecho = groupKeys.length > 1;
    final columnKey =
        isDesfecho ? 'DESFECHO' : bracketGroupKey(columnMatches.first);
    final label =
        isDesfecho ? 'DESFECHO' : bracketColumnHeaderLabel(columnMatches);
    columns.add(
      BracketLayoutColumn(
        key: columnKey,
        label: label,
        matchIds: [for (final m in columnMatches) m.id],
        headerPosition: Offset(x, BracketLayoutMetrics.canvasPadding),
      ),
    );
    var prev = double.negativeInfinity;
    for (var i = 0; i < columnMatches.length; i++) {
      final match = columnMatches[i];
      final wanted = top +
          centerSlot[match.matchNumber]! * 2 * BracketLayoutMetrics.rowUnit;
      final minCenter = prev + BracketLayoutMetrics.cardHeight + _adjacentGap;
      final centerY = math.max(wanted, minCenter);
      prev = centerY;
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
        isFinal: match.matchType.trim().toLowerCase() == 'final',
      );
      nodes.add(node);
      nodeByMatchNumber[match.matchNumber] = node;
    }
  }

  final edges = _buildAdvanceEdges(matches, nodeByMatchNumber);

  // Linha livre de cada lado vago, correndo para FORA do centro — para a
  // esquerda na WB, para a direita na LB, ocupando a largura da coluna vizinha.
  final freeLines = <BracketLayoutEmptySlot>[];
  vagos.forEach((number, centros) {
    final col = columnOf[number];
    final match = byNumber[number];
    if (col == null || match == null) return;
    final paraEsquerda = col <= centerColumn;
    for (final c in centros) {
      final y = top + c * 2 * BracketLayoutMetrics.rowUnit;
      freeLines.add(
        BracketLayoutEmptySlot(
          matchId: match.id,
          from: Offset(
            paraEsquerda
                ? _columnX(col)
                : _columnX(col) + BracketLayoutMetrics.cardWidth,
            y,
          ),
          to: Offset(
            paraEsquerda
                ? _columnX(col - 1)
                : _columnX(col + 1) + BracketLayoutMetrics.cardWidth,
            y,
          ),
        ),
      );
    }
  });

  var maxX = BracketLayoutMetrics.canvasPadding;
  var maxY = BracketLayoutMetrics.canvasPadding;
  for (final node in nodes) {
    maxX = math.max(maxX, node.position.dx + node.size.width);
    maxY = math.max(maxY, node.position.dy + node.size.height);
  }
  for (final line in freeLines) {
    maxX = math.max(maxX, math.max(line.from.dx, line.to.dx));
  }

  return DoubleEliminationBracketLayout(
    nodes: nodes,
    edges: edges,
    columns: columns,
    emptySlots: freeLines,
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

/// Caminho legado, sem geometria convergente: uma coluna por
/// `bracketGroupKey`, colunas ordenadas por `bracketGroupSortOrder` da
/// esquerda para a direita, jogos de cada coluna em slots fixos
/// `(2i+1)·rowUnit` na ordem de `matchNumber`. Usado tanto para a chave
/// inteira (sem nenhum ponto de convergência alcançável) quanto para as
/// partidas órfãs que sobrarem fora da árvore convergente. Preenche
/// `columnOf`/`centerSlot` a partir de `startColumn` — `centerSlot` guarda
/// `i + 0.5` (o `+0.5` é o mesmo ajuste que o resto do arquivo usa pra
/// converter índice de slot em centro de LUGAR) para que a materialização de
/// nós comum (`centerSlot * 2 * rowUnit`) resulte exatamente em
/// `(2i+1)·rowUnit`, o slot fixo da coluna.
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
      final cmp = bracketGroupSortOrder(byGroup[a]!.first)
          .compareTo(bracketGroupSortOrder(byGroup[b]!.first));
      if (cmp != 0) return cmp;
      return a.compareTo(b);
    });

  var col = startColumn;
  for (final key in keys) {
    final columnMatches = [...byGroup[key]!]
      ..sort((a, b) => a.matchNumber.compareTo(b.matchNumber));
    for (var i = 0; i < columnMatches.length; i++) {
      final m = columnMatches[i];
      columnOf[m.matchNumber] = col;
      centerSlot[m.matchNumber] = i + 0.5;
    }
    col++;
  }
}

/// Conectores pelos ponteiros reais de avanço (`winnerAdvance`), só dentro da
/// mesma chave (WB→WB, LB→LB) — sem linha cruzando WB↔LB nem entrando na Final.
List<BracketLayoutEdge> _buildAdvanceEdges(
  List<TournamentMatch> matches,
  Map<int, BracketLayoutNode> nodeByMatchNumber,
) {
  final byNumber = {for (final m in matches) m.matchNumber: m};
  final edges = <BracketLayoutEdge>[];
  for (final m in matches) {
    final type = m.matchType.trim().toLowerCase();
    final dest = m.winnerAdvanceMatchNumber;
    if (dest == null) continue;
    final target = byNumber[dest];
    if (target == null) continue;
    final targetType = target.matchType.trim().toLowerCase();
    // DE: só dentro da mesma chave (WB→WB, LB→LB) — linha entrando na Final
    // cruzaria os tracks. Eliminatória simples (modelo do portal): as
    // rodadas ligam entre si E entram na Final.
    final sameTrack = (type == 'wb' || type == 'lb') && targetType == type;
    final knockoutFlow = type == 'knockout' &&
        (targetType == 'knockout' || targetType == 'final');
    if (!sameTrack && !knockoutFlow) continue;
    if (!nodeByMatchNumber.containsKey(m.matchNumber) ||
        !nodeByMatchNumber.containsKey(dest)) {
      continue;
    }
    edges.add(BracketLayoutEdge(fromMatchId: m.id, toMatchId: target.id));
  }
  return edges;
}
