import 'dart:math' as math;
import 'dart:ui';

import 'tournament_match.dart';
import 'tournament_match_display.dart';
import 'tournament_matches_logic.dart';

/// Dimensões do canvas da chave interativa (protótipo NexaGO).
abstract final class BracketLayoutMetrics {
  static const cardWidth = 280.0;
  static const cardHeight = 132.0;
  static const columnGap = 56.0;
  static const rowUnit = 72.0;
  static const canvasPadding = 24.0;
  static const columnHeaderHeight = 32.0;
  static const wbLbGap = 56.0;
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

/// Cabeçalho de coluna no formato do protótipo (`WB · RODADA 1`).
String bracketColumnHeaderLabel(TournamentMatch match) {
  final type = match.matchType.trim().toUpperCase();
  if (type == 'WB' || type == 'LB') {
    return '$type · RODADA ${match.round}';
  }
  if (type == 'FINAL') return 'FINAL';
  if (type == 'THIRD PLACE') return '3º LUGAR';
  return bracketRoundGroupLabel([match]).toUpperCase();
}

/// Monta a chave interativa com a SEQUÊNCIA DE LIGAÇÕES das plantas
/// (`functions/src/bracket-definitions`) como autoridade da ordem visual —
/// paridade com `bracket-tree.ts` do painel web do organizador:
///
/// - Dentro de cada chave (WB/LB), a ordem dos jogos numa coluna deriva da
///   fiação real (`winnerAdvance` gravado por `buildMatchesFromDefinition`):
///   a última coluna ancora (por matchNumber) e cada coluna anterior se ordena
///   pelos jogos que alimenta — alimentador do slot A acima do slot B. Ordenar
///   por matchNumber cru quebra as plantas de fiação irregular (ex.: 27 duplas,
///   onde o vencedor do #2 vai pro #21, não pro #14) e cruzaria os conectores.
/// - Posição vertical: coluna-base (a maior do track) em slots fixos
///   (`(2i+1)·rowUnit`); colunas seguintes na média dos alimentadores; play-ins
///   anteriores à base alinhados ao jogo que alimentam. Guarda de colisão em
///   toda coluna.
/// - Conectores: ponteiros reais de avanço, só dentro da mesma chave
///   (WB→WB, LB→LB) — sem linha cruzando WB↔LB nem entrando na Final.
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

  final byColumn = <String, List<TournamentMatch>>{};
  for (final match in matches) {
    byColumn.putIfAbsent(bracketGroupKey(match), () => []).add(match);
  }

  final wbKeys = _sortedKeysForType(byColumn, 'wb');
  final lbKeys = _sortedKeysForType(byColumn, 'lb');
  final finalKeys = byColumn.keys
      .where(
        (k) => byColumn[k]!.first.matchType.trim().toLowerCase() == 'final',
      )
      .toList();
  final otherKeys = byColumn.keys
      .where((k) {
        final type = byColumn[k]!.first.matchType.trim().toLowerCase();
        return type != 'wb' && type != 'lb' && type != 'final';
      })
      .toList()
    ..sort((a, b) {
      final cmp = bracketGroupSortOrder(byColumn[a]!.first)
          .compareTo(bracketGroupSortOrder(byColumn[b]!.first));
      if (cmp != 0) return cmp;
      return a.compareTo(b);
    });

  final nodes = <BracketLayoutNode>[];
  final columns = <BracketLayoutColumn>[];
  final nodeByMatchNumber = <int, BracketLayoutNode>{};
  final usedColumnKeys = <String>{};

  // ── Track da WB (com 3º lugar e Final à direita) ──
  const wbTrackTop = BracketLayoutMetrics.canvasPadding;
  final wbColumns =
      _splitIntraColumnDeps([for (final k in wbKeys) byColumn[k]!]);
  final wbBottom = _placeTrack(
    trackColumns: wbColumns,
    trackTop: wbTrackTop,
    startColumnIndex: 0,
    nodes: nodes,
    columns: columns,
    nodeByMatchNumber: nodeByMatchNumber,
    usedColumnKeys: usedColumnKeys,
  );

