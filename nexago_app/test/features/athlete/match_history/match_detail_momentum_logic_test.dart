import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_detail_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/match_detail_momentum_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_point_action.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _match({
  String teamAId = 'team-a',
  String teamBId = 'team-b',
  String status = TournamentMatchStatus.inProgress,
  int? currentSetIndex = 0,
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
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: true,
    matchNumber: 1,
    currentSetIndex: currentSetIndex,
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

  group('buildMatchDetailMomentumInfo', () {
    test('returns null with fewer than 4 point actions', () {
      final match = _match(
        lastActions: [
          _point(side: 'A', setIndex: 0, ts: baseTime),
          _point(side: 'A', setIndex: 0, ts: baseTime.add(Duration(seconds: 1))),
          _point(side: 'B', setIndex: 0, ts: baseTime.add(Duration(seconds: 2))),
        ],
      );

      expect(
        buildMatchDetailMomentumInfo(
          match: match,
          perspectiveTeamId: 'team-a',
          ourTeamLabel: 'João / Carlos',
          opponentTeamLabel: 'Thiago / Léo',
          phase: MatchDetailPhase.live,
          isParticipantView: true,
        ),
        isNull,
      );
    });

    test('builds sparkline that rises and falls for A,A,A,B sequence', () {
      final match = _match(
        lastActions: [
          _point(side: 'A', setIndex: 0, ts: baseTime),
          _point(side: 'A', setIndex: 0, ts: baseTime.add(Duration(seconds: 1))),
          _point(side: 'A', setIndex: 0, ts: baseTime.add(Duration(seconds: 2))),
          _point(side: 'B', setIndex: 0, ts: baseTime.add(Duration(seconds: 3))),
        ],
      );

      final info = buildMatchDetailMomentumInfo(
        match: match,
        perspectiveTeamId: 'team-a',
        ourTeamLabel: 'João / Carlos',
        opponentTeamLabel: 'Thiago / Léo',
        phase: MatchDetailPhase.live,
        isParticipantView: true,
      );

      expect(info, isNotNull);
      expect(info!.points.first, 0.5);
      expect(info.points.last, lessThan(info.points[3]));
      expect(info.points[3], greaterThan(0.5));
      expect(info.eyebrow, 'SET ATUAL');
      expect(info.title, 'Quem está dominando?');
      expect(info.chartPoints.first.scoreLabel, '0-0');
      expect(info.chartPoints.last.scoreLabel, '3-1');
      expect(info.chartPoints.last.scoreDiff, 2);
      expect(info.chartHint, 'Toque no gráfico para percorrer os pontos');
    });

    test('narrates active streak for our team', () {
      final match = _match(
        lastActions: [
          _point(side: 'B', setIndex: 0, ts: baseTime),
          _point(side: 'A', setIndex: 0, ts: baseTime.add(Duration(seconds: 1))),
          _point(side: 'A', setIndex: 0, ts: baseTime.add(Duration(seconds: 2))),
          _point(side: 'A', setIndex: 0, ts: baseTime.add(Duration(seconds: 3))),
          _point(side: 'A', setIndex: 0, ts: baseTime.add(Duration(seconds: 4))),
        ],
      );

      final info = buildMatchDetailMomentumInfo(
        match: match,
        perspectiveTeamId: 'team-a',
        ourTeamLabel: 'João / Carlos',
        opponentTeamLabel: 'Thiago / Léo',
        phase: MatchDetailPhase.live,
        isParticipantView: true,
      );

      expect(info?.narrative, contains('Você emendou 4 pontos seguidos'));
      expect(info?.summaryLabel, '4 pontos seguidos · você');
    });

    test('narrates comeback when team turns set around', () {
      final actions = <TournamentMatchPointAction>[];
      var time = baseTime;
      for (var i = 0; i < 10; i++) {
        actions.add(_point(side: 'B', setIndex: 0, ts: time));
        time = time.add(const Duration(seconds: 1));
      }
      for (var i = 0; i < 16; i++) {
        actions.add(_point(side: 'A', setIndex: 0, ts: time));
        time = time.add(const Duration(seconds: 1));
      }

      final match = _match(lastActions: actions);

      final info = buildMatchDetailMomentumInfo(
        match: match,
        perspectiveTeamId: 'team-a',
        ourTeamLabel: 'João / Carlos',
        opponentTeamLabel: 'Thiago / Léo',
        phase: MatchDetailPhase.completed,
        isParticipantView: true,
      );

      expect(info?.narrative, contains('Virada no set 1'));
      expect(info?.narrative, contains('0-10'));
      expect(info?.narrative, contains('16-10'));
    });

    test('uses team labels for spectator view', () {
      final match = _match(
        lastActions: [
          _point(side: 'A', setIndex: 0, ts: baseTime),
          _point(side: 'A', setIndex: 0, ts: baseTime.add(Duration(seconds: 1))),
          _point(side: 'A', setIndex: 0, ts: baseTime.add(Duration(seconds: 2))),
          _point(side: 'A', setIndex: 0, ts: baseTime.add(Duration(seconds: 3))),
        ],
      );

      final info = buildMatchDetailMomentumInfo(
        match: match,
        perspectiveTeamId: 'team-a',
        ourTeamLabel: 'Dupla A',
        opponentTeamLabel: 'Dupla B',
        phase: MatchDetailPhase.live,
        isParticipantView: false,
      );

      expect(info?.narrative, contains('Dupla A emendou 4 pontos seguidos'));
      expect(info?.summaryLabel, '4 pontos seguidos · Dupla A');
    });

    test('chart includes all set points when lastActions is capped', () {
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

      final info = buildMatchDetailMomentumInfo(
        match: match,
        perspectiveTeamId: 'team-a',
        ourTeamLabel: 'Dupla A',
        opponentTeamLabel: 'Dupla B',
        phase: MatchDetailPhase.completed,
        isParticipantView: true,
      );

      expect(info, isNotNull);
      expect(info!.chartPoints, hasLength(27));
      expect(info.chartPoints.last.scoreLabel, '5-21');
      expect(info.points, hasLength(27));
    });
  });

}
