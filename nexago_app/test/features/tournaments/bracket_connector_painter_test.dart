// nexago_app/test/features/tournaments/bracket_connector_painter_test.dart
import 'dart:ui';

import 'package:flutter/material.dart';
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
      size: Size(280, 150),
      isFinal: false,
    );
    const destino = BracketLayoutNode(
      matchId: 'centro',
      columnKey: 'WB:4',
      slotIndex: 0,
      position: Offset(200, 100),
      size: Size(280, 150),
      isFinal: false,
    );
    final layout = DoubleEliminationBracketLayout(
      nodes: const [origem, destino],
      edges: const [BracketLayoutEdge(fromMatchId: 'lb', toMatchId: 'centro')],
      columns: const [],
      emptySlots: const [],
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
      size: Size(280, 150),
      isFinal: false,
    );
    const destino = BracketLayoutNode(
      matchId: 'wb2',
      columnKey: 'WB:2',
      slotIndex: 0,
      position: Offset(356, 100),
      size: Size(280, 150),
      isFinal: false,
    );
    final painter = BracketConnectorPainter(
      layout: const DoubleEliminationBracketLayout(
        nodes: [],
        edges: [],
        columns: [],
        emptySlots: [],
        canvasSize: Size.zero,
      ),
      nodeByMatchId: const {},
    );
    expect(painter.debugStartFor(origem, destino).dx, 300);
    expect(painter.debugEndFor(origem, destino).dx, 356);
  });

  testWidgets('a linha livre do bye é desenhada na chave de 12',
      (tester) async {
    final plants = loadBracketPlants();
    final layout = buildDoubleEliminationBracketLayout(plants[12]!);
    // #5 recebe o seed 2 (bye): tem um lado livre, e ele corre para a ESQUERDA
    // porque #5 está na WB.
    final doJogo5 = layout.emptySlots.where((s) => s.matchId == 'm5').toList();
    expect(doJogo5, hasLength(1));
    expect(doJogo5.single.to.dx, lessThan(doJogo5.single.from.dx));

    // #17 recebe P15: lado livre correndo para a DIREITA, porque está na LB.
    final doJogo17 =
        layout.emptySlots.where((s) => s.matchId == 'm17').toList();
    expect(doJogo17, hasLength(1));
    expect(doJogo17.single.to.dx, greaterThan(doJogo17.single.from.dx));
  });

  test(
      'sintético: o desvio do contorno de mesma coluna não cai na metade do '
      'gap que as arestas vizinhas usam', () {
    const cardWidth = BracketLayoutMetrics.cardWidth;
    const gap = BracketLayoutMetrics.columnGap;
    // Reproduz o formato das plantas 10/12/32: a coluna LB (vizinha, à
    // direita) alimenta um cruzamento na coluna central (DESFECHO), que por
    // sua vez avança para a Final NA MESMA coluna central — os mesmos
    // números da planta 12 real (#17→#19 e #19→#22).
    const central = BracketLayoutNode(
      matchId: 'cruzamento',
      columnKey: 'DESFECHO',
      slotIndex: 0,
      position: Offset(1032, 100),
      size: Size(cardWidth, 150),
      isFinal: false,
    );
    const finalNode = BracketLayoutNode(
      matchId: 'final',
      columnKey: 'DESFECHO',
      slotIndex: 1,
      position: Offset(1032, 300),
      size: Size(cardWidth, 150),
      isFinal: true,
    );
    const vizinha = BracketLayoutNode(
      matchId: 'lb3',
      columnKey: 'LB:3',
      slotIndex: 0,
      position: Offset(1032 + cardWidth + gap, 100),
      size: Size(cardWidth, 150),
      isFinal: false,
    );
    final painter = BracketConnectorPainter(
      layout: const DoubleEliminationBracketLayout(
        nodes: [],
        edges: [],
        columns: [],
        emptySlots: [],
        canvasSize: Size.zero,
      ),
      nodeByMatchId: const {},
    );

    // midX real de QUALQUER aresta entre colunas vizinhas: metade exata do
    // gap entre as duas bordas internas — não é específico desta aresta, é
    // como `debugStartFor`/`debugEndFor` sempre ficam a `columnGap` um do
    // outro.
    final startAdjacente = painter.debugStartFor(vizinha, central);
    final endAdjacente = painter.debugEndFor(vizinha, central);
    final midXAdjacente =
        startAdjacente.dx + (endAdjacente.dx - startAdjacente.dx) / 2;
    final bordaCentral = central.position.dx + central.size.width;
    expect(midXAdjacente, closeTo(bordaCentral + gap / 2, 0.001));

    // O desvio do contorno cruzamento→final NÃO pode cair nesse mesmo x — é
    // exatamente o defeito da revisão: os dois desenhavam o segmento
    // vertical em `bordaCentral + gap/2` e o traço virava um cano contínuo
    // perto do card do cruzamento.
    final desvioContorno = painter.debugDetourXFor(central);
    expect(desvioContorno, isNot(closeTo(midXAdjacente, 0.001)));
    // Trava explícita: falha se alguém voltar a fração do desvio para
    // metade do gap.
    expect(desvioContorno, isNot(closeTo(bordaCentral + gap / 2, 0.001)));
    // Não regride: ainda por FORA da coluna (depois da borda direita do
    // cruzamento) e sem invadir a coluna vizinha (antes da borda dela).
    expect(desvioContorno, greaterThan(bordaCentral));
    expect(desvioContorno, lessThan(vizinha.position.dx));
    // Ainda sai e entra pela mesma borda direita (não regride a Task 8).
    expect(finalNode.position.dx + finalNode.size.width, bordaCentral);
  });

  for (final plantId in [10, 12, 32]) {
    test(
        'planta $plantId: nenhum segmento vertical de contorno coincide com '
        'o midX de uma aresta vizinha', () {
      final plants = loadBracketPlants();
      final layout = buildDoubleEliminationBracketLayout(plants[plantId]!);
      final nodeByMatchId = {for (final n in layout.nodes) n.matchId: n};
      final painter = BracketConnectorPainter(
        layout: layout,
        nodeByMatchId: nodeByMatchId,
      );

      final verticaisContorno = <double>[];
      final verticaisAdjacentes = <double>[];
      for (final edge in layout.edges) {
        final from = nodeByMatchId[edge.fromMatchId];
        final to = nodeByMatchId[edge.toMatchId];
        if (from == null || to == null) continue;
        if ((from.position.dx - to.position.dx).abs() < 1) {
          verticaisContorno.add(painter.debugDetourXFor(from));
        } else {
          final start = painter.debugStartFor(from, to);
          final end = painter.debugEndFor(from, to);
          verticaisAdjacentes.add(start.dx + (end.dx - start.dx) / 2);
        }
      }

      // Confirma que a planta realmente exercita os dois casos lado a lado
      // — senão a checagem abaixo passaria vazia sem testar nada.
      expect(verticaisContorno, isNotEmpty);
      expect(verticaisAdjacentes, isNotEmpty);

      for (final x in verticaisContorno) {
        for (final y in verticaisAdjacentes) {
          expect((x - y).abs(), greaterThan(1),
              reason: 'contorno em $x coincide com aresta adjacente em $y');
        }
      }
    });
  }
}
