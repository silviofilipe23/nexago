import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/tournament_match_mapper.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_display.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_type.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_matches_logic.dart';

/// A rodada KOTC precisa ser ENCONTRÁVEL pelo atleta.
///
/// A fase 0 escondeu a rodada de todo consumidor de duelo gravando os dois lados
/// vazios — e escondeu também do próprio atleta, porque "esta partida é minha"
/// era `teamAId == meuTime`. Estes testes travam a correção: a dupla está no
/// ELENCO, e é por ele que a rodada aparece.
void main() {
  TournamentMatch round({
    List<String> roster = const ['t1', 't2', 't3', 't4'],
    String matchType = TournamentMatchType.kocRound,
    int matchNumber = 1,
    String status = TournamentMatchStatus.scheduled,
  }) {
    return TournamentMatch(
      id: 'r$matchNumber',
      tournamentId: 't',
      categoryId: 'open',
      round: 1,
      matchType: matchType,
      poolId: 'C1',
      teamAId: '',
      teamBId: '',
      status: status,
      resultA: '',
      resultB: '',
      isGroupMatch: false,
      matchNumber: matchNumber,
      kocTeamIds: roster,
    );
  }

  TournamentMatch duel({String teamAId = 'a', String teamBId = 'b'}) {
    return TournamentMatch(
      id: 'm1',
      tournamentId: 't',
      categoryId: 'open',
      round: 1,
      matchType: 'final',
      poolId: '',
      teamAId: teamAId,
      teamBId: teamBId,
      status: TournamentMatchStatus.scheduled,
      resultA: '',
      resultB: '',
      isGroupMatch: false,
      matchNumber: 1,
    );
  }

  group('matchInvolvesTeam', () {
    test('acha a dupla no elenco da rodada', () {
      expect(matchInvolvesTeam(round(), 't3'), isTrue);
      expect(matchInvolvesTeam(round(), 't9'), isFalse);
    });

    test('a rodada aparece na lista de partidas do atleta', () {
      final mine = filterAthleteMatches([round(), duel()], {'t3'});
      expect(mine.map((m) => m.id), ['r1']);
    });

    test('duelo continua achando pelos dois lados', () {
      expect(matchInvolvesTeam(duel(), 'a'), isTrue);
      expect(matchInvolvesTeam(duel(), 'b'), isTrue);
      expect(matchInvolvesTeam(duel(), 'c'), isFalse);
    });

    test('os lados vazios da rodada não casam com id vazio', () {
      // Sem esta garantia, `teamAId == ''` faria TODA rodada parecer de todos.
      expect(matchInvolvesTeam(round(), ''), isFalse);
      expect(matchInvolvesTeam(round(), '   '), isFalse);
    });

    test('rodada sem elenco (fase seguinte) não é de ninguém ainda', () {
      expect(matchInvolvesTeam(round(roster: const []), 't1'), isFalse);
    });
  });

  group('kingOfCourtPhaseLabel', () {
    test('a classificatória leva o número da rodada', () {
      // Numa quadra só as classificatórias acontecem em sequência: o atleta
      // precisa saber qual é a dele.
      expect(
        kingOfCourtPhaseLabel(round(matchNumber: 3)),
        'Classificatória · Rodada 3',
      );
    });

    test('semifinal e final não levam número', () {
      expect(
        kingOfCourtPhaseLabel(
          round(matchType: TournamentMatchType.kocSemifinal, matchNumber: 5),
        ),
        'Semifinal',
      );
      expect(
        kingOfCourtPhaseLabel(
          round(matchType: TournamentMatchType.kocFinal, matchNumber: 7),
        ),
        'Final',
      );
    });

    test('a fase da rodada não vira "grupo" por causa do poolId', () {
      // `poolId` da rodada é a QUADRA da fase. Sem a saída por KOTC, o rótulo
      // sairia como "FASE DE GRUPOS · C1".
      expect(
        matchPhaseDisplayLabel(round(matchNumber: 2)),
        'CLASSIFICATÓRIA · RODADA 2',
      );
    });
  });

  group('TournamentMatchMapper', () {
    test('lê o elenco e a tabela da rodada', () {
      final match = TournamentMatchMapper.fromMap('r1', {
        'tournamentId': 't',
        'categoryId': 'open',
        'matchType': 'koc_final',
        'kocTeamIds': ['a', 'b', 'c'],
        'kocStandings': [
          {'teamId': 'b', 'place': 2},
          {'teamId': 'a', 'place': 1},
          {'teamId': 'c', 'place': 3},
        ],
      });
      expect(match.kocTeamIds, ['a', 'b', 'c']);
      // Ordenada por colocação, não pela ordem do array.
      expect(match.kocStandingTeamIds, ['a', 'b', 'c']);
      expect(match.isKingOfCourt, isTrue);
    });

    test('descarta entrada corrompida da tabela', () {
      final match = TournamentMatchMapper.fromMap('r1', {
        'tournamentId': 't',
        'categoryId': 'open',
        'matchType': 'koc_final',
        'kocStandings': [
          {'teamId': 'a', 'place': 1},
          {'teamId': '', 'place': 2},
          {'place': 3},
          'lixo',
        ],
      });
      expect(match.kocStandingTeamIds, ['a']);
    });

    test('partida de duelo não ganha campo KOTC', () {
      final match = TournamentMatchMapper.fromMap('m1', {
        'tournamentId': 't',
        'categoryId': 'open',
        'matchType': 'final',
        'teamAId': 'a',
        'teamBId': 'b',
      });
      expect(match.kocTeamIds, isEmpty);
      expect(match.kocStandingTeamIds, isEmpty);
      expect(match.isDuel, isTrue);
    });
  });
}
