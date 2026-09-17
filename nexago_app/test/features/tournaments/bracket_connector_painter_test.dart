// nexago_app/test/features/tournaments/bracket_connector_painter_test.dart
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/double_elimination_bracket_layout.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/bracket/bracket_connector_painter.dart';

import 'bracket_plants_fixture.dart';

void main() {
  testWidgets('conector da LB sai pela esquerda do card de origem',
      (tester) async {
    // Origem à DIREITA do destino: é o sentido da LB na forma convergente.
    const origem = BracketLayoutNode(
      matchId: 'lb',
      columnKey: 'LB:1',
      slotIndex: 0,
      position: Offset(600, 100),
      size: Size(
        BracketLayoutMetrics.cardWidth,
        BracketLayoutMetrics.cardHeight,
      ),
      isFinal: false,
    );
    const destino = BracketLayoutNode(
      matchId: 'centro',
      columnKey: 'WB:4',
      slotIndex: 0,
      position: Offset(200, 100),
      size: Size(
        BracketLayoutMetrics.cardWidth,
        BracketLayoutMetrics.cardHeight,
      ),
      isFinal: false,
    );
    final layout = DoubleEliminationBracketLayout(
      nodes: const [origem, destino],
      edges: const [BracketLayoutEdge(fromMatchId: 'lb', toMatchId: 'centro')],
      columns: const [],
      canvasSize: const Size(1000, 400),
    );
    final painter = BracketConnectorPainter(
      layout: layout,
      nodeByMatchId: {'lb': origem, 'centro': destino},
    );

    final recorder = PictureRecorder();
    painter.paint(Canvas(recorder), const Size(1000, 400));
    final picture = recorder.endRecording();
    expect(picture, isNotNull);

    // O contrato observável: a linha começa na borda ESQUERDA da origem (600)
    // e termina na borda DIREITA do destino (200 + 280 = 480).
    expect(painter.debugStartFor(origem, destino).dx, 600);
    expect(painter.debugEndFor(origem, destino).dx, 480);
  });

  testWidgets('conector padrão (WB) continua saindo pela direita',
      (tester) async {
    const origem = BracketLayoutNode(
      matchId: 'wb',
      columnKey: 'WB:1',
      slotIndex: 0,
      position: Offset(20, 100),
      size: Size(
        BracketLayoutMetrics.cardWidth,
        BracketLayoutMetrics.cardHeight,
      ),
      isFinal: false,
    );
    const destino = BracketLayoutNode(
      matchId: 'wb2',
      columnKey: 'WB:2',
      slotIndex: 0,
      position: Offset(356, 100),
      size: Size(
        BracketLayoutMetrics.cardWidth,
        BracketLayoutMetrics.cardHeight,
      ),
      isFinal: false,
    );
    final painter = BracketConnectorPainter(
      layout: const DoubleEliminationBracketLayout(
        nodes: [],
        edges: [],
        columns: [],
        canvasSize: Size.zero,
      ),
      nodeByMatchId: const {},
    );
    expect(painter.debugStartFor(origem, destino).dx, 300);
    expect(painter.debugEndFor(origem, destino).dx, 356);
  });

  testWidgets(
      'lado sem alimentador não desenha traço nenhum: a chave de 12 só tem '
      'aresta entre cards', (tester) async {
    // O bye da WB (#5 recebe o seed 2) e a entrada do perdedor na LB (#17
    // recebe P15) continuam RESERVANDO o lugar que empurra o jogo para a
    // altura certa — mas não viram mais linha (pedido do dono: nada de traço
    // sobrando onde não há partida). Toda aresta desenhada liga dois cards.
    final plants = loadBracketPlants();
    final layout = buildDoubleEliminationBracketLayout(plants[12]!);
    final ids = {for (final n in layout.nodes) n.matchId};
    for (final edge in layout.edges) {
      expect(ids, contains(edge.fromMatchId));
      expect(ids, contains(edge.toMatchId));
    }
  });

  test(
      'plantas que cruzam (10, 12, 32): nenhuma aresta de mesma coluna sobra '
      'no desenho', () {
    // O contorno "por fora" (`debugDetourXFor`, removido) só existia porque
    // a partida de cruzamento entrava na Final NA MESMA coluna central
    // (plantas 10/12/32). Agora a Final não recebe mais nenhuma aresta em
    // chave de dupla eliminação (pedido do dono) e mora numa coluna vizinha,
    // não mais na central — não deveria sobrar nenhuma aresta de mesma
    // coluna em nenhuma das três.
    for (final plantId in [10, 12, 32]) {
      final plants = loadBracketPlants();
      final layout = buildDoubleEliminationBracketLayout(plants[plantId]!);
      final nodeByMatchId = {for (final n in layout.nodes) n.matchId: n};
      for (final edge in layout.edges) {
        final from = nodeByMatchId[edge.fromMatchId];
        final to = nodeByMatchId[edge.toMatchId];
        if (from == null || to == null) continue;
        expect((from.position.dx - to.position.dx).abs(), greaterThan(1),
            reason: 'planta $plantId: ${edge.fromMatchId} → '
                '${edge.toMatchId} ainda é uma aresta de mesma coluna');
      }
    }
  });
}
