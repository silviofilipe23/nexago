import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/bracket_feed_tree.dart';
import 'package:nexago_app/features/tournaments/domain/double_elimination_bracket_layout.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';

import 'bracket_plants_fixture.dart';

TournamentMatch _match({
  required String id,
  String matchType = 'WB',
  int round = 1,
  int matchNumber = 0,
  int? advanceTo,
  String? advanceSlot,
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: 'cat-a',
    round: round,
    matchType: matchType,
    poolId: '',
    teamAId: 'a$id',
    teamBId: 'b$id',
    status: 'Scheduled',
    resultA: '',
    resultB: '',
    isGroupMatch: false,
    matchNumber: matchNumber,
    winnerAdvanceMatchNumber: advanceTo,
    winnerAdvanceSlot: advanceSlot,
  );
}

void main() {
  // Planta de 6 duplas (`functions/src/bracket-definitions/bracket-6-teams.ts`):
  // fiação irregular — #1 alimenta o slot B do #3, #2 alimenta o slot A do #4.
  final sixTeamPlan = [
    _match(
        id: 'w1',
        matchType: 'WB',
        round: 1,
        matchNumber: 1,
        advanceTo: 3,
        advanceSlot: 'B'),
    _match(
        id: 'w2',
        matchType: 'WB',
        round: 1,
        matchNumber: 2,
        advanceTo: 4,
        advanceSlot: 'A'),
    _match(
        id: 'w3',
        matchType: 'WB',
        round: 2,
        matchNumber: 3,
        advanceTo: 7,
        advanceSlot: 'A'),
    _match(
        id: 'w4',
        matchType: 'WB',
        round: 2,
        matchNumber: 4,
        advanceTo: 7,
        advanceSlot: 'B'),
    _match(
        id: 'l5',
        matchType: 'LB',
        round: 1,
        matchNumber: 5,
        advanceTo: 8,
        advanceSlot: 'A'),
    _match(
        id: 'l6',
        matchType: 'LB',
        round: 1,
        matchNumber: 6,
        advanceTo: 8,
        advanceSlot: 'B'),
    _match(
        id: 'w7',
        matchType: 'WB',
        round: 3,
        matchNumber: 7,
        advanceTo: 11,
        advanceSlot: 'B'),
    _match(
        id: 'l8',
        matchType: 'LB',
        round: 2,
        matchNumber: 8,
        advanceTo: 9,
        advanceSlot: 'B'),
    _match(
        id: 'l9',
        matchType: 'LB',
        round: 3,
        matchNumber: 9,
        advanceTo: 11,
        advanceSlot: 'A'),
    _match(id: 'tp', matchType: 'Third Place', round: 1, matchNumber: 10),
    _match(id: 'gf', matchType: 'Final', round: 1, matchNumber: 11),
  ];

  BracketLayoutNode nodeOf(DoubleEliminationBracketLayout layout, String id) =>
      layout.nodes.firstWhere((n) => n.matchId == id);

  double centerY(BracketLayoutNode node) =>
      node.position.dy + node.size.height / 2;

  test('WB à esquerda do centro, LB à direita, convergência no meio', () {
    final plants = loadBracketPlants();
    final layout = buildDoubleEliminationBracketLayout(plants[12]!);

    double xOf(int n) =>
        layout.nodes.firstWhere((node) => node.matchId == 'm$n').position.dx;

    // #16 (quarta da WB) → #19 (semifinal) ← #17 (LB)
    expect(xOf(16), lessThan(xOf(19)));
    expect(xOf(17), greaterThan(xOf(19)));
    // A LB corre da direita para o centro: a R1 fica na ponta direita.
    expect(xOf(11), greaterThan(xOf(14)));
    expect(xOf(14), greaterThan(xOf(17)));
  });

  test('a semifinal fica na média vertical dos seus dois alimentadores', () {
    final plants = loadBracketPlants();
    final layout = buildDoubleEliminationBracketLayout(plants[12]!);
    double cy(int n) {
      final node = layout.nodes.firstWhere((x) => x.matchId == 'm$n');
      return node.position.dy + node.size.height / 2;
    }

    expect(cy(19), closeTo((cy(16) + cy(17)) / 2, 0.01));
    expect(cy(20), closeTo((cy(15) + cy(18)) / 2, 0.01));
  });

  test(
      'partida de cruzamento fica na média dos alimentadores mesmo com '
      'Final/3º lugar espremidos entre elas — planta 10', () {
    final plants = loadBracketPlants();
    final layout = buildDoubleEliminationBracketLayout(plants[10]!);
    double cy(int n) {
      final node = layout.nodes.firstWhere((x) => x.matchId == 'm$n');
      return node.position.dy + node.size.height / 2;
    }

    // #15 e #16 são as partidas de cruzamento (WB×LB) da planta 10, empilhadas
    // pelo `slotCursor` sem folga reservada entre blocos (a folga foi
    // removida — Final e 3º lugar não moram mais nesta faixa central; ver
    // comentário em `buildDoubleEliminationBracketLayout`). #17 (3º lugar) e
    // #18 (Final) não têm árvore própria nesta planta e são posicionadas
    // DEPOIS, fora da sequência do `slotCursor`, lado a lado nas colunas
    // vizinhas ao centro (a Final na 2, o 3º lugar na 4 — a coluna central é
    // a 3, exclusiva das partidas de cruzamento). Por estarem fora dessa
    // sequência, #17/#18 nunca podem empurrar #15 ou #16 pra fora da média
    // exata dos seus dois alimentadores — é isso que este teste protege.
    expect(cy(15), closeTo((cy(11) + cy(13)) / 2, 0.01));
    expect(cy(16), closeTo((cy(12) + cy(14)) / 2, 0.01));
  });

  test('nenhum par de cards se sobrepõe em nenhuma das 25 plantas', () {
    final plants = loadBracketPlants();
    for (final entry in plants.entries) {
      final layout = buildDoubleEliminationBracketLayout(entry.value);
      for (var i = 0; i < layout.nodes.length; i++) {
        for (var j = i + 1; j < layout.nodes.length; j++) {
          final a = layout.nodes[i];
          final b = layout.nodes[j];
          // Cards separados se não se tocam em X OU não se tocam em Y.
          final separados = a.position.dx + a.size.width <= b.position.dx ||
              b.position.dx + b.size.width <= a.position.dx ||
              a.position.dy + a.size.height <= b.position.dy ||
              b.position.dy + b.size.height <= a.position.dy;
          expect(
            separados,
            isTrue,
            reason: 'planta ${entry.key}: ${a.matchId} e ${b.matchId} '
                'se sobrepõem',
          );
        }
      }
    }
  });

  test(
      'toda partida de cruzamento fica na média dos alimentadores, '
      'nas 25 plantas', () {
    final plants = loadBracketPlants();
    for (final entry in plants.entries) {
      final matches = entry.value;
      final layout = buildDoubleEliminationBracketLayout(matches);
      final convergencia = bracketConvergenceMatches(matches);
      final centerYById = {
        for (final node in layout.nodes)
          node.matchId: node.position.dy + node.size.height / 2,
      };
      final alimentadores = <int, List<int>>{};
      for (final m in matches) {
        final dest = m.winnerAdvanceMatchNumber;
        if (dest == null) continue;
        (alimentadores[dest] ??= <int>[]).add(m.matchNumber);
      }
      for (final destino in convergencia) {
        final fontes = alimentadores[destino];
        if (fontes == null || fontes.length != 2) continue;
        // Uma partida de convergência alimentada por OUTRA partida de
        // convergência (a Final nas plantas 10/12/32, alimentada pelas DUAS
        // partidas de cruzamento) não é ela mesma o cruzamento — quem cruza
        // são as fontes. Ela é posicionada pela guarda de colisão (coberta
        // pelo teste de overlap acima), não por esta média.
        if (fontes.every(convergencia.contains)) continue;
        final cyDestino = centerYById['m$destino'];
        final cyA = centerYById['m${fontes[0]}'];
        final cyB = centerYById['m${fontes[1]}'];
        if (cyDestino == null || cyA == null || cyB == null) continue;
        expect(
          cyDestino,
          closeTo((cyA + cyB) / 2, 0.5),
          reason: 'planta ${entry.key}: #$destino não está na média de '
              '$fontes',
        );
      }
    }
  });

  test('as duas semifinais não colidem', () {
    final plants = loadBracketPlants();
    final layout = buildDoubleEliminationBracketLayout(plants[12]!);
    final a = layout.nodes.firstWhere((n) => n.matchId == 'm19');
    final b = layout.nodes.firstWhere((n) => n.matchId == 'm20');
    expect((a.position.dy - b.position.dy).abs(),
        greaterThanOrEqualTo(a.size.height));
  });

  test('o jogo com bye desloca — não cola na altura do alimentador', () {
    final plants = loadBracketPlants();
    final layout = buildDoubleEliminationBracketLayout(plants[12]!);
    double cy(int n) {
      final node = layout.nodes.firstWhere((x) => x.matchId == 'm$n');
      return node.position.dy + node.size.height / 2;
    }

    // #5 recebe o seed 2 (bye) e o vencedor do #1. Se colasse no #1, os dois
    // teriam o mesmo centro — o bug que o desenho antigo tinha.
    expect(cy(5), isNot(closeTo(cy(1), 0.01)));
    expect(cy(5), lessThan(cy(1)));
  });

  test(
      'columns follow the convergent order — WB left-to-right, Final no '
      'centro, 3º lugar em coluna própria ADJACENTE (empurra a LB), LB '
      'right-to-left', () {
    final layout = buildDoubleEliminationBracketLayout(sixTeamPlan);

    expect(layout.nodes, hasLength(11));
    // Nesta planta a Final converge direto (feita por w7 e l9 — um
    // alimentador de cada chave), então fica sozinha na coluna central; o
    // vizinho dela do lado LB (`centerColumn + 1`) já tem o próprio
    // alimentador LB da Final na mesma altura — nunca cabe o 3º lugar
    // junto. Cai na coluna própria do dono: inserida ADJACENTE à Final,
    // empurrando a LB inteira uma casa pra fora — não anexada no fim da
    // chave — mas na MESMA altura da Final.
    expect(
      layout.columns.map((c) => c.label),
      [
        'WB · RODADA 1',
        'WB · RODADA 2',
        'WB · RODADA 3',
        'FINAL',
        '3º LUGAR',
        'LB · RODADA 3',
        'LB · RODADA 2',
        'LB · RODADA 1',
      ],
    );
    expect(nodeOf(layout, 'gf').columnKey, 'Final');
    expect(nodeOf(layout, 'tp').columnKey, 'Third Place');
    expect(centerY(nodeOf(layout, 'tp')),
        closeTo(centerY(nodeOf(layout, 'gf')), 0.01));
    // Adjacente de verdade: só uma largura de coluna entre as duas.
    const passo =
        BracketLayoutMetrics.cardWidth + BracketLayoutMetrics.columnGap;
    expect(
      nodeOf(layout, 'tp').position.dx - nodeOf(layout, 'gf').position.dx,
      closeTo(passo, 0.01),
    );
    expect(layout.canvasSize.width, greaterThan(0));
    expect(layout.canvasSize.height, greaterThan(0));
  });

  test(
      'planta 12: Final e 3º lugar dividem as colunas vizinhas ao centro, '
      'na mesma altura — Final à esquerda, 3º lugar à direita', () {
    // O exemplo do dono: a coluna das quartas (que alimentam o cruzamento)
    // tem um vão vertical de sobra — a Final cabe nele. A coluna da LB R3
    // tem o mesmo vão — o 3º lugar cabe nela. Ordem da folha impressa do
    // Goiânia Open ("22 - FINAL" à esquerda, "21 - 3º Lugar" à direita).
    // Nenhuma delas ganha coluna nova, e a LB não é empurrada.
    final plants = loadBracketPlants();
    final layout = buildDoubleEliminationBracketLayout(plants[12]!);

    final terceiro = nodeOf(layout, 'm21'); // 3º lugar
    final final_ = nodeOf(layout, 'm22'); // Final
    final quartaWb = nodeOf(layout, 'm15'); // quarta que alimenta o cruzamento
    final lbR3 = nodeOf(layout, 'm17'); // LB R3 que alimenta o cruzamento

    // Final na coluna da quarta (à esquerda do centro), 3º lugar na coluna
    // da LB R3 (à direita) — não uma coluna nova.
    expect(final_.position.dx, quartaWb.position.dx);
    expect(terceiro.position.dx, lbR3.position.dx);
    expect(final_.position.dx, lessThan(terceiro.position.dx));

    // Mesma linha horizontal — o pedido do dono.
    expect(centerY(terceiro), closeTo(centerY(final_), 0.01));

    // Nenhum card se sobrepõe: nem com a quarta, nem com a LB R3.
    bool separados(BracketLayoutNode a, BracketLayoutNode b) =>
        a.position.dx + a.size.width <= b.position.dx ||
        b.position.dx + b.size.width <= a.position.dx ||
        a.position.dy + a.size.height <= b.position.dy ||
        b.position.dy + b.size.height <= a.position.dy;
    for (final n in layout.nodes) {
      if (n.matchId == 'm21' || n.matchId == 'm22') continue;
      expect(separados(terceiro, n), isTrue,
          reason: '3º lugar se sobrepõe a ${n.matchId}');
      expect(separados(final_, n), isTrue,
          reason: 'Final se sobrepõe a ${n.matchId}');
    }
  });

  test(
      'toda planta: Final à esquerda do 3º lugar, mesma linha horizontal, '
      'colunas vizinhas ou separadas só pela coluna de cruzamento', () {
    final plants = loadBracketPlants();
    const passo =
        BracketLayoutMetrics.cardWidth + BracketLayoutMetrics.columnGap;
    for (final entry in plants.entries) {
      final matches = entry.value;
      final layout = buildDoubleEliminationBracketLayout(matches);
      final convergencia = bracketConvergenceMatches(matches);
      final byNumber = {for (final m in matches) m.matchNumber: m};
      int? finalNum;
      int? thirdNum;
      for (final n in convergencia) {
        final tipo = byNumber[n]!.matchType.trim().toLowerCase();
        if (tipo == 'final') finalNum = n;
        if (tipo == 'third place') thirdNum = n;
      }
      if (finalNum == null || thirdNum == null) continue;
      final finalNode = nodeOf(layout, 'm$finalNum');
      final thirdNode = nodeOf(layout, 'm$thirdNum');

      // Ordem da folha impressa: Final sempre à esquerda do 3º lugar.
      expect(
        finalNode.position.dx,
        lessThan(thirdNode.position.dx),
        reason: 'planta ${entry.key}: Final não está à esquerda do 3º lugar',
      );
      // Mesma linha horizontal.
      expect(
        centerY(thirdNode),
        closeTo(centerY(finalNode), 0.01),
        reason: 'planta ${entry.key}: 3º lugar e Final não estão na mesma '
            'linha',
      );
      // Lado a lado de verdade: vizinhas (1 passo — a Final converge
      // direto e ficam adjacentes) ou separadas só pela coluna de
      // cruzamento (2 passos — plantas 10, 12, 32).
      final distancia = thirdNode.position.dx - finalNode.position.dx;
      expect(
        distancia,
        anyOf(closeTo(passo, 0.01), closeTo(passo * 2, 0.01)),
        reason: 'planta ${entry.key}: Final e 3º lugar não estão lado a '
            'lado (distância $distancia)',
      );
    }
  });

  test('planta 25: duas colunas "LB · RODADA 2" recebem keys diferentes', () {
    final plants = loadBracketPlants();
    final layout = buildDoubleEliminationBracketLayout(plants[25]!);

    // #10 é o play-in da LB gravado com o MESMO round (2) da coluna real
    // "LB · RODADA 2" (#19…#26) que ele alimenta — `bracketGroupKey` bate
    // por coincidência de round, mas são colunas (profundidades) diferentes
    // e não podem reivindicar a mesma identidade visual.
    final m10 = nodeOf(layout, 'm10');
    final m19 = nodeOf(layout, 'm19');
    expect(m10.columnKey, isNot(m19.columnKey));

    final keys = layout.columns.map((c) => c.key).toList();
    expect(keys.toSet(), hasLength(keys.length));
  });

  test('eliminatória simples (sem WB/LB): a Final fica à DIREITA das rodadas',
      () {
    // 4 quartas → 2 semis → Final, tipadas 'knockout' + 'Final' — o formato
    // que `tournament_category_view_page.dart` também manda pra esta função
    // (o motor próprio de eliminatória simples, `buildKnockoutTreeLayout`,
    // só existe nos portais web; no app é esta função que serve os dois
    // formatos). Sem nenhuma partida WB/LB, não existe convergência a
    // ancorar: cai no caminho legado, que ordena por `bracketGroupSortOrder`
    // — rodadas em ordem, Final por último (9000) — em vez de tentar montar
    // a faixa central e jogar a chave inteira pra coluna 0.
    final knockout = [
      _match(
          id: 'qf1',
          matchType: 'knockout',
          round: 1,
          matchNumber: 1,
          advanceTo: 5,
          advanceSlot: 'A'),
      _match(
          id: 'qf2',
          matchType: 'knockout',
          round: 1,
          matchNumber: 2,
          advanceTo: 5,
          advanceSlot: 'B'),
      _match(
          id: 'qf3',
          matchType: 'knockout',
          round: 1,
          matchNumber: 3,
          advanceTo: 6,
          advanceSlot: 'A'),
      _match(
          id: 'qf4',
          matchType: 'knockout',
          round: 1,
          matchNumber: 4,
          advanceTo: 6,
          advanceSlot: 'B'),
      _match(
          id: 'sf1',
          matchType: 'knockout',
          round: 2,
          matchNumber: 5,
          advanceTo: 7,
          advanceSlot: 'A'),
      _match(
          id: 'sf2',
          matchType: 'knockout',
          round: 2,
          matchNumber: 6,
          advanceTo: 7,
          advanceSlot: 'B'),
      _match(id: 'final', matchType: 'Final', round: 1, matchNumber: 7),
    ];
    final layout = buildDoubleEliminationBracketLayout(knockout);

    expect(layout.nodes, hasLength(7));
    double xOf(String id) =>
        layout.nodes.firstWhere((n) => n.matchId == id).position.dx;

    expect(xOf('qf1'), lessThan(xOf('sf1')));
    expect(xOf('qf2'), lessThan(xOf('sf1')));
    expect(xOf('qf3'), lessThan(xOf('sf2')));
    expect(xOf('qf4'), lessThan(xOf('sf2')));
    expect(xOf('sf1'), lessThan(xOf('final')));
    expect(xOf('sf2'), lessThan(xOf('final')));

    // A fiação continua ligando as rodadas entre si e na Final.
    bool hasEdge(String from, String to) =>
        layout.edges.any((e) => e.fromMatchId == from && e.toMatchId == to);
    expect(hasEdge('qf1', 'sf1'), isTrue);
    expect(hasEdge('qf2', 'sf1'), isTrue);
    expect(hasEdge('qf3', 'sf2'), isTrue);
    expect(hasEdge('qf4', 'sf2'), isTrue);
    expect(hasEdge('sf1', 'final'), isTrue);
    expect(hasEdge('sf2', 'final'), isTrue);

    // Cascata: cada rodada na média vertical do par que a alimenta —
    // sem isso a semi cola na 1ª quarta e a Final cola na 1ª semi.
    double cy(String id) {
      final node = layout.nodes.firstWhere((n) => n.matchId == id);
      return node.position.dy + node.size.height / 2;
    }

    expect(cy('sf1'), closeTo((cy('qf1') + cy('qf2')) / 2, 0.01));
    expect(cy('sf2'), closeTo((cy('qf3') + cy('qf4')) / 2, 0.01));
    expect(cy('final'), closeTo((cy('sf1') + cy('sf2')) / 2, 0.01));
  });

  test(
      'alias "Grand Final" é reconhecido como Final em chave de dupla '
      'eliminação', () {
    // A CF grava `matchType` da decisão como "Final" hoje, mas o resto do
    // código (`tournament_matches_logic.dart`, `focus_journey_logic.dart`
    // etc.) já trata "Grand Final"/"grand_final" como sinônimo — o motor de
    // layout não pode ser o único lugar que não reconhece o alias.
    final comAlias = [
      _match(
          id: 'w1',
          matchType: 'WB',
          round: 1,
          matchNumber: 1,
          advanceTo: 4,
          advanceSlot: 'A'),
      _match(
          id: 'w2',
          matchType: 'WB',
          round: 1,
          matchNumber: 2,
          advanceTo: 4,
          advanceSlot: 'B'),
      _match(
          id: 'l3',
          matchType: 'LB',
          round: 1,
          matchNumber: 3,
          advanceTo: 5,
          advanceSlot: 'A'),
      _match(
          id: 'w4',
          matchType: 'WB',
          round: 2,
          matchNumber: 4,
          advanceTo: 7,
          advanceSlot: 'A'),
      _match(
          id: 'l5',
          matchType: 'LB',
          round: 2,
          matchNumber: 5,
          advanceTo: 7,
          advanceSlot: 'B'),
      _match(id: 'tp', matchType: 'Third Place', round: 1, matchNumber: 6),
      _match(id: 'gf', matchType: 'Grand Final', round: 1, matchNumber: 7),
    ];
    final layout = buildDoubleEliminationBracketLayout(comAlias);

    expect(layout.nodes, hasLength(7));
    // Reconhecida como Final: sinalizada, rotulada e sem aresta chegando
    // (dupla eliminação não desenha linha até a Final).
    expect(nodeOf(layout, 'gf').isFinal, isTrue);
    expect(
      layout.columns.firstWhere((c) => c.matchIds.contains('gf')).label,
      'FINAL',
    );
    expect(layout.edges.where((e) => e.toMatchId == 'gf'), isEmpty);
    // Não vira órfã: ganha coluna (própria ou compartilhada) como a Final
    // de verdade ganharia — nunca some pra um canto qualquer da figura.
    expect(
      layout.nodes.firstWhere((n) => n.matchId == 'gf').columnKey,
      isNot('DESFECHO'),
    );
  });

  test(
      'Final cruzada (padrão da planta 12) tipada "Grand Final" não vira '
      'órfã: ganha coluna adjacente ao cruzamento, rotulada FINAL', () {
    // Diferente do teste acima (`comAlias`, onde w4/l5 alimentam a Final com
    // um WB e um LB cada — o atalho que `bracketConvergenceMatches` já
    // acertava mesmo com o bug): aqui os dois alimentadores diretos são
    // "WB" (o padrão real de #19/#20 → #22 na planta 12). Sem o
    // reconhecimento do alias em `bracketConvergenceMatches`, a Final não
    // virava a raiz da Final e sobrava como órfã numa coluna extra à
    // direita de tudo.
    final crossoverFinalPlan = [
      _match(
          id: 'w1',
          matchType: 'WB',
          round: 1,
          matchNumber: 1,
          advanceTo: 5,
          advanceSlot: 'A'),
      _match(
          id: 'l2',
          matchType: 'LB',
          round: 1,
          matchNumber: 2,
          advanceTo: 5,
          advanceSlot: 'B'),
      _match(
          id: 'w3',
          matchType: 'WB',
          round: 1,
          matchNumber: 3,
          advanceTo: 6,
          advanceSlot: 'A'),
      _match(
          id: 'l4',
          matchType: 'LB',
          round: 1,
          matchNumber: 4,
          advanceTo: 6,
          advanceSlot: 'B'),
      // #5 e #6 são as "semifinais cruzadas" — tipadas WB de propósito,
      // como #19/#20 na planta 12.
      _match(
          id: 'w5',
          matchType: 'WB',
          round: 2,
          matchNumber: 5,
          advanceTo: 7,
          advanceSlot: 'A'),
      _match(
          id: 'w6',
          matchType: 'WB',
          round: 2,
          matchNumber: 6,
          advanceTo: 7,
          advanceSlot: 'B'),
      _match(id: 'gf', matchType: 'Grand Final', round: 1, matchNumber: 7),
    ];
    final layout = buildDoubleEliminationBracketLayout(crossoverFinalPlan);

    expect(layout.nodes, hasLength(7));
    expect(nodeOf(layout, 'gf').isFinal, isTrue);
    expect(
      layout.columns.firstWhere((c) => c.matchIds.contains('gf')).label,
      'FINAL',
    );
    // Não some pra um canto qualquer: fica ADJACENTE à coluna de
    // cruzamento (w5/w6), não numa coluna extra isolada à direita de tudo.
    const passo =
        BracketLayoutMetrics.cardWidth + BracketLayoutMetrics.columnGap;
    expect(
      (nodeOf(layout, 'gf').position.dx - nodeOf(layout, 'w5').position.dx)
          .abs(),
      closeTo(passo, 0.01),
    );
  });

  test('edges follow the real advance wiring, not positional pairing', () {
    final layout = buildDoubleEliminationBracketLayout(sixTeamPlan);

    BracketLayoutEdge? edge(String from, String to) {
      for (final e in layout.edges) {
        if (e.fromMatchId == from && e.toMatchId == to) return e;
      }
      return null;
    }

    // Fiação real da planta de 6: #1→#3 e #2→#4 (posicional daria #2→#3).
    expect(edge('w1', 'w3'), isNotNull);
    expect(edge('w2', 'w4'), isNotNull);
    expect(edge('w2', 'w3'), isNull);
    expect(edge('w3', 'w7'), isNotNull);
    expect(edge('w4', 'w7'), isNotNull);
    expect(edge('l5', 'l8'), isNotNull);
    expect(edge('l6', 'l8'), isNotNull);
    expect(edge('l8', 'l9'), isNotNull);

    // A Final NÃO recebe aresta em chave de dupla eliminação (pedido do
    // dono) mesmo w7/l9 tendo `winnerAdvance` real apontando pra ela.
    expect(edge('w7', 'gf'), isNull,
        reason: 'DE não desenha linha até a Final — pedido do dono');
    expect(edge('l9', 'gf'), isNull);
    // O 3º lugar também não recebe arestas (nem tinha `winnerAdvance` real).
    expect(layout.edges.where((e) => e.toMatchId == 'tp'), isEmpty);
    // Sem cruzamento direto WB↔LB (w7 e l9 cruzam em gf, não entre si).
    expect(edge('w7', 'l9'), isNull);
  });

  test(
      'chave de dupla eliminação: nenhuma aresta chega na Final nem no 3º '
      'lugar — mata-mata simples continua com aresta até a Final', () {
    final plants = loadBracketPlants();
    // Dupla eliminação: nenhuma das 25 plantas tem aresta chegando na Final
    // ou no 3º lugar, mesmo nas que cruzam (10, 12, 32), onde a fiação real
    // aponta pra elas.
    for (final entry in plants.entries) {
      final matches = entry.value;
      final layout = buildDoubleEliminationBracketLayout(matches);
      final byNumber = {for (final m in matches) m.matchNumber: m};
      for (final e in layout.edges) {
        final destNumber = int.parse(e.toMatchId.substring(1));
        final destType = byNumber[destNumber]!.matchType.trim().toLowerCase();
        expect(
          destType,
          isNot(anyOf('final', 'third place')),
          reason: 'planta ${entry.key}: ${e.fromMatchId} → ${e.toMatchId} '
              'é aresta pra Final/3º lugar em chave de dupla eliminação',
        );
      }
    }

    // Mata-mata simples (sem wb/lb, caminho legado): a Final é o fim
    // natural da árvore de rodadas — a aresta até ela continua existindo.
    final knockout = [
      _match(
          id: 'sf1',
          matchType: 'knockout',
          round: 1,
          matchNumber: 1,
          advanceTo: 3,
          advanceSlot: 'A'),
      _match(
          id: 'sf2',
          matchType: 'knockout',
          round: 1,
          matchNumber: 2,
          advanceTo: 3,
          advanceSlot: 'B'),
      _match(id: 'final', matchType: 'Final', round: 1, matchNumber: 3),
    ];
    final knockoutLayout = buildDoubleEliminationBracketLayout(knockout);
    expect(
      knockoutLayout.edges,
      contains(
        isA<BracketLayoutEdge>()
            .having((e) => e.fromMatchId, 'from', 'sf1')
            .having((e) => e.toMatchId, 'to', 'final'),
      ),
    );
    expect(
      knockoutLayout.edges,
      contains(
        isA<BracketLayoutEdge>()
            .having((e) => e.fromMatchId, 'from', 'sf2')
            .having((e) => e.toMatchId, 'to', 'final'),
      ),
    );
  });

  test(
      'órfã sem coluna alcançável numa chave com convergência cai no '
      'agrupamento legado, à direita de tudo', () {
    // Não ocorre nas 25 plantas reais (ver doc-bloco de
    // buildDoubleEliminationBracketLayout, "Órfãs"), mas é possível numa
    // chave editada à mão: #12 aponta pra um matchNumber que não existe (99),
    // então nunca é alcançada pela travessia que monta a árvore de
    // alimentação a partir dos pontos de convergência — sobra sem coluna.
    final comOrfa = [
      ...sixTeamPlan,
      _match(
          id: 'w12', matchType: 'WB', round: 1, matchNumber: 12, advanceTo: 99),
    ];
    final layout = buildDoubleEliminationBracketLayout(comOrfa);

    // A órfã não desaparece: ganha um nó como qualquer outra partida.
    expect(layout.nodes, hasLength(12));
    final orfa = nodeOf(layout, 'w12');

    // Cai numa coluna extra à direita de TODAS as colunas da geometria
    // convergente (WB, faixa central e LB).
    for (final n in layout.nodes) {
      if (n.matchId == 'w12') continue;
      expect(orfa.position.dx, greaterThan(n.position.dx),
          reason: 'a órfã devia ficar à direita de ${n.matchId}');
    }

    // Nenhum card se sobrepõe, nem a órfã com o resto da chave.
    for (var i = 0; i < layout.nodes.length; i++) {
      for (var j = i + 1; j < layout.nodes.length; j++) {
        final a = layout.nodes[i];
        final b = layout.nodes[j];
        final separados = a.position.dx + a.size.width <= b.position.dx ||
            b.position.dx + b.size.width <= a.position.dx ||
            a.position.dy + a.size.height <= b.position.dy ||
            b.position.dy + b.size.height <= a.position.dy;
        expect(separados, isTrue,
            reason: '${a.matchId} e ${b.matchId} se sobrepõem');
      }
    }
  });

  test(
      'mata-mata simples com disputa de 3º lugar: knockout + Final + Third '
      'Place, sem nenhum wb/lb', () {
    // Mesmo formato que `category-bracket-builders.ts` gera pro mata-mata
    // simples (n >= 4 equipes reais): partidas 'knockout', 'Final' e, com
    // >= 2 rodadas, 'Third Place' — sem NENHUMA partida 'wb'/'lb'. Cai no
    // caminho legado (sem convergência a ancorar) do mesmo jeito que o teste
    // 'eliminatória simples' acima, mas aquele não tinha 3º lugar: aqui
    // `bracketGroupSortOrder` intercalaria o 3º lugar (8900) ENTRE as
    // semis e a Final (9000) — a exceção de ordenação em `_placeLegacyGroups`
    // bota a Final antes do 3º lugar (ordem da folha impressa, e evita que a
    // aresta semi→final pule por cima do card do 3º lugar).
    final semifinal1 = _match(
        id: 'sf1',
        matchType: 'knockout',
        round: 1,
        matchNumber: 1,
        advanceTo: 3,
        advanceSlot: 'A');
    final semifinal2 = _match(
        id: 'sf2',
        matchType: 'knockout',
        round: 1,
        matchNumber: 2,
        advanceTo: 3,
        advanceSlot: 'B');
    final final_ =
        _match(id: 'final', matchType: 'Final', round: 2, matchNumber: 3);
    final terceiro =
        _match(id: 'tp', matchType: 'Third Place', round: 2, matchNumber: 4);
    final layout = buildDoubleEliminationBracketLayout(
        [semifinal1, semifinal2, final_, terceiro]);

    expect(layout.nodes, hasLength(4));
    double xOf(String id) =>
        layout.nodes.firstWhere((n) => n.matchId == id).position.dx;

    // As duas semis dividem a mesma coluna (mesmo `bracketGroupKey`); a
    // Final vem logo depois (coluna vizinha, sem nada no meio), e o 3º
    // lugar por último — ordem da folha impressa, Final antes do 3º lugar.
    const passo =
        BracketLayoutMetrics.cardWidth + BracketLayoutMetrics.columnGap;
    expect(xOf('sf1'), xOf('sf2'));
    expect(xOf('sf1'), lessThan(xOf('final')));
    expect(xOf('final'), lessThan(xOf('tp')));
    expect(xOf('final') - xOf('sf1'), closeTo(passo, 0.01),
        reason: 'a aresta semi→final tem de ligar colunas vizinhas, sem '
            'pular por cima do 3º lugar');

    // Dentro da coluna das semis, a ordem vertical segue o matchNumber.
    expect(centerY(nodeOf(layout, 'sf1')),
        lessThan(centerY(nodeOf(layout, 'sf2'))));

    bool hasEdge(String from, String to) =>
        layout.edges.any((e) => e.fromMatchId == from && e.toMatchId == to);
    expect(hasEdge('sf1', 'final'), isTrue);
    expect(hasEdge('sf2', 'final'), isTrue);
    // O 3º lugar não recebe nenhuma aresta: nada tem `winnerAdvance` pra ele
    // (o formato só grava `loserAdvance`, que nunca vira linha).
    expect(layout.edges.where((e) => e.toMatchId == 'tp'), isEmpty);

    expect(nodeOf(layout, 'final').isFinal, isTrue);
    expect(nodeOf(layout, 'tp').isFinal, isFalse);
  });

  test('legacy matches without wiring still lay out, without connectors', () {
    final legacy = [
      _match(id: 'w1', matchType: 'WB', round: 1, matchNumber: 1),
      _match(id: 'w2', matchType: 'WB', round: 1, matchNumber: 2),
      _match(id: 'w3', matchType: 'WB', round: 2, matchNumber: 3),
      _match(id: 'gf', matchType: 'Final', round: 1, matchNumber: 4),
    ];
    final layout = buildDoubleEliminationBracketLayout(legacy);

    expect(layout.nodes, hasLength(4));
    expect(layout.edges, isEmpty);
    // Sem fiação, a coluna preserva a ordem por matchNumber.
    expect(
      centerY(nodeOf(layout, 'w1')),
      lessThan(centerY(nodeOf(layout, 'w2'))),
    );
  });

  test('a LB liga na faixa central; a queda continua sem linha', () {
    final plants = loadBracketPlants();
    final layout = buildDoubleEliminationBracketLayout(plants[12]!);
    bool hasEdge(int from, int to) => layout.edges
        .any((e) => e.fromMatchId == 'm$from' && e.toMatchId == 'm$to');

    expect(hasEdge(17, 19), isTrue,
        reason: 'vencedor da LB entra na semifinal');
    expect(hasEdge(18, 20), isTrue);
    expect(hasEdge(16, 19), isTrue);
    // A semifinal NÃO liga na Final: chave de dupla eliminação não desenha
    // linha até a Final nem o 3º lugar (pedido do dono) — elas moram lado a
    // lado nas colunas vizinhas ao centro, sem seta indicando quem alimentou.
    expect(hasEdge(19, 22), isFalse);
    // Queda: #15 perde e desce pro #17 — sem linha, por decisão do dono.
    expect(hasEdge(15, 17), isFalse);
    // O 3º lugar só recebe perdedores: nenhuma aresta chega nele.
    expect(layout.edges.any((e) => e.toMatchId == 'm21'), isFalse);
  });

  test('returns empty layout for no matches', () {
    final layout = buildDoubleEliminationBracketLayout(const []);
    expect(layout.nodes, isEmpty);
    expect(layout.canvasSize, Size.zero);
  });
}
