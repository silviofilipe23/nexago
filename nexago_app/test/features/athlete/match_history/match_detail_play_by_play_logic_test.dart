import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/athlete/domain/match_history/match_detail_play_by_play_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_point_action.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _match({
  String teamAId = 'team-a',
  String teamBId = 'team-b',
  List<TournamentMatchPointAction> lastActions = const [],
}) {
  return TournamentMatch(
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'cat',
    round: 1,
    matchType: 'Group',
    poolId: 'A',
    teamAId: teamAId,
    teamBId: teamBId,
    status: TournamentMatchStatus.inProgress,
    resultA: '',
    resultB: '',
    isGroupMatch: true,
    matchNumber: 1,
    lastActions: lastActions,
  );
}

TournamentMatchPointAction _point({
  required String side,
  required int setIndex,
  required DateTime ts,
}) {
  return TournamentMatchPointAction(
    type: 'point',
    side: side,
    setIndex: setIndex,
    delta: 1,
    ts: ts,
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  final baseTime = DateTime.utc(2026, 6, 9, 17, 0);

  group('buildPlayByPlayTimeline', () {
    test('resets running score at each set', () {
      final match = _match(
        lastActions: [
          _point(side: 'A', setIndex: 0, ts: baseTime),
          _point(side: 'A', setIndex: 0, ts: baseTime.add(Duration(seconds: 1))),
          _point(side: 'B', setIndex: 1, ts: baseTime.add(Duration(seconds: 2))),
        ],
      );

      final groups = buildPlayByPlayTimeline(
        match: match,
        perspectiveTeamId: 'team-a',
        ourTeamLabel: 'João / Carlos',
        opponentTeamLabel: 'Thiago / Léo',
        isParticipantView: true,
      );

      expect(groups, hasLength(2));
      expect(groups[0].setNumber, 1);
      expect(groups[0].items.map((i) => i.scoreLabel), ['1-0', '2-0']);
      expect(groups[0].finalScoreLabel, '2-0');
      expect(groups[1].setNumber, 2);
      expect(groups[1].items.single.scoreLabel, '0-1');
      expect(groups[1].finalScoreLabel, '0-1');
    });

    test('groups items chronologically within each set', () {
      final match = _match(
        lastActions: [
          _point(side: 'A', setIndex: 0, ts: baseTime),
          _point(side: 'B', setIndex: 0, ts: baseTime.add(Duration(seconds: 1))),
          _point(side: 'A', setIndex: 0, ts: baseTime.add(Duration(seconds: 2))),
        ],
      );

      final groups = buildPlayByPlayTimeline(
        match: match,
        perspectiveTeamId: 'team-a',
        ourTeamLabel: 'Dupla A',
        opponentTeamLabel: 'Dupla B',
        isParticipantView: false,
      );

      expect(groups, hasLength(1));
      expect(groups.single.items, hasLength(3));
      expect(groups.single.items.map((i) => i.scoreLabel), ['1-0', '1-1', '2-1']);
    });

    test('uses athlete perspective for team A', () {
      final match = _match(
        lastActions: [
          _point(side: 'A', setIndex: 0, ts: baseTime),
          _point(side: 'B', setIndex: 0, ts: baseTime.add(Duration(seconds: 1))),
        ],
      );

      final groups = buildPlayByPlayTimeline(
        match: match,
        perspectiveTeamId: 'team-a',
        ourTeamLabel: 'João / Carlos',
        opponentTeamLabel: 'Thiago / Léo',
        isParticipantView: true,
      );

      expect(groups.single.items.first.teamLabel, 'sua dupla');
      expect(groups.single.items.first.isOurTeam, isTrue);
      expect(groups.single.items.last.teamLabel, 'adversário');
      expect(groups.single.items.last.isOurTeam, isFalse);
    });

    test('uses athlete perspective for team B', () {
      final match = _match(
        lastActions: [
          _point(side: 'A', setIndex: 0, ts: baseTime),
          _point(side: 'B', setIndex: 0, ts: baseTime.add(Duration(seconds: 1))),
        ],
      );

      final groups = buildPlayByPlayTimeline(
        match: match,
        perspectiveTeamId: 'team-b',
        ourTeamLabel: 'Thiago / Léo',
        opponentTeamLabel: 'João / Carlos',
        isParticipantView: true,
      );

      expect(groups.single.items.first.teamLabel, 'adversário');
      expect(groups.single.items.first.scoreLabel, '0-1');
      expect(groups.single.items.last.teamLabel, 'sua dupla');
      expect(groups.single.items.last.scoreLabel, '1-1');
    });
  });

  group('set score completion', () {
    test('fills missing points when lastActions is shorter than set total', () {
      final actions = <TournamentMatchPointAction>[];
      for (var i = 0; i < 20; i++) {
        final side = i < 5 || i >= 7 ? 'B' : 'A';
        actions.add(
          _point(
            side: side,
            setIndex: 0,
            ts: baseTime.add(Duration(seconds: i)),
          ),
        );
      }

      final match = TournamentMatch(
        id: 'm1',
        tournamentId: 't1',
        categoryId: 'cat',
        round: 1,
        matchType: 'WB',
        poolId: '',
        teamAId: 'team-a',
        teamBId: 'team-b',
        status: TournamentMatchStatus.completed,
        resultA: '5-21',
        resultB: '21-5',
        isGroupMatch: false,
        matchNumber: 4,
        sets: const [
          TournamentMatchSet(a: 5, b: 21),
        ],
        lastActions: actions,
      );

      final groups = buildPlayByPlayTimeline(
        match: match,
        perspectiveTeamId: 'team-a',
        ourTeamLabel: 'Dupla A',
        opponentTeamLabel: 'Dupla B',
        isParticipantView: true,
      );

      expect(groups, hasLength(1));
      expect(groups.single.items, hasLength(26));
      expect(groups.single.finalScoreLabel, '5-21');
      expect(groups.single.items.last.scoreLabel, '5-21');
    });

    test('builds timeline from set scores when lastActions is empty', () {
      final match = TournamentMatch(
        id: 'm1',
        tournamentId: 't1',
        categoryId: 'cat',
        round: 1,
        matchType: 'WB',
        poolId: '',
        teamAId: 'team-a',
        teamBId: 'team-b',
        status: TournamentMatchStatus.completed,
        resultA: '2-0',
        resultB: '0-2',
        isGroupMatch: false,
        matchNumber: 1,
        sets: const [
          TournamentMatchSet(a: 21, b: 18),
          TournamentMatchSet(a: 21, b: 15),
        ],
        lastActions: const [],
        matchStartedAt: baseTime,
        matchEndedAt: baseTime.add(const Duration(minutes: 45)),
      );

      final groups = buildPlayByPlayTimeline(
        match: match,
        perspectiveTeamId: 'team-a',
        ourTeamLabel: 'Dupla A',
        opponentTeamLabel: 'Dupla B',
        isParticipantView: false,
      );

      expect(groups, hasLength(2));
      expect(groups[0].items, hasLength(39));
      expect(groups[0].finalScoreLabel, '21-18');
      expect(groups[1].items, hasLength(36));
      expect(groups[1].finalScoreLabel, '21-15');
    });
  });

  group('buildPlayByPlayPreview', () {
    test('returns latest points most recent first', () {
      final match = _match(
        lastActions: [
          _point(side: 'A', setIndex: 0, ts: baseTime),
          _point(side: 'B', setIndex: 0, ts: baseTime.add(Duration(seconds: 1))),
        ],
      );

      final groups = buildPlayByPlayTimeline(
        match: match,
        perspectiveTeamId: 'team-a',
        ourTeamLabel: 'João / Carlos',
        opponentTeamLabel: 'Thiago / Léo',
        isParticipantView: true,
      );
      final preview = buildPlayByPlayPreview(groups);

      expect(preview, hasLength(2));
      expect(preview.first.description, 'Ponto · adversário');
      expect(preview.last.description, 'Ponto · sua dupla');
    });

    test('limits preview to six most recent points across sets', () {
      final actions = <TournamentMatchPointAction>[];
      for (var i = 0; i < 8; i++) {
        actions.add(
          _point(
            side: i.isEven ? 'A' : 'B',
            setIndex: i < 4 ? 0 : 1,
            ts: baseTime.add(Duration(seconds: i)),
          ),
        );
      }

      final groups = buildPlayByPlayTimeline(
        match: _match(lastActions: actions),
        perspectiveTeamId: 'team-a',
        ourTeamLabel: 'Dupla A',
        opponentTeamLabel: 'Dupla B',
        isParticipantView: false,
      );
      final preview = buildPlayByPlayPreview(groups);

      expect(preview, hasLength(6));
      expect(preview.first.setNumber, 2);
      expect(preview.last.setNumber, 1);
    });
  });
}
