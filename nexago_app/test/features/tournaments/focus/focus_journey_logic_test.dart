import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_journey_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

/// Espelha o que `functions/src/category-bracket-builders.ts` grava. Em especial:
/// bye é partida REAL com o slot do adversário vazio e status `Scheduled`, e a
/// disputa de 3º lugar recebe o MESMO `round` da final.
TournamentMatch _ko({
  required String id,
  required int round,
  required int matchNumber,
  String teamAId = '',
  String teamBId = '',
  String status = TournamentMatchStatus.scheduled,
  String matchType = 'knockout',
  String? winnerId,
  int? winnerAdvanceMatchNumber,
  List<TournamentMatchSet> sets = const [],
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: 'c1',
    round: round,
    matchType: matchType,
    poolId: '',
    teamAId: teamAId,
    teamBId: teamBId,
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: false,
    matchNumber: matchNumber,
    winnerId: winnerId,
    winnerAdvanceMatchNumber: winnerAdvanceMatchNumber,
    sets: sets,
  );
}

void main() {
  const meu = {'meu'};

  group('winsToTitleOf — eliminação simples', () {
    test('bye já consumido não ancora o caminho na 1ª rodada', () {
      // Chave de 6 duplas: o atleta tem bye na rodada 1 e está na FINAL.
      // Sem a guarda do bye, a resposta seria 3 (a chave inteira).
      final matches = [
        _ko(id: 'bye', round: 1, matchNumber: 1, teamAId: 'meu'),
        _ko(
          id: 'semi',
          round: 2,
          matchNumber: 5,
          teamAId: 'meu',
          teamBId: 'x',
          status: TournamentMatchStatus.completed,
          winnerId: 'meu',
        ),
        _ko(
          id: 'final',
          round: 3,
          matchNumber: 7,
          teamAId: 'meu',
          teamBId: 'y',
          matchType: 'Final',
        ),
      ];

      expect(
        winsToTitleOf(matches, 'c1', meu, isDoubleElimination: false),
        1,
      );
    });

    test('bye propagado sem nenhuma vitória ainda não ancora a contagem', () {
      // O gerador PROPAGA o bye pra rodada seguinte na CONSTRUÇÃO da chave,
      // antes de qualquer partida acontecer: o atleta aparece em duas partidas
      // ao mesmo tempo com zero vitórias. Aqui o piso das vencidas é
      // -infinito e não filtra nada — só a guarda do bye consumido resolve.
      final matches = [
        _ko(id: 'bye', round: 1, matchNumber: 1, teamAId: 'meu'),
        _ko(id: 'r2', round: 2, matchNumber: 5, teamAId: 'meu'),
        _ko(id: 'final', round: 3, matchNumber: 7, matchType: 'Final'),
      ];

      // Sem a guarda seriam 3 (a chave inteira, ancorada no bye da rodada 1).
      expect(winsToTitleOf(matches, 'c1', meu, isDoubleElimination: false), 2);
    });

    test('3º lugar vencido não coroa campeão', () {
      // O gerador dá à disputa de 3º o MESMO round da final: checar campeão por
      // round coroaria quem perdeu a semi e ganhou o 3º lugar.
      final matches = [
        _ko(
          id: 'semi',
          round: 2,
          matchNumber: 5,
          teamAId: 'meu',
          teamBId: 'x',
          status: TournamentMatchStatus.completed,
          winnerId: 'x',
        ),
        _ko(
          id: 'final',
          round: 3,
          matchNumber: 7,
          teamAId: 'x',
          teamBId: 'y',
          matchType: 'Final',
        ),
        _ko(
          id: 'terceiro',
          round: 3,
          matchNumber: 8,
          teamAId: 'meu',
          teamBId: 'z',
          matchType: 'Third Place',
          status: TournamentMatchStatus.completed,
          winnerId: 'meu',
        ),
      ];

      expect(
        winsToTitleOf(matches, 'c1', meu, isDoubleElimination: false),
        isNull,
      );
    });

    test('campeão responde 0, não null', () {
      final matches = [
        _ko(
          id: 'final',
          round: 3,
          matchNumber: 7,
          teamAId: 'meu',
          teamBId: 'y',
          matchType: 'Final',
          status: TournamentMatchStatus.completed,
          winnerId: 'meu',
        ),
      ];

      expect(winsToTitleOf(matches, 'c1', meu, isDoubleElimination: false), 0);
    });

    test('chave não sorteada devolve null', () {
      expect(
        winsToTitleOf(const [], 'c1', meu, isDoubleElimination: false),
        isNull,
      );
    });

    test('ainda nos grupos: conta a chave inteira', () {
      final matches = [
        _ko(id: 'r1', round: 1, matchNumber: 1),
        _ko(id: 'r2', round: 2, matchNumber: 5),
        _ko(id: 'final', round: 3, matchNumber: 7, matchType: 'Final'),
      ];

      expect(winsToTitleOf(matches, 'c1', meu, isDoubleElimination: false), 3);
    });
  });

  group('happyPathOf', () {
    test('caminha a fiação até a final', () {
      final matches = [
        _ko(
          id: 'quartas',
          round: 1,
          matchNumber: 1,
          teamAId: 'meu',
          teamBId: 'x',
          winnerAdvanceMatchNumber: 5,
        ),
        _ko(id: 'semi', round: 2, matchNumber: 5, winnerAdvanceMatchNumber: 7),
        _ko(id: 'final', round: 3, matchNumber: 7, matchType: 'Final'),
      ];

      final path = happyPathOf(matches, 'c1', meu);

      expect(path?.map((m) => m.id).toList(), ['quartas', 'semi', 'final']);
    });

    test('fiação que não desemboca na final devolve null', () {
      final matches = [
        _ko(
          id: 'quartas',
          round: 1,
          matchNumber: 1,
          teamAId: 'meu',
          teamBId: 'x',
          winnerAdvanceMatchNumber: 5,
        ),
        _ko(id: 'semi', round: 2, matchNumber: 5),
      ];

      expect(happyPathOf(matches, 'c1', meu), isNull);
    });

    test('fiação circular para em vez de girar pra sempre', () {
      final matches = [
        _ko(
          id: 'a',
          round: 1,
          matchNumber: 1,
          teamAId: 'meu',
          teamBId: 'x',
          winnerAdvanceMatchNumber: 2,
        ),
        _ko(id: 'b', round: 2, matchNumber: 2, winnerAdvanceMatchNumber: 1),
      ];

      expect(happyPathOf(matches, 'c1', meu), isNull);
    });
  });

  group('winsToTitleOf — dupla eliminação', () {
    test('quem caiu pra LB conta a fiação, não as fases', () {
      // WB e LB numeram rodadas independentes: contar fases mentiria.
      final matches = [
        _ko(
          id: 'wb1',
          round: 1,
          matchNumber: 1,
          teamAId: 'meu',
          teamBId: 'x',
          status: TournamentMatchStatus.completed,
          winnerId: 'x',
          matchType: 'winners',
          winnerAdvanceMatchNumber: 5,
        ),
        _ko(
          id: 'lb1',
          round: 1,
          matchNumber: 3,
          teamAId: 'meu',
          teamBId: 'z',
          matchType: 'losers',
          winnerAdvanceMatchNumber: 6,
        ),
        _ko(
          id: 'lb2',
          round: 2,
          matchNumber: 6,
          matchType: 'losers',
          winnerAdvanceMatchNumber: 9,
        ),
        _ko(
          id: 'wbfinal',
          round: 2,
          matchNumber: 5,
          matchType: 'winners',
          winnerAdvanceMatchNumber: 9,
        ),
        _ko(id: 'grand', round: 3, matchNumber: 9, matchType: 'Grand Final'),
      ];

      expect(winsToTitleOf(matches, 'c1', meu, isDoubleElimination: true), 3);
    });

    test('campeão com uma derrota no currículo responde 0', () {
      final matches = [
        _ko(
          id: 'wb1',
          round: 1,
          matchNumber: 1,
          teamAId: 'meu',
          teamBId: 'x',
          status: TournamentMatchStatus.completed,
          winnerId: 'x',
          matchType: 'winners',
        ),
        _ko(
          id: 'grand',
          round: 3,
          matchNumber: 9,
          teamAId: 'meu',
          teamBId: 'x',
          matchType: 'Grand Final',
          status: TournamentMatchStatus.completed,
          winnerId: 'meu',
        ),
      ];

      expect(winsToTitleOf(matches, 'c1', meu, isDoubleElimination: true), 0);
    });
  });

  group('tournamentNumbersOf', () {
    test('conta só partidas encerradas e monta uma barra por set', () {
      final matches = [
        _ko(
          id: 'jogada',
          round: 1,
          matchNumber: 1,
          teamAId: 'meu',
          teamBId: 'x',
          status: TournamentMatchStatus.completed,
          winnerId: 'meu',
          sets: const [
            TournamentMatchSet(a: 21, b: 15),
            TournamentMatchSet(a: 21, b: 18),
          ],
        ),
        _ko(
          id: 'futura',
          round: 2,
          matchNumber: 5,
          teamAId: 'meu',
          teamBId: 'y',
        ),
      ];

      final numbers = tournamentNumbersOf(matches, meu);

      expect(numbers.matches, 1);
      expect(numbers.setsWon, 2);
      expect(numbers.setsLost, 0);
      expect(numbers.points, 42);
      expect(numbers.pointsAgainst, 33);
      expect(numbers.pointsPerSet, 21.0);
      expect(numbers.sets.map((s) => s.label).toList(), ['P1 · S1', 'P1 · S2']);
    });

    test('conta o placar sob a ótica do atleta quando ele é o lado B', () {
      final matches = [
        _ko(
          id: 'ladoB',
          round: 1,
          matchNumber: 1,
          teamAId: 'x',
          teamBId: 'meu',
          status: TournamentMatchStatus.completed,
          winnerId: 'x',
          sets: const [TournamentMatchSet(a: 21, b: 15)],
        ),
      ];

      final numbers = tournamentNumbersOf(matches, meu);

      expect(numbers.points, 15);
      expect(numbers.pointsAgainst, 21);
      expect(numbers.setsLost, 1);
    });

    test('sem partida encerrada não divide por zero', () {
      expect(tournamentNumbersOf(const [], meu).pointsPerSet, 0);
    });
  });
}
