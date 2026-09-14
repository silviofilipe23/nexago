// ignore_for_file: avoid_print

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/bracket_feed_tree.dart';

import 'bracket_plants_fixture.dart';

void main() {
  final plants = loadBracketPlants();

  test('planta de 12: convergência nas semifinais, na final e no 3º lugar', () {
    // #19 e #20 são as semifinais cruzadas — juntam WB com LB. Elas têm
    // matchType "WB" de propósito (ver bracket-12-teams.ts), então a
    // identificação NÃO pode sair do matchType.
    expect(bracketConvergenceMatches(plants[12]!), {19, 20, 21, 22});
  });

  test('planta de 10: convergência nas semifinais cruzadas, na final e no 3º lugar', () {
    // #15 (WB) e #16 (LB) — juntam WB com LB. Diferente da 12, #16 é LB e não WB.
    // Prova que a lista de tipos não funciona: precisa da fiação.
    expect(bracketConvergenceMatches(plants[10]!), {15, 16, 17, 18});
  });

  test('planta de 8: convergência só na final e no 3º lugar', () {
    expect(bracketConvergenceMatches(plants[8]!), {13, 14});
  });

  test('plantasConvergenciaCount derivado do fixture', () {
    final count = <int, int>{};
    for (final entry in plants.entries) {
      count[entry.key] = bracketConvergenceMatches(entry.value).length;
    }
    // Plantas com cruzamento WB×LB antes da final (10, 12, 32): 4 partidas
    // Demais plantas: 2 partidas (só final + 3º lugar)
    expect(count[10], 4, reason: 'planta 10 com cruzamento');
    expect(count[12], 4, reason: 'planta 12 com cruzamento');
    expect(count[32], 4, reason: 'planta 32 com cruzamento');
    for (final size in [4, 5, 6, 7, 8, 9, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]) {
      expect(count[size], 2, reason: 'planta $size sem cruzamento, só final + 3º lugar');
    }
  });

  group('árvore de alimentação', () {
    test('planta de 12, lado WB da semifinal #19: o bye vira lugar vago', () {
      final tree = buildBracketFeedTree(plants[12]!, 19, 'wb')!;
      expect(tree.matchNumber, 16); // a quarta que alimenta a semifinal
      expect(tree.children.map((c) => c.matchNumber), [5, 6]);

      // #5 é seed 2 (bye) contra o vencedor do #1: um lado só tem alimentador.
      final jogo5 = tree.children.first;
      expect(jogo5.children, hasLength(2));
      expect(jogo5.children.where((c) => c.isEmptySlot), hasLength(1));
      expect(jogo5.span, 2, reason: 'o bye ocupa um lugar');
    });

    test('planta de 12, lado LB: a entrada do perdedor também vira lugar vago', () {
      final tree = buildBracketFeedTree(plants[12]!, 19, 'lb')!;
      expect(tree.matchNumber, 17); // #17 = V14 x P15
      expect(tree.children.where((c) => c.isEmptySlot), hasLength(1),
          reason: 'o lado de P15 não tem alimentador desenhado');
      expect(tree.children.map((c) => c.matchNumber), contains(14));
      expect(tree.span, 3);
    });

    test('a ponta da WB não ganha lugar vago — os dois lados são seeds', () {
      final tree = buildBracketFeedTree(plants[12]!, 19, 'wb')!;
      final jogo1 = tree.children.first.children
          .firstWhere((c) => c.matchNumber == 1);
      expect(jogo1.children, isEmpty);
      expect(jogo1.span, 1);
    });

    test('devolve null quando a chave não alimenta aquela partida', () {
      // O 3º lugar só recebe perdedores: nenhum lado tem alimentador desenhado.
      expect(buildBracketFeedTree(plants[12]!, 21, 'wb'), isNull);
      expect(buildBracketFeedTree(plants[12]!, 21, 'lb'), isNull);
    });

    test(
        'devolve null quando a raiz recebe DOIS alimentadores da mesma chave '
        '— a final não é "um lado"', () {
      // bracket-12-teams.ts: #22 (FINAL) = WINNER(#19) x WINNER(#20), as duas
      // tipadas WB. A final é o encontro de #19 e #20, não a continuação de
      // um deles só — não existe "a árvore que entra por um lado" aqui.
      expect(buildBracketFeedTree(plants[12]!, 22, 'wb'), isNull);
    });

    test(
        'planta de 8: a final tem um alimentador de cada chave — '
        'comportamento normal preservado', () {
      // bracket-8-teams.ts: #14 (FINAL) = WINNER(#12, LB) x WINNER(#11, WB).
      // Cada chave alimenta a final por exatamente um lado, então as duas
      // continuam devolvendo árvore normalmente.
      final wb = buildBracketFeedTree(plants[8]!, 14, 'wb')!;
      expect(wb.matchNumber, 11);
      final lb = buildBracketFeedTree(plants[8]!, 14, 'lb')!;
      expect(lb.matchNumber, 12);
    });
  });

  group('centros e profundidades', () {
    test('as pontas ocupam meio lugar cada, o jogo fica na média dos filhos', () {
      final tree = buildBracketFeedTree(plants[12]!, 19, 'wb')!;
      final centers = <int, double>{};
      assignFeedCenters(tree, 0, centers);

      // Lado WB de #19: [#5[ vago, #1 ], #6[ vago, #2 ]] — 4 lugares.
      expect(centers[1], 1.5);
      expect(centers[5], 1.0); // média entre o vago (0.5) e o #1 (1.5)
      expect(centers[2], 3.5);
      expect(centers[6], 3.0);
      expect(centers[16], 2.0); // média de #5 e #6
    });

    test('profundidade cresce ao se afastar do centro', () {
      final tree = buildBracketFeedTree(plants[12]!, 19, 'wb')!;
      final depths = <int, int>{};
      assignFeedDepths(tree, 1, depths);
      expect(depths[16], 1); // quarta: encostada na faixa central
      expect(depths[5], 2);
      expect(depths[1], 3);
    });

    test('o lugar vago tem centro próprio, para o conector achar a ponta', () {
      final tree = buildBracketFeedTree(plants[12]!, 19, 'wb')!;
      final vagos = <int, List<double>>{};
      assignEmptySlotCenters(tree, 0, vagos);
      // O bye do #5 ocupa o primeiro lugar do bloco.
      expect(vagos[5], [0.5]);
      expect(vagos[6], [2.5]);
      expect(vagos.containsKey(1), isFalse, reason: 'ponta não tem lado vago');
    });

    test(
        'jogo interno usa a posição REAL do filho, não o meio geométrico do '
        'intervalo — filhos diretos com span diferente', () {
      // Planta 9, WB #16: #13[ #10[ #4[ vago, #1 ], #5 ], #9[ #2, #3 ] ].
      // #10 (span 3) e #9 (span 2) são filhos DIRETOS de #13 com spans
      // diferentes — a "entrada desigual" que a tarefa precisa suportar.
      final tree = buildBracketFeedTree(plants[9]!, 16, 'wb')!;
      final centers = <int, double>{};
      assignFeedCenters(tree, 0, centers);

      // #10 não fica no meio do seu próprio intervalo [0,3) (que seria 1.5):
      // fica em 1.75, a média real de #4 (1.0) e #5 (2.5).
      expect(centers[10], 1.75);
      // #13 tem de usar a posição REAL de #10 (1.75), não o meio geométrico
      // do intervalo que #10 ocupa (1.5) — usar o meio geométrico dava 2.75.
      expect(centers[13], 2.875);
    });
  });
}
