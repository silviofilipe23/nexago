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

  final nodes = <BracketLayoutNode>[];
  final columns = <BracketLayoutColumn>[];
  final nodeByMatchId = <String, BracketLayoutNode>{};

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

  final wbTrackHeight = _trackHeightForKeys(wbKeys, byColumn);

  _placeTrack(
    keys: wbKeys,
    byColumn: byColumn,
    trackTop: BracketLayoutMetrics.canvasPadding,
    nodes: nodes,
    columns: columns,
    nodeByMatchId: nodeByMatchId,
    startColumnIndex: 0,
  );

  var nextColumnIndex = wbKeys.length;
  for (final key in otherKeys) {
    _placeColumn(
      key: key,
      byColumn: byColumn,
      trackTop: BracketLayoutMetrics.canvasPadding,
      columnIndex: nextColumnIndex,
      nodes: nodes,
      columns: columns,
      nodeByMatchId: nodeByMatchId,
    );
    nextColumnIndex++;
  }

  for (final key in finalKeys) {
    _placeFinalColumn(
      key: key,
      byColumn: byColumn,
      trackTop: BracketLayoutMetrics.canvasPadding,
      trackHeight: wbTrackHeight,
      columnIndex: wbKeys.length + otherKeys.length,
      nodes: nodes,
      columns: columns,
      nodeByMatchId: nodeByMatchId,
    );
  }

  final lbTop = BracketLayoutMetrics.canvasPadding +
      wbTrackHeight +
      BracketLayoutMetrics.wbLbGap;
  _placeTrack(
    keys: lbKeys,
    byColumn: byColumn,
    trackTop: lbTop,
    nodes: nodes,
    columns: columns,
    nodeByMatchId: nodeByMatchId,
    startColumnIndex: 0,
  );

  final edges = _buildIntraBracketEdges(byColumn, nodeByMatchId);

  var maxX = BracketLayoutMetrics.canvasPadding;
  var maxY = BracketLayoutMetrics.canvasPadding;
  for (final node in nodes) {
    maxX = maxX > node.position.dx + node.size.width
        ? maxX
        : node.position.dx + node.size.width;
    maxY = maxY > node.position.dy + node.size.height
        ? maxY
        : node.position.dy + node.size.height;
  }
  for (final column in columns) {
    maxX = maxX > column.headerPosition.dx + BracketLayoutMetrics.cardWidth
        ? maxX
        : column.headerPosition.dx + BracketLayoutMetrics.cardWidth;
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

double _trackHeightForKeys(
  List<String> keys,
  Map<String, List<TournamentMatch>> byColumn,
) {
  if (keys.isEmpty) return 0;
  final firstCount = byColumn[keys.first]!.length;
  final leafCount = firstCount < 1 ? 1 : firstCount;
  return BracketLayoutMetrics.columnHeaderHeight +
      (2 * leafCount) * BracketLayoutMetrics.rowUnit;
}

void _placeTrack({
  required List<String> keys,
  required Map<String, List<TournamentMatch>> byColumn,
  required double trackTop,
  required List<BracketLayoutNode> nodes,
  required List<BracketLayoutColumn> columns,
  required Map<String, BracketLayoutNode> nodeByMatchId,
  required int startColumnIndex,
}) {
  for (var col = 0; col < keys.length; col++) {
    _placeColumn(
      key: keys[col],
      byColumn: byColumn,
      trackTop: trackTop,
      columnIndex: startColumnIndex + col,
      roundIndex: col,
      nodes: nodes,
      columns: columns,
      nodeByMatchId: nodeByMatchId,
    );
  }
}

void _placeColumn({
  required String key,
  required Map<String, List<TournamentMatch>> byColumn,
  required double trackTop,
  required int columnIndex,
  required List<BracketLayoutNode> nodes,
  required List<BracketLayoutColumn> columns,
  required Map<String, BracketLayoutNode> nodeByMatchId,
  int roundIndex = 0,
}) {
  final groupMatches = [...byColumn[key]!]
    ..sort((a, b) => a.matchNumber.compareTo(b.matchNumber));
  final type = groupMatches.first.matchType.trim().toLowerCase();
  final x = BracketLayoutMetrics.canvasPadding +
      columnIndex * (BracketLayoutMetrics.cardWidth + BracketLayoutMetrics.columnGap);

  columns.add(
    BracketLayoutColumn(
      key: key,
      label: bracketColumnHeaderLabel(groupMatches.first),
      matchIds: groupMatches.map((m) => m.id).toList(),
      headerPosition: Offset(x, trackTop),
    ),
  );

  for (var i = 0; i < groupMatches.length; i++) {
    final match = groupMatches[i];
    final centerY = trackTop +
        BracketLayoutMetrics.columnHeaderHeight +
        _bracketMatchCenterY(roundIndex: roundIndex, matchIndex: i);
    final y = centerY - BracketLayoutMetrics.cardHeight / 2;

    final node = BracketLayoutNode(
      matchId: match.id,
      columnKey: key,
      slotIndex: i,
      position: Offset(x, y),
      size: const Size(
        BracketLayoutMetrics.cardWidth,
        BracketLayoutMetrics.cardHeight,
      ),
      isFinal: type == 'final',
    );
    nodes.add(node);
    nodeByMatchId[match.id] = node;
  }
}

void _placeFinalColumn({
  required String key,
  required Map<String, List<TournamentMatch>> byColumn,
  required double trackTop,
  required double trackHeight,
  required int columnIndex,
  required List<BracketLayoutNode> nodes,
  required List<BracketLayoutColumn> columns,
  required Map<String, BracketLayoutNode> nodeByMatchId,
}) {
  final groupMatches = [...byColumn[key]!]
    ..sort((a, b) => a.matchNumber.compareTo(b.matchNumber));
  final x = BracketLayoutMetrics.canvasPadding +
      columnIndex * (BracketLayoutMetrics.cardWidth + BracketLayoutMetrics.columnGap);
  final contentTop = trackTop + BracketLayoutMetrics.columnHeaderHeight;
  final contentHeight = trackHeight - BracketLayoutMetrics.columnHeaderHeight;

  columns.add(
    BracketLayoutColumn(
      key: key,
      label: bracketColumnHeaderLabel(groupMatches.first),
      matchIds: groupMatches.map((m) => m.id).toList(),
      headerPosition: Offset(x, trackTop),
    ),
  );

  for (var i = 0; i < groupMatches.length; i++) {
    final match = groupMatches[i];
    final centerY = contentTop + contentHeight / 2 + i * BracketLayoutMetrics.rowUnit;
    final y = centerY - BracketLayoutMetrics.cardHeight / 2;

    final node = BracketLayoutNode(
      matchId: match.id,
      columnKey: key,
      slotIndex: i,
      position: Offset(x, y),
      size: const Size(
        BracketLayoutMetrics.cardWidth,
        BracketLayoutMetrics.cardHeight,
      ),
      isFinal: true,
    );
    nodes.add(node);
    nodeByMatchId[match.id] = node;
  }
}

double _bracketMatchCenterY({
  required int roundIndex,
  required int matchIndex,
}) {
  final unit = BracketLayoutMetrics.rowUnit;
  return (2 * matchIndex + 1) * (1 << roundIndex) * unit;
}

List<BracketLayoutEdge> _buildIntraBracketEdges(
  Map<String, List<TournamentMatch>> byColumn,
  Map<String, BracketLayoutNode> nodeByMatchId,
) {
  final edges = <BracketLayoutEdge>[];

  for (final type in ['WB', 'LB']) {
    final keys = byColumn.keys.where((k) {
      return byColumn[k]!.first.matchType.trim().toUpperCase() == type;
    }).toList()
      ..sort((a, b) {
        return byColumn[a]!.first.round.compareTo(byColumn[b]!.first.round);
      });

    for (var col = 0; col < keys.length - 1; col++) {
      final fromMatches = [...byColumn[keys[col]]!]
        ..sort((a, b) => a.matchNumber.compareTo(b.matchNumber));
      final toMatches = [...byColumn[keys[col + 1]]!]
        ..sort((a, b) => a.matchNumber.compareTo(b.matchNumber));

      for (var i = 0; i < fromMatches.length; i++) {
        final toIndex = i ~/ 2;
        if (toIndex >= toMatches.length) continue;
        final fromId = fromMatches[i].id;
        final toId = toMatches[toIndex].id;
        if (nodeByMatchId.containsKey(fromId) &&
            nodeByMatchId.containsKey(toId)) {
          edges.add(BracketLayoutEdge(fromMatchId: fromId, toMatchId: toId));
        }
      }
    }
  }

  return edges;
}
