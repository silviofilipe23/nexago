import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/koc/koc_board_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_type.dart';

/// O telão da categoria segue a rodada que está valendo.
///
/// Sem isso, numa quadra só, alguém teria de trocar o link sete vezes durante a
/// etapa — na frente do público.
void main() {
  TournamentMatch round({
    required int number,
    required String status,
    String categoryId = 'kotc',
    String matchType = TournamentMatchType.kocRound,
  }) {
    return TournamentMatch(
      id: 'r$number',
      tournamentId: 't1',
      categoryId: categoryId,
      round: 1,
      matchType: matchType,
      poolId: 'C1',
      teamAId: '',
      teamBId: '',
      status: status,
      resultA: '',
      resultB: '',
      isGroupMatch: false,
      matchNumber: number,
      kocTeamIds: const ['a', 'b', 'c', 'd'],
    );
  }

  TournamentMatch duel({required int number}) {
    return TournamentMatch(
      id: 'd$number',
      tournamentId: 't1',
      categoryId: 'duplas',
      round: 1,
      matchType: 'final',
      poolId: '',
      teamAId: 'a',
      teamBId: 'b',
      status: TournamentMatchStatus.inProgress,
      resultA: '',
      resultB: '',
      isGroupMatch: false,
      matchNumber: number,
    );
  }

  test('o que está acontecendo ganha de tudo', () {
    final id = kocBoardRoundId([
      round(number: 1, status: TournamentMatchStatus.completed),
      round(number: 2, status: TournamentMatchStatus.inProgress),
      round(number: 3, status: TournamentMatchStatus.scheduled),
    ], 'kotc');
    expect(id, 'r2');
  });

  test('entre rodadas, mostra quem sobe — não quem acabou de sair', () {
    // É a informação acionável para quem está esperando na fila.
    final id = kocBoardRoundId([
      round(number: 1, status: TournamentMatchStatus.completed),
      round(number: 2, status: TournamentMatchStatus.completed),
      round(number: 3, status: TournamentMatchStatus.scheduled),
    ], 'kotc');
    expect(id, 'r3');
  });

  test('no fim da etapa fica na tabela da final, em vez de apagar', () {
    final id = kocBoardRoundId([
      round(number: 1, status: TournamentMatchStatus.completed),
      round(
        number: 2,
        status: TournamentMatchStatus.completed,
        matchType: TournamentMatchType.kocFinal,
      ),
    ], 'kotc');
    expect(id, 'r2');
  });

  test('rodada cancelada nunca sobe ao telão', () {
    final id = kocBoardRoundId([
      round(number: 1, status: TournamentMatchStatus.completed),
      round(number: 2, status: TournamentMatchStatus.canceled),
    ], 'kotc');
    expect(id, 'r1');
  });

  test('ignora a outra categoria e as partidas de duelo do mesmo torneio', () {
    final id = kocBoardRoundId([
      duel(number: 1),
      round(number: 2, status: TournamentMatchStatus.inProgress, categoryId: 'outra'),
      round(number: 3, status: TournamentMatchStatus.scheduled),
    ], 'kotc');
    expect(id, 'r3');
  });

  test('segue a ordem cronológica, não a do array', () {
    final id = kocBoardRoundId([
      round(number: 3, status: TournamentMatchStatus.scheduled),
      round(number: 2, status: TournamentMatchStatus.scheduled),
    ], 'kotc');
    expect(id, 'r2');
  });

  test('categoria sem rodada publicada não tem telão', () {
    expect(kocBoardRoundId([duel(number: 1)], 'kotc'), isNull);
    expect(kocBoardRoundId(const [], 'kotc'), isNull);
    expect(
      kocBoardRoundId([round(number: 1, status: TournamentMatchStatus.scheduled)], ''),
      isNull,
    );
  });

  test('todas canceladas não devolve rodada', () {
    final id = kocBoardRoundId([
      round(number: 1, status: TournamentMatchStatus.canceled),
    ], 'kotc');
    expect(id, isNull);
  });
}
