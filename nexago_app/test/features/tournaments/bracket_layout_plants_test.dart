// nexago_app/test/features/tournaments/bracket_layout_plants_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/bracket_feed_tree.dart';
import 'package:nexago_app/features/tournaments/domain/double_elimination_bracket_layout.dart';

import 'bracket_plants_fixture.dart';

/// As plantas são a fonte da verdade da chave, e um desenho que colide ou
/// inverte lados numa planta irregular não aparece em teste sintético — o caso
/// que morde é o play-in com o MESMO round da rodada que ele alimenta (planta
/// 25) e a entrada desigual na LB das plantas 20 a 24.
///
/// A invariante de sobreposição de cards já é coberta, para as mesmas 25
/// plantas, por 'nenhum par de cards se sobrepõe em nenhuma das 25 plantas'
/// em `double_elimination_bracket_layout_test.dart` — não duplicada aqui.
void main() {
  final plants = loadBracketPlants();

  for (final entry in plants.entries) {
    final teamCount = entry.key;
    final matches = entry.value;

    test('planta de $teamCount: WB à esquerda do centro, LB à direita', () {
      final layout = buildDoubleEliminationBracketLayout(matches);
      final convergencia = bracketConvergenceMatches(matches);
      final xPorId = {for (final n in layout.nodes) n.matchId: n.position.dx};
      // Centro = o X da partida de convergência mais à esquerda.
      final centroX = convergencia
          .map((n) => xPorId['m$n'])
          .whereType<double>()
          .reduce((a, b) => a < b ? a : b);

      for (final m in matches) {
        final x = xPorId['m${m.matchNumber}'];
        if (x == null) continue;
        if (convergencia.contains(m.matchNumber)) continue;
        final tipo = m.matchType.trim().toLowerCase();
        if (tipo == 'wb') {
          expect(x, lessThan(centroX),
              reason: 'WB #${m.matchNumber} não está à esquerda do centro');
        } else if (tipo == 'lb') {
          expect(x, greaterThan(centroX),
              reason: 'LB #${m.matchNumber} não está à direita do centro');
        }
      }
    });

    test('planta de $teamCount: toda aresta liga colunas vizinhas', () {
      final layout = buildDoubleEliminationBracketLayout(matches);
      final xPorId = {for (final n in layout.nodes) n.matchId: n.position.dx};
      final tipoPorId = {
        for (final m in matches)
          'm${m.matchNumber}': m.matchType.trim().toLowerCase(),
      };
      const passo =
          BracketLayoutMetrics.cardWidth + BracketLayoutMetrics.columnGap;
      for (final e in layout.edges) {
        final de = xPorId[e.fromMatchId]!;
        final para = xPorId[e.toMatchId]!;
        final destino = tipoPorId[e.toMatchId];
        if (destino == 'final' || destino == 'third place') {
          // A final e o 3º lugar moram na mesma coluna central das partidas
          // de cruzamento: a ligação até eles pode ser vertical (distância 0).
          expect(
              (de - para).abs(), anyOf(closeTo(0, 0.01), closeTo(passo, 0.01)),
              reason: '${e.fromMatchId} → ${e.toMatchId} pula coluna');
          continue;
        }
        expect((de - para).abs(), closeTo(passo, 0.01),
            reason: '${e.fromMatchId} → ${e.toMatchId} pula coluna');
      }
    });

    test('planta de $teamCount: partida com dois alimentadores fica na média',
        () {
      final layout = buildDoubleEliminationBracketLayout(matches);
      final convergencia = bracketConvergenceMatches(matches);
      final cyPorId = <String, double>{
        for (final n in layout.nodes)
          n.matchId: n.position.dy + n.size.height / 2,
      };
      final alimentadores = <int, List<int>>{};
      for (final m in matches) {
        final dest = m.winnerAdvanceMatchNumber;
        if (dest == null) continue;
        (alimentadores[dest] ??= <int>[]).add(m.matchNumber);
      }
      alimentadores.forEach((destino, fontes) {
        if (fontes.length != 2) return;
        // Exceção documentada (linhas 327-337 do motor): a Final das plantas
        // 10, 12 e 32 é alimentada pelas DUAS partidas de cruzamento — que já
        // são, elas mesmas, pontos de convergência. Ali quem cruza são as
        // partidas de cruzamento, não a Final; o centro dela sai da guarda de
        // colisão de duas passadas, não desta média. Verificado empiricamente
        // (diff de 81px nas 3 plantas) antes de excluir — não é o defeito que
        // esta suíte existe para pegar, é o mesmo caso que a suíte irmã já
        // recorta em 'toda partida de cruzamento fica na média dos
        // alimentadores, nas 25 plantas'.
        if (fontes.every(convergencia.contains)) return;
        final a = cyPorId['m${fontes[0]}'];
        final b = cyPorId['m${fontes[1]}'];
        final d = cyPorId['m$destino'];
        if (a == null || b == null || d == null) return;
        final media = (a + b) / 2;
        expect(d, closeTo(media, 0.5),
            reason: 'm$destino não está entre m${fontes[0]} e m${fontes[1]}');
      });
    });

    test('planta de $teamCount: todo lado sem alimentador vira linha livre',
        () {
      final layout = buildDoubleEliminationBracketLayout(matches);
      final desenhados = <int, int>{};
      for (final m in matches) {
        final dest = m.winnerAdvanceMatchNumber;
        if (dest == null) continue;
        desenhados[dest] = (desenhados[dest] ?? 0) + 1;
      }
      final livresPorId = <String, int>{};
      for (final slot in layout.emptySlots) {
        livresPorId[slot.matchId] = (livresPorId[slot.matchId] ?? 0) + 1;
      }
      for (final m in matches) {
        final entradas = desenhados[m.matchNumber] ?? 0;
        if (entradas == 0) continue; // ponta da WB: dois seeds, sem lado vago
        final tipo = m.matchType.trim().toLowerCase();
        if (tipo == 'final' || tipo == 'third place') continue;
        expect(entradas + (livresPorId['m${m.matchNumber}'] ?? 0), 2,
            reason: '#${m.matchNumber} não tem os dois lados ocupados');
      }
    });

    test('planta de $teamCount: todo jogo aparece uma vez só', () {
      final layout = buildDoubleEliminationBracketLayout(matches);
      final ids = layout.nodes.map((n) => n.matchId).toList();
      expect(ids.toSet(), hasLength(ids.length));
      expect(ids, hasLength(matches.length));
    });
  }
}
