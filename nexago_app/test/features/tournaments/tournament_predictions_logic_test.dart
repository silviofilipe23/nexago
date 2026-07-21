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
}
