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

    // #15 e #16 são as partidas de cruzamento (WB×LB) da planta 10. #17 (3º
    // lugar) e #18 (Final) não convergem direto e caem entre elas na coluna
    // central — isso NUNCA pode empurrar #15 ou #16 pra fora da média exata
    // dos seus dois alimentadores. A planta 10 é onde isso quebrava antes:
    // os dois blocos são pequenos, e sem reservar lugar pra #17/#18 a faixa
    // central sobrava só 121,5px pra dois cards de 150px. A correção abre
    // espaço ENTRE os blocos (uma folga em LUGARES do tamanho de quantas
    // partidas sem árvore existem) em vez de espremer #17/#18 no meio.
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
      'columns follow the convergent order — WB left-to-right, '
      'DESFECHO at the center, LB right-to-left', () {
    final layout = buildDoubleEliminationBracketLayout(sixTeamPlan);

    expect(layout.nodes, hasLength(11));
    expect(
      layout.columns.map((c) => c.label),
      [
        'WB · RODADA 1',
        'WB · RODADA 2',
        'WB · RODADA 3',
        'DESFECHO',
        'LB · RODADA 3',
        'LB · RODADA 2',
        'LB · RODADA 1',
      ],
    );
    // A coluna central mistura Final e 3º lugar (nenhum dos dois converge
    // direto nesta planta): key e label viram 'DESFECHO', e o columnKey de
    // cada node concorda com a key da coluna em que ele foi colocado.
    final desfecho = layout.columns.firstWhere((c) => c.key == 'DESFECHO');
    expect(desfecho.matchIds, containsAll(['tp', 'gf']));
    expect(nodeOf(layout, 'tp').columnKey, 'DESFECHO');
    expect(nodeOf(layout, 'gf').columnKey, 'DESFECHO');
    expect(layout.canvasSize.width, greaterThan(0));
    expect(layout.canvasSize.height, greaterThan(0));
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

    // A Final recebe as duas partidas de cruzamento pela fiação real.
    expect(edge('w7', 'gf'), isNotNull,
        reason: 'w7 avança para 11 (Final) — a fiação manda');
    expect(edge('l9', 'gf'), isNotNull,
        reason: 'l9 avança para 11 (Final) — a fiação manda');
    // O 3º lugar não recebe arestas (sem partida que avance pra ele).
    expect(layout.edges.where((e) => e.toMatchId == 'tp'), isEmpty);
    // Sem cruzamento direto WB↔LB (w7 e l9 cruzam em gf, não entre si).
    expect(edge('w7', 'l9'), isNull);
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
    // `bracketGroupSortOrder` intercala o 3º lugar (8900) ENTRE as rodadas
    // de knockout e a Final (9000) — isso nunca tinha sido exercitado.
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

    // As duas semis dividem a mesma coluna (mesmo `bracketGroupKey`); o 3º
    // lugar fica numa coluna própria, ENTRE as semis e a Final.
    expect(xOf('sf1'), xOf('sf2'));
    expect(xOf('sf1'), lessThan(xOf('tp')));
    expect(xOf('tp'), lessThan(xOf('final')));

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
    expect(hasEdge(19, 22), isTrue, reason: 'semifinal entra na final');
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
