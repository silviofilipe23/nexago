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
      final tipoPorNumero = {
        for (final m in matches)
          m.matchNumber: m.matchType.trim().toLowerCase(),
      };
      // Centro = o X da partida de CRUZAMENTO mais à esquerda (exclui Final
      // e 3º lugar — desde que passaram a morar ao lado, numa coluna vizinha
      // ao centro, e não mais nela, elas não servem mais pra achar o centro:
      // o 3º lugar em especial fica à ESQUERDA do centro de propósito).
      // Quando não há cruzamento de verdade (a Final converge direto — a
      // maioria das plantas), ela mesma marca o centro.
      final cruzamentos = convergencia.where(
        (n) => tipoPorNumero[n] != 'final' && tipoPorNumero[n] != 'third place',
      );
      final referencia = cruzamentos.isNotEmpty
          ? cruzamentos
          : convergencia.where((n) => tipoPorNumero[n] == 'final');
      final centroX = referencia
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
      const passo =
          BracketLayoutMetrics.cardWidth + BracketLayoutMetrics.columnGap;
      // Nenhuma aresta chega na Final nem no 3º lugar em chave de dupla
      // eliminação (pedido do dono, ver `_buildAdvanceEdges`) — toda aresta
      // que sobra liga colunas vizinhas de verdade, sem exceção de mesma
      // coluna.
      for (final e in layout.edges) {
        final de = xPorId[e.fromMatchId]!;
        final para = xPorId[e.toMatchId]!;
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

    test(
        'planta de $teamCount: o lado sem alimentador continua reservando '
        'lugar, mesmo sem desenhar traço', () {
      // A linha livre do bye e da entrada do perdedor saiu do desenho (pedido
      // do dono: nada de traço onde não há partida), mas o LUGAR VAGO segue
      // existindo na árvore — é ele que impede o jogo de se alinhar em linha
      // reta com o seu único alimentador. Sem nada visível denunciando a
      // reserva, é esta suíte que a segura: quem recebe UM alimentador só
      // nunca fica na mesma altura dele.
      final layout = buildDoubleEliminationBracketLayout(matches);
      final cyPorId = <String, double>{
        for (final n in layout.nodes)
          n.matchId: n.position.dy + n.size.height / 2,
      };
      final fontesDe = <int, List<int>>{};
      for (final m in matches) {
        final dest = m.winnerAdvanceMatchNumber;
        if (dest == null) continue;
        (fontesDe[dest] ??= <int>[]).add(m.matchNumber);
      }
      for (final m in matches) {
        final fontes = fontesDe[m.matchNumber] ?? const <int>[];
        if (fontes.length != 1) continue;
        final tipo = m.matchType.trim().toLowerCase();
        if (tipo == 'final' || tipo == 'third place') continue;
        final destino = cyPorId['m${m.matchNumber}'];
        final fonte = cyPorId['m${fontes.single}'];
        if (destino == null || fonte == null) continue;
        expect((destino - fonte).abs(), greaterThan(1),
            reason: '#${m.matchNumber} colou na altura do único alimentador '
                '#${fontes.single}: o lado vago deixou de reservar lugar');
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
