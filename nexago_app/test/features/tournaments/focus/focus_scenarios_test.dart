import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_scenarios.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

/// Partida de grupo. O `winnerId` é derivado dos sets porque o motor de
/// classificação do app EXIGE esse campo — sem ele a partida é ignorada e a
/// tabela sai na ordem da semente, o que já fez um teste daqui passar por
/// motivo errado.
TournamentMatch _g({
  required String id,
  required String a,
  required String b,
  String status = TournamentMatchStatus.scheduled,
  List<TournamentMatchSet> sets = const [],
  int matchNumber = 1,
  int bestOf = 3,
}) {
  String? winner;
  if (sets.isNotEmpty) {
    var wa = 0;
    var wb = 0;
    for (final set in sets) {
      if (set.a > set.b) {
        wa++;
      } else if (set.b > set.a) {
        wb++;
      }
    }
    winner = wa >= wb ? a : b;
  }

  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: 'c1',
    round: 1,
    matchType: 'group',
    poolId: 'A',
    teamAId: a,
    teamBId: b,
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: true,
    matchNumber: matchNumber,
    winnerId: winner,
    sets: sets,
    bestOf: bestOf,
  );
}

const _win = [
  TournamentMatchSet(a: 21, b: 15),
  TournamentMatchSet(a: 21, b: 12),
];

void main() {
  group('winBoundsOf', () {
    test('devolve os dois extremos de uma vitória em MD3', () {
      final bounds = winBoundsOf(3);

      expect(bounds.length, 2);
      // O mais largo: vence 2 sets zerando o adversário.
      expect(bounds[0].length, 2);
      expect(bounds[0].every((s) => s.b == 0), isTrue);
      // O mais apertado vai até o 3º set: os que não decidem saem zerados do
      // lado do atleta, e o decisivo sai pela margem legal mínima.
      expect(bounds[1].length, 3);
      expect(bounds[1].last.a - bounds[1].last.b, 2);
    });

    test('trava bestOf absurdo no maior formato real', () {
      // Documento malformado não pode alocar array proporcional ao número.
      expect(winBoundsOf(999).last.length, lessThanOrEqualTo(5));
    });
  });

  group('roundScenariosOf', () {
    test('não afirma posição quando outros jogos do grupo seguem pendentes',
        () {
      final matches = [
        _g(id: 'minha', a: 'meu', b: 'rival', matchNumber: 1),
        _g(id: 'outra', a: 'x', b: 'y', matchNumber: 2),
      ];

      final scenarios = roundScenariosOf(
        matches: matches,
        poolId: 'A',
        myTeamId: 'meu',
        myMatchId: 'minha',
        qualifiersPerGroup: 2,
      );

      expect(scenarios.length, 2);
      for (final s in scenarios) {
        expect(s.rank, isNull);
        expect(s.text, contains('depende'));
      }
    });

    test('afirma posição quando a partida dele é a única que falta', () {
      // Grupo de 4 com tudo decidido menos a partida do atleta.
      final matches = [
        _g(id: 'j1', a: 'meu', b: 'x', matchNumber: 1,
            status: TournamentMatchStatus.completed, sets: _win),
        _g(id: 'j2', a: 'rival', b: 'y', matchNumber: 2,
            status: TournamentMatchStatus.completed, sets: _win),
        _g(id: 'j3', a: 'meu', b: 'y', matchNumber: 3,
            status: TournamentMatchStatus.completed, sets: _win),
        _g(id: 'j4', a: 'rival', b: 'x', matchNumber: 4,
            status: TournamentMatchStatus.completed, sets: _win),
        _g(id: 'j5', a: 'x', b: 'y', matchNumber: 5,
            status: TournamentMatchStatus.completed, sets: _win),
        _g(id: 'minha', a: 'meu', b: 'rival', matchNumber: 6),
      ];

      final scenarios = roundScenariosOf(
        matches: matches,
        poolId: 'A',
        myTeamId: 'meu',
        myMatchId: 'minha',
        qualifiersPerGroup: 2,
      );

      final vitoria = scenarios.firstWhere((s) => s.won);
      expect(vitoria.rank, 1);
      expect(vitoria.qualifies, isTrue);
      expect(vitoria.text, '1º do grupo');
    });

    test('não afirma posição no empate TRIPLO, onde a margem decide', () {
      // Empate triplo (meu bate x, x bate y, y bate meu): o confronto direto
      // não resolve, e o desempate cai no saldo geral — que a margem da
      // partida pendente muda. Vencendo arrasando o atleta sobe; vencendo no
      // sufoco, não. Como os extremos discordam, a única resposta honesta é
      // "depende do placar".
      //
      // Este é o único formato em que a margem decide: num grupo completo, um
      // empate de DOIS sempre é resolvido pelo confronto direto.
      const grande = [
        TournamentMatchSet(a: 21, b: 0),
        TournamentMatchSet(a: 21, b: 0),
      ];
      final matches = [
        _g(id: 'a', a: 'meu', b: 'x', matchNumber: 1,
            status: TournamentMatchStatus.completed, sets: grande),
        _g(id: 'b', a: 'x', b: 'y', matchNumber: 2,
            status: TournamentMatchStatus.completed, sets: grande),
        _g(id: 'c', a: 'y', b: 'meu', matchNumber: 3,
            status: TournamentMatchStatus.completed, sets: grande),
        _g(id: 'd', a: 'x', b: 'z', matchNumber: 4,
            status: TournamentMatchStatus.completed, sets: grande),
        _g(id: 'e', a: 'y', b: 'z', matchNumber: 5,
            status: TournamentMatchStatus.completed, sets: grande),
        _g(id: 'minha', a: 'meu', b: 'z', matchNumber: 6),
      ];

      final scenarios = roundScenariosOf(
        matches: matches,
        poolId: 'A',
        myTeamId: 'meu',
        myMatchId: 'minha',
        qualifiersPerGroup: 2,
      );

      final vitoria = scenarios.firstWhere((s) => s.won);
      expect(vitoria.rank, isNull);
      expect(vitoria.text, contains('depende do placar'));
    });

    test('partida já encerrada não gera cenário', () {
      final matches = [
        _g(id: 'minha', a: 'meu', b: 'rival',
            status: TournamentMatchStatus.completed, sets: _win),
      ];

      expect(
        roundScenariosOf(
          matches: matches,
          poolId: 'A',
          myTeamId: 'meu',
          myMatchId: 'minha',
          qualifiersPerGroup: 2,
        ),
        isEmpty,
      );
    });

    test('partida que não é do atleta não gera cenário', () {
      // Sem esta guarda o placar hipotético seria aplicado a duas duplas que
      // não são a dele.
      final matches = [_g(id: 'outra', a: 'x', b: 'y')];

      expect(
        roundScenariosOf(
          matches: matches,
          poolId: 'A',
          myTeamId: 'meu',
          myMatchId: 'outra',
          qualifiersPerGroup: 2,
        ),
        isEmpty,
      );
    });

    test('sem time ou sem grupo devolve vazio', () {
      final matches = [_g(id: 'minha', a: 'meu', b: 'rival')];

      expect(
        roundScenariosOf(
          matches: matches, poolId: '', myTeamId: 'meu',
          myMatchId: 'minha', qualifiersPerGroup: 2,
        ),
        isEmpty,
      );
      expect(
        roundScenariosOf(
          matches: matches, poolId: 'A', myTeamId: null,
          myMatchId: 'minha', qualifiersPerGroup: 2,
        ),
        isEmpty,
      );
    });
  });
}