  var nextColumnIndex = wbColumns.length;
  for (final key in otherKeys) {
    _placeFixedColumn(
      columnMatches: byColumn[key]!,
      trackTop: wbTrackTop,
      columnIndex: nextColumnIndex,
      nodes: nodes,
      columns: columns,
      nodeByMatchNumber: nodeByMatchNumber,
      usedColumnKeys: usedColumnKeys,
    );
    nextColumnIndex++;
  }

  // Final: última coluna, centralizada verticalmente na altura REAL do track
  // da WB (medida, não calculada — a fórmula por potência de 2 assume que a
  // 1ª rodada é a maior, o que não vale pros play-ins das plantas irregulares).
  for (final key in finalKeys) {
    _placeFinalColumn(
      columnMatches: byColumn[key]!,
      trackTop: wbTrackTop,
      trackBottom: wbBottom,
      columnIndex: nextColumnIndex,
      nodes: nodes,
      columns: columns,
      nodeByMatchNumber: nodeByMatchNumber,
      usedColumnKeys: usedColumnKeys,
    );
    nextColumnIndex++;
  }

  // ── Track da LB (embaixo, colunas recomeçando da esquerda) ──
  var upperBottom = wbBottom;
  for (final node in nodes) {
    upperBottom = math.max(upperBottom, node.position.dy + node.size.height);
  }
  _placeTrack(
    trackColumns: _splitIntraColumnDeps([for (final k in lbKeys) byColumn[k]!]),
    trackTop: upperBottom + BracketLayoutMetrics.wbLbGap,
    startColumnIndex: 0,
    nodes: nodes,
    columns: columns,
    nodeByMatchNumber: nodeByMatchNumber,
    usedColumnKeys: usedColumnKeys,
  );

  final edges = _buildAdvanceEdges(matches, nodeByMatchNumber);

