import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_detail_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/match_detail_set_timeline_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_point_action.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatchPointAction _point({
  required String side,
  required int setIndex,
}) {
  return TournamentMatchPointAction(
    type: 'point',
    side: side,
    setIndex: setIndex,
    delta: 1,
    ts: DateTime.utc(2026, 6, 9, 17, 0),
  );
}

void main() {
  const ourTeamId = 'team-a';
  const opponentTeamId = 'team-b';

  group('enrichSetTimelineItems', () {
    test('keeps empty description when set has no point actions', () {
      final match = TournamentMatch(
        id: 'm1',
        tournamentId: 't1',
        categoryId: 'cat',
        round: 1,
        matchType: 'Group',
        poolId: 'A',
        teamAId: ourTeamId,
        teamBId: opponentTeamId,
        status: TournamentMatchStatus.completed,
        resultA: '21',
        resultB: '17',
        isGroupMatch: true,
        matchNumber: 1,
        lastActions: const [],
      );

      const items = [
        MatchSetTimelineItem(
          label: 'SET 1',
          description: '',
          ourScore: 21,
          opponentScore: 17,
          isWin: true,
        ),
      ];

      final enriched = enrichSetTimelineItems(
        match: match,
        perspectiveTeamId: ourTeamId,
        items: items,
        isParticipantView: true,
        ourTeamLabel: 'Você',
        opponentTeamLabel: 'Adversário',
      );

      expect(enriched.first.description, isEmpty);
    });

    test('adds narrative when set has point actions', () {
      final match = TournamentMatch(
        id: 'm1',
        tournamentId: 't1',
        categoryId: 'cat',
        round: 1,
        matchType: 'Group',
        poolId: 'A',
        teamAId: ourTeamId,
        teamBId: opponentTeamId,
        status: TournamentMatchStatus.completed,
        resultA: '21',
        resultB: '17',
        isGroupMatch: true,
        matchNumber: 1,
        lastActions: [
          _point(side: 'A', setIndex: 0),
          _point(side: 'A', setIndex: 0),
          _point(side: 'A', setIndex: 0),
          _point(side: 'B', setIndex: 0),
        ],
      );

      const items = [
        MatchSetTimelineItem(
          label: 'SET 1',
          description: '',
          ourScore: 21,
          opponentScore: 17,
          isWin: true,
        ),
      ];

      final enriched = enrichSetTimelineItems(
        match: match,
        perspectiveTeamId: ourTeamId,
        items: items,
        isParticipantView: true,
        ourTeamLabel: 'Você',
        opponentTeamLabel: 'Adversário',
      );

      expect(enriched.first.description, isNotEmpty);
      expect(enriched.first.description, contains('Set'));
    });
  });
}
