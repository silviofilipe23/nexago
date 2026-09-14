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
}
