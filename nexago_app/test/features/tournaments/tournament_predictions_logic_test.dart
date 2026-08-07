import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/predictions/tournament_prediction_entry.dart';
import 'package:nexago_app/features/tournaments/domain/predictions/tournament_predictions_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _match({
  String id = 'm1',
  String teamAId = 'team-a',
  String teamBId = 'team-b',
  String status = TournamentMatchStatus.scheduled,
  String matchType = 'knockout',
  String? winnerId,
  int matchNumber = 1,
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: 'cat-a',
    round: 1,
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
  );
}

TournamentMatchCardViewModel _card(TournamentMatch match) {
  return TournamentMatchCardViewModel(
    match: match,
    teamA: const TournamentMatchCardTeamViewModel(
      displayName: 'Time A',
      players: [],
    ),
    teamB: const TournamentMatchCardTeamViewModel(
      displayName: 'Time B',
      players: [],
    ),
  );
}

void main() {
  group('canPredictMatch', () {
    test('true quando Scheduled com os dois times definidos', () {
      expect(canPredictMatch(_match()), isTrue);
    });

    test('false quando a partida já começou', () {
      expect(
        canPredictMatch(_match(status: TournamentMatchStatus.inProgress)),
        isFalse,
      );
    });

    test('false quando algum lado ainda é TBD', () {
      expect(canPredictMatch(_match(teamBId: '')), isFalse);
    });
  });

  group('isPredictionLockedForMatch', () {
    test('destrava só quando Scheduled', () {
      expect(isPredictionLockedForMatch(_match()), isFalse);
      expect(
        isPredictionLockedForMatch(
          _match(status: TournamentMatchStatus.completed),
        ),
        isTrue,
      );
    });
  });

  group('predictableMatchCards', () {
    test('exclui partidas sem os dois competidores e ordena por matchNumber', () {
      final cards = [
        _card(_match(id: 'm2', matchNumber: 2)),
        _card(_match(id: 'm3', matchNumber: 3, teamBId: '')),
        _card(_match(id: 'm1', matchNumber: 1)),
      ];
      final result = predictableMatchCards(cards);
      expect(result.map((c) => c.match.id), ['m1', 'm2']);
    });
  });

  group('isChampionDecidingMatch', () {
    test('só a Final decide o campeão', () {
      expect(isChampionDecidingMatch(_match(matchType: 'Final')), isTrue);
      expect(isChampionDecidingMatch(_match(matchType: 'knockout')), isFalse);
    });
  });

  group('openMatchPicksToSubmit', () {
    test('mantém só picks de partidas ainda Scheduled', () {
      final matches = [
        _match(id: 'open', status: TournamentMatchStatus.scheduled),
        _match(id: 'locked', status: TournamentMatchStatus.inProgress),
      ];
      final draft = {'open': 'team-a', 'locked': 'team-b'};

      expect(
        openMatchPicksToSubmit(draft, matches),
        {'open': 'team-a'},
      );
    });

    test('reenviar um rascunho antigo não trava partidas novas', () {
      // Regressão: um rascunho semeado a partir de um palpite salvo antes
      // não deve impedir o envio de picks novos em partidas ainda abertas.
      final matches = [
        _match(id: 'm1', status: TournamentMatchStatus.completed),
        _match(id: 'm2', status: TournamentMatchStatus.scheduled),
      ];
      final draft = {'m1': 'team-a', 'm2': 'team-b'};

      final toSubmit = openMatchPicksToSubmit(draft, matches);
      expect(toSubmit.containsKey('m1'), isFalse);
      expect(toSubmit['m2'], 'team-b');
    });
  });

  group('deriveChampionPickFromDraft', () {
    test('usa o palpite dado pra grande final', () {
      final matches = [
        _match(id: 'semi', matchType: 'knockout'),
        _match(id: 'final', matchType: 'Final'),
      ];
      final draft = {'semi': 'team-a', 'final': 'team-b'};
      expect(deriveChampionPickFromDraft(draft, matches), 'team-b');
    });

    test('null quando ainda não há palpite pra final', () {
      final matches = [_match(id: 'final', matchType: 'Final')];
      expect(deriveChampionPickFromDraft({}, matches), isNull);
    });
  });

  group('predictionWasCorrectForMatch', () {
    test('null enquanto a partida não termina', () {
      final entry = TournamentPredictionEntry(userId: 'u1', picks: {'m1': 'team-a'});
      expect(predictionWasCorrectForMatch(_match(), entry), isNull);
    });

    test('true quando o palpite bate com o vencedor', () {
      final match = _match(
        status: TournamentMatchStatus.completed,
        winnerId: 'team-a',
      );
      final entry = TournamentPredictionEntry(userId: 'u1', picks: {'m1': 'team-a'});
      expect(predictionWasCorrectForMatch(match, entry), isTrue);
    });

    test('false quando o palpite erra o vencedor', () {
      final match = _match(
        status: TournamentMatchStatus.completed,
        winnerId: 'team-a',
      );
      final entry = TournamentPredictionEntry(userId: 'u1', picks: {'m1': 'team-b'});
      expect(predictionWasCorrectForMatch(match, entry), isFalse);
    });
  });

  group('buildPredictionLeaderboardEntries', () {
    test('ordena por score desc e marca o usuário atual', () {
      final entries = [
        const TournamentPredictionEntry(userId: 'u1', score: 4),
        const TournamentPredictionEntry(userId: 'u2', score: 9),
      ];

      final rows = buildPredictionLeaderboardEntries(
        entries,
        profiles: const {},
        currentUserId: 'u1',
      );

      expect(rows.map((r) => r.entityId), ['u2', 'u1']);
      expect(rows.map((r) => r.rank), [1, 2]);
      expect(rows.firstWhere((r) => r.entityId == 'u1').isCurrentUser, isTrue);
      expect(rows.firstWhere((r) => r.entityId == 'u2').isCurrentUser, isFalse);
    });
  });

  group('comparePredictionEntries', () {
    test('desempata por número de palpites quando a pontuação empata', () {
      final rows = buildPredictionLeaderboard(
        [
          const TournamentPredictionEntry(
            userId: 'poucos',
            score: 5,
            picks: {'m1': 'a'},
          ),
          const TournamentPredictionEntry(
            userId: 'muitos',
            score: 5,
            picks: {'m1': 'a', 'm2': 'b'},
          ),
        ],
        profiles: const {},
      );

      expect(rows.map((r) => r.entry.entityId), ['muitos', 'poucos']);
    });

    // O portal do atleta desempata com `<`/`>` sobre a string, que é code unit,
    // justamente para bater com o `compareTo` do Dart. Se algum dos dois virar
    // comparação sensível a locale, esta ordem muda e as duas superfícies passam
    // a mostrar posições diferentes na mesma imagem compartilhada.
    test('desempata por id em code unit: maiúscula antes de minúscula', () {
      final rows = buildPredictionLeaderboard(
        [
          const TournamentPredictionEntry(userId: 'a1', score: 5),
          const TournamentPredictionEntry(userId: 'B1', score: 5),
        ],
        profiles: const {},
      );

      expect(rows.map((r) => r.entry.entityId), ['B1', 'a1']);
    });
  });

  group('variação de posição', () {
    test('deriva o delta comparando previousRank com a posição calculada', () {
      final rows = buildPredictionLeaderboard(
        [
          const TournamentPredictionEntry(userId: 'subiu', score: 9, previousRank: 4),
          const TournamentPredictionEntry(userId: 'caiu', score: 1, previousRank: 1),
        ],
        profiles: const {},
      );

      expect(rows.firstWhere((r) => r.entry.entityId == 'subiu').delta, 3);
      expect(rows.firstWhere((r) => r.entry.entityId == 'caiu').delta, -1);
    });

    test('sem foto do servidor não inventa variação', () {
      final rows = buildPredictionLeaderboard(
        [const TournamentPredictionEntry(userId: 'u1', score: 2)],
        profiles: const {},
      );
      expect(rows.single.delta, isNull);
    });

    test('predictionDeltaLabel some quando não houve movimento', () {
      expect(predictionDeltaLabel(null), isNull);
      expect(predictionDeltaLabel(0), isNull);
      expect(predictionDeltaLabel(1), 'subiu 1 posição');
      expect(predictionDeltaLabel(3), 'subiu 3 posições');
      expect(predictionDeltaLabel(-2), 'caiu 2 posições');
    });
  });

  group('acertos por linha', () {
    test('conta só palpites de partidas já concluídas', () {
      final matches = [
        _match(id: 'm1', status: TournamentMatchStatus.completed, winnerId: 'team-a'),
        _match(id: 'm2', status: TournamentMatchStatus.completed, winnerId: 'team-b'),
        _match(id: 'm3'),
      ];
      final rows = buildPredictionLeaderboard(
        [
          const TournamentPredictionEntry(
            userId: 'u1',
            picks: {'m1': 'team-a', 'm2': 'team-a', 'm3': 'team-a'},
          ),
        ],
        profiles: const {},
        matches: matches,
      );

      expect(rows.single.hits, 1);
      expect(rows.single.entry.subtitle, '1 acerto · 3 palpites');
    });
  });

  group('predictionStatsOf', () {
    test('separa acertos de palpites em jogo e informa a posição', () {
      final matches = [
        _match(id: 'm1', status: TournamentMatchStatus.completed, winnerId: 'team-a'),
        _match(id: 'm2', status: TournamentMatchStatus.completed, winnerId: 'team-b'),
        _match(id: 'm3'),
      ];
      const mine = TournamentPredictionEntry(
        userId: 'eu',
        score: 1,
        picks: {'m1': 'team-a', 'm2': 'team-a', 'm3': 'team-b'},
      );
      final leaderboard = buildPredictionLeaderboard(
        [mine, const TournamentPredictionEntry(userId: 'outro', score: 4)],
        profiles: const {},
        matches: matches,
        currentUserId: 'eu',
      );

      final stats = predictionStatsOf(mine, matches, leaderboard);

      expect(stats.points, 1);
      expect(stats.hits, 1);
      // Denominador é o que já foi decidido — não o total palpitado.
      expect(stats.decided, 2);
      expect(stats.pending, 1);
      expect(stats.rank, 2);
      expect(stats.totalPlayers, 2);
    });

    test('zera tudo para quem ainda não palpitou', () {
      final stats = predictionStatsOf(null, [_match()], const []);
      expect(stats.points, 0);
      expect(stats.hits, 0);
      expect(stats.decided, 0);
      expect(stats.pending, 0);
      expect(stats.rank, isNull);
      expect(stats.totalPlayers, 0);
      expect(stats.delta, isNull);
    });
  });
}