  var maxX = BracketLayoutMetrics.canvasPadding;
  var maxY = BracketLayoutMetrics.canvasPadding;
  for (final node in nodes) {
    maxX = math.max(maxX, node.position.dx + node.size.width);
    maxY = math.max(maxY, node.position.dy + node.size.height);
  }
  for (final column in columns) {
    maxX = math.max(
      maxX,
      column.headerPosition.dx + BracketLayoutMetrics.cardWidth,
    );
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

List<String> _sortedKeysForType(
  Map<String, List<TournamentMatch>> byColumn,
  String type,
) {
  return byColumn.keys.where((k) {
    return byColumn[k]!.first.matchType.trim().toLowerCase() == type;
  }).toList()
    ..sort((a, b) {
      final cmp = byColumn[a]!.first.round.compareTo(byColumn[b]!.first.round);
      if (cmp != 0) return cmp;
      return a.compareTo(b);
    });
}

/// Garante que nenhum jogo divida coluna com um jogo que ele alimenta: algumas
/// plantas gravam o play-in da LB com o MESMO `round` da rodada que ele
/// alimenta (ex.: planta 25, jogo #10 "LB R1" com round 2, alimentando o #26
/// da LB R2) — se ficassem juntos, a ligação apontaria pra dentro da própria
/// coluna. Extrai os alimentadores pra uma coluna própria antes, recursivamente.
List<List<TournamentMatch>> _splitIntraColumnDeps(
  List<List<TournamentMatch>> columns,
) {
  final result = <List<TournamentMatch>>[];
  for (final col in columns) {
    final chain = <List<TournamentMatch>>[col];
    for (;;) {
      final first = chain[0];
      final numbers = {for (final m in first) m.matchNumber};
      final feeders = [
        for (final m in first)
          if (m.winnerAdvanceMatchNumber != null &&
              numbers.contains(m.winnerAdvanceMatchNumber))
            m,
      ];
      if (feeders.isEmpty || feeders.length == first.length) break;
      final feederNumbers = {for (final m in feeders) m.matchNumber};
      chain[0] = [
        for (final m in first)
          if (!feederNumbers.contains(m.matchNumber)) m,
      ];
      chain.insert(0, feeders);
    }
    result.addAll(chain);
  }
  return result;
}

/// Ordena as colunas de um track (WB ou LB) seguindo as ligações da planta:
/// a última coluna ancora por matchNumber; cada coluna anterior é ordenada
/// pelos jogos que alimenta na coluna seguinte (alimentador do slot A acima
/// do B). Jogos sem destino na coluna seguinte (não deveria acontecer em
/// planta válida) vão pro fim, por matchNumber.
List<List<TournamentMatch>> _orderColumnsByWiring(
  List<List<TournamentMatch>> columns,
) {
  if (columns.isEmpty) return const [];
  final ordered = List<List<TournamentMatch>>.filled(columns.length, const []);
  final last = columns.length - 1;
  ordered[last] = [...columns[last]]
    ..sort((a, b) => a.matchNumber.compareTo(b.matchNumber));

  int slotRank(TournamentMatch m) {
    if (m.winnerAdvanceSlot == 'A') return 0;
    if (m.winnerAdvanceSlot == 'B') return 1;
    return 2;
  }

  for (var c = last - 1; c >= 0; c--) {
    final current = columns[c];
    final used = <int>{};
    final result = <TournamentMatch>[];
    for (final target in ordered[c + 1]) {
      final feeders = [
        for (final m in current)
          if (m.winnerAdvanceMatchNumber == target.matchNumber) m,
      ]..sort((a, b) {
          final cmp = slotRank(a).compareTo(slotRank(b));
          if (cmp != 0) return cmp;
          return a.matchNumber.compareTo(b.matchNumber);
        });
      for (final f in feeders) {
        if (used.add(f.matchNumber)) result.add(f);
      }
    }
    final rest = [...current]
      ..sort((a, b) => a.matchNumber.compareTo(b.matchNumber));
    for (final m in rest) {
      if (!used.contains(m.matchNumber)) result.add(m);
    }
    ordered[c] = result;
  }
  return ordered;
}

double _columnX(int columnIndex) {
  return BracketLayoutMetrics.canvasPadding +
      columnIndex *
          (BracketLayoutMetrics.cardWidth + BracketLayoutMetrics.columnGap);
}

/// Chaves de coluna únicas mesmo quando `_splitIntraColumnDeps` divide um
/// mesmo `round` em mais de uma coluna.
String _uniqueColumnKey(TournamentMatch first, Set<String> used) {
  final base = bracketGroupKey(first);
  var key = base;
  var n = 2;
  while (!used.add(key)) {
    key = '$base+${n++}';
  }
  return key;
}

/// Posiciona um track (WB ou LB) seguindo as ligações da planta. A coluna-BASE
/// é a maior do track (nas plantas não-potência-de-2 a 1ª rodada é um play-in
/// pequeno — ancorar nela estouraria o track): base em slots fixos; colunas
/// seguintes na média dos alimentadores; colunas anteriores (play-ins)
/// alinhadas ao jogo que alimentam (2 alimentadores abrem ±rowUnit em volta do
/// destino, slot A em cima). Retorna o Y mais baixo ocupado.
double _placeTrack({
  required List<List<TournamentMatch>> trackColumns,
  required double trackTop,
  required int startColumnIndex,
  required List<BracketLayoutNode> nodes,
  required List<BracketLayoutColumn> columns,
  required Map<int, BracketLayoutNode> nodeByMatchNumber,
  required Set<String> usedColumnKeys,
}) {
  final orderedColumns = _orderColumnsByWiring(trackColumns);
  if (orderedColumns.isEmpty) return trackTop;

  final centerOf = <int, double>{}; // matchNumber → centerY absoluto

  var baseCol = 0;
  for (var c = 1; c < orderedColumns.length; c++) {
    if (orderedColumns[c].length > orderedColumns[baseCol].length) baseCol = c;
  }

  void applyColumn(int col, List<double> centers) {
    _applyColumn(
      columnMatches: orderedColumns[col],
      centers: centers,
      trackTop: trackTop,
      columnIndex: startColumnIndex + col,
      nodes: nodes,
      columns: columns,
      nodeByMatchNumber: nodeByMatchNumber,
      usedColumnKeys: usedColumnKeys,
      centerOf: centerOf,
    );
  }

  // Base: slots fixos.
  applyColumn(baseCol, [
    for (var i = 0; i < orderedColumns[baseCol].length; i++)
      trackTop +
          BracketLayoutMetrics.columnHeaderHeight +
          (2 * i + 1) * BracketLayoutMetrics.rowUnit,
  ]);

  // Antes da base (play-ins): alinhado ao destino que alimenta.
  for (var col = baseCol - 1; col >= 0; col--) {
    final columnMatches = orderedColumns[col];
    final centers = <double>[];
    var fallback = trackTop +
        BracketLayoutMetrics.columnHeaderHeight +
        BracketLayoutMetrics.rowUnit;
    for (final match in columnMatches) {
      final dest = match.winnerAdvanceMatchNumber;
      final targetCenter = dest != null ? centerOf[dest] : null;
      if (targetCenter == null) {
        centers.add(fallback);
        fallback += 2 * BracketLayoutMetrics.rowUnit;
        continue;
      }
      final siblings = [
        for (final m in columnMatches)
          if (m.winnerAdvanceMatchNumber == dest) m,
      ];
      if (siblings.length >= 2) {
        final idx = siblings.indexOf(match);
        centers.add(
          targetCenter +
              (idx == 0
                  ? -BracketLayoutMetrics.rowUnit
                  : BracketLayoutMetrics.rowUnit),
        );
      } else {
        centers.add(targetCenter);
      }
      fallback = centers.last + 2 * BracketLayoutMetrics.rowUnit;
    }
    applyColumn(col, centers);
  }

  // Depois da base: média dos alimentadores.
  for (var col = baseCol + 1; col < orderedColumns.length; col++) {
    final columnMatches = orderedColumns[col];
    final centers = <double>[];
    var fallback = trackTop +
        BracketLayoutMetrics.columnHeaderHeight +
        BracketLayoutMetrics.rowUnit;
    for (final match in columnMatches) {
      final feederCenters = [
        for (final f in orderedColumns[col - 1])
          if (f.winnerAdvanceMatchNumber == match.matchNumber &&
              centerOf.containsKey(f.matchNumber))
            centerOf[f.matchNumber]!,
      ];
      if (feederCenters.isNotEmpty) {
        centers.add(
          feederCenters.reduce((a, b) => a + b) / feederCenters.length,
        );
      } else {
        centers.add(fallback);
      }
      fallback = centers.last + 2 * BracketLayoutMetrics.rowUnit;
    }
    applyColumn(col, centers);
  }

  var bottom = trackTop;
  for (final columnMatches in orderedColumns) {
    for (final m in columnMatches) {
      final center = centerOf[m.matchNumber];
      if (center != null) {
        bottom =
            math.max(bottom, center + BracketLayoutMetrics.cardHeight / 2);
      }
    }
  }
  return bottom;
}

/// Materializa uma coluna: header + nodes na ordem visual recebida, com guarda
/// de colisão preservando a ordem (jogo nunca sobe acima do anterior).
void _applyColumn({
  required List<TournamentMatch> columnMatches,
  required List<double> centers,
  required double trackTop,
  required int columnIndex,
  required List<BracketLayoutNode> nodes,
  required List<BracketLayoutColumn> columns,
  required Map<int, BracketLayoutNode> nodeByMatchNumber,
  required Set<String> usedColumnKeys,
  Map<int, double>? centerOf,
}) {
  if (columnMatches.isEmpty) return;
  final x = _columnX(columnIndex);
  final key = _uniqueColumnKey(columnMatches.first, usedColumnKeys);

  columns.add(
    BracketLayoutColumn(
      key: key,
      label: bracketColumnHeaderLabel(columnMatches.first),
      matchIds: [for (final m in columnMatches) m.id],
      headerPosition: Offset(x, trackTop),
    ),
  );

  var prev = double.negativeInfinity;
  for (var i = 0; i < columnMatches.length; i++) {
    final match = columnMatches[i];
    final minCenter = prev + BracketLayoutMetrics.cardHeight + _adjacentGap;
    final centerY = math.max(centers[i], minCenter);
    prev = centerY;
    centerOf?[match.matchNumber] = centerY;

    final node = BracketLayoutNode(
      matchId: match.id,
      columnKey: key,
      slotIndex: i,
      position: Offset(x, centerY - BracketLayoutMetrics.cardHeight / 2),
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

/// Coluna fora dos tracks em slots fixos (3º lugar e afins).
void _placeFixedColumn({
  required List<TournamentMatch> columnMatches,
  required double trackTop,
  required int columnIndex,
  required List<BracketLayoutNode> nodes,
  required List<BracketLayoutColumn> columns,
  required Map<int, BracketLayoutNode> nodeByMatchNumber,
  required Set<String> usedColumnKeys,
}) {
  final sorted = [...columnMatches]
    ..sort((a, b) => a.matchNumber.compareTo(b.matchNumber));
  _applyColumn(
    columnMatches: sorted,
    centers: [
      for (var i = 0; i < sorted.length; i++)
        trackTop +
            BracketLayoutMetrics.columnHeaderHeight +
            (2 * i + 1) * BracketLayoutMetrics.rowUnit,
    ],
    trackTop: trackTop,
    columnIndex: columnIndex,
    nodes: nodes,
    columns: columns,
    nodeByMatchNumber: nodeByMatchNumber,
    usedColumnKeys: usedColumnKeys,
  );
}

/// Final centralizada verticalmente na altura MEDIDA do track da WB.
void _placeFinalColumn({
  required List<TournamentMatch> columnMatches,
  required double trackTop,
  required double trackBottom,
  required int columnIndex,
  required List<BracketLayoutNode> nodes,
  required List<BracketLayoutColumn> columns,
  required Map<int, BracketLayoutNode> nodeByMatchNumber,
  required Set<String> usedColumnKeys,
}) {
  final sorted = [...columnMatches]
    ..sort((a, b) => a.matchNumber.compareTo(b.matchNumber));
  final contentTop = trackTop + BracketLayoutMetrics.columnHeaderHeight;
  _applyColumn(
    columnMatches: sorted,
    centers: [
      for (var i = 0; i < sorted.length; i++)
        contentTop +
            (trackBottom - contentTop) / 2 +
            i * BracketLayoutMetrics.rowUnit,
    ],
    trackTop: trackTop,
    columnIndex: columnIndex,
    nodes: nodes,
    columns: columns,
    nodeByMatchNumber: nodeByMatchNumber,
    usedColumnKeys: usedColumnKeys,
  );
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
    if (type != 'wb' && type != 'lb') continue;
    final dest = m.winnerAdvanceMatchNumber;
    if (dest == null) continue;
    final target = byNumber[dest];
    if (target == null || target.matchType.trim().toLowerCase() != type) {
      continue;
    }
    if (!nodeByMatchNumber.containsKey(m.matchNumber) ||
        !nodeByMatchNumber.containsKey(dest)) {
      continue;
    }
    edges.add(BracketLayoutEdge(fromMatchId: m.id, toMatchId: target.id));
  }
  return edges;
}
