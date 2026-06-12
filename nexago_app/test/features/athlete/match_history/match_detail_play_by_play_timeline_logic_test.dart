import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_detail_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/match_detail_play_by_play_timeline_logic.dart';

AthleteMatchDetail _detail({
  List<MatchDetailPlayByPlayGroup> groups = const [],
  MatchDetailPhase phase = MatchDetailPhase.completed,
  int? currentSetIndex,
}) {
  return AthleteMatchDetail(
    id: 'm1',
    phase: phase,
    result: AthleteMatchResult.win,
    resultBadgeLabel: 'VITÓRIA',
    stageLabel: 'Oitavas',
    ourSetsWon: 2,
    opponentSetsWon: 1,
    ourTeam: const MatchTeamSide(
      players: [],
      label: 'Carlos / Daniel',
      roleLabel: 'VOCÊ',
      isCurrentUser: true,
    ),
    opponentTeam: const MatchTeamSide(
      players: [],
      label: 'Diego / Eduardo',
      roleLabel: 'ADVERSÁRIO',
    ),
    sets: const [
      MatchSetScore(label: 'Set 1', ourScore: 18, opponentScore: 21),
    ],
    tournamentName: 'Copa Goiás',
    dateTimeLabel: '9 jun',
    venueLabel: 'QD 2',
    categoryLabel: 'Open',
    durationLabel: '27 min',
    currentSetIndex: currentSetIndex,
    playByPlayGroups: groups,
  );
}

MatchDetailPlayByPlayItem _item({
  required String time,
  required bool isOurTeam,
  required String score,
  String teamLabel = 'sua dupla',
}) {
  return MatchDetailPlayByPlayItem(
    time: time,
    isOurTeam: isOurTeam,
    description: 'Ponto · $teamLabel',
    setNumber: 1,
    scoreLabel: score,
    teamLabel: teamLabel,
  );
}

void main() {
  group('buildPlayByPlaySetTimeline', () {
    test('groups consecutive points into streak blocks', () {
      final group = MatchDetailPlayByPlayGroup(
        setNumber: 1,
        setIndex: 0,
        finalScoreLabel: '4-4',
        items: [
          _item(time: '14:12', isOurTeam: true, score: '1-0'),
          _item(time: '14:12', isOurTeam: true, score: '2-0'),
          _item(time: '14:12', isOurTeam: true, score: '3-0'),
          _item(time: '14:12', isOurTeam: true, score: '4-0'),
          _item(time: '14:15', isOurTeam: false, score: '4-1', teamLabel: 'adversário'),
          _item(time: '14:15', isOurTeam: false, score: '4-2', teamLabel: 'adversário'),
          _item(time: '14:15', isOurTeam: false, score: '4-3', teamLabel: 'adversário'),
          _item(time: '14:15', isOurTeam: false, score: '4-4', teamLabel: 'adversário'),
        ],
      );

      final timeline = buildPlayByPlaySetTimeline(
        group: group,
        detail: _detail(groups: [group]),
      );

      expect(timeline.blocks, hasLength(2));
      expect(timeline.blocks.first.label, '4 SEGUIDOS');
      expect(timeline.blocks.last.label, '4 SEGUIDOS');
      expect(
        timeline.blocks.last.points.last.annotation,
        PlayByPlayPointAnnotation.empate,
      );
    });

    test('marks virada when team takes the lead', () {
      final group = MatchDetailPlayByPlayGroup(
        setNumber: 1,
        setIndex: 0,
        finalScoreLabel: '7-8',
        items: [
          _item(time: '14:19', isOurTeam: true, score: '7-5'),
          _item(time: '14:19', isOurTeam: true, score: '7-6'),
          _item(time: '14:19', isOurTeam: false, score: '7-7', teamLabel: 'adversário'),
          _item(time: '14:19', isOurTeam: false, score: '7-8', teamLabel: 'adversário'),
        ],
      );

      final timeline = buildPlayByPlaySetTimeline(
        group: group,
        detail: _detail(groups: [group]),
      );

      final opponentBlock = timeline.blocks.last;
      expect(opponentBlock.points[0].annotation, PlayByPlayPointAnnotation.empate);
      expect(opponentBlock.points[1].annotation, PlayByPlayPointAnnotation.virada);
      expect(timeline.summary.comebackCount, 1);
      expect(timeline.summary.tieCount, 1);
    });

    test('flags longest streak and builds summary footer', () {
      final items = <MatchDetailPlayByPlayItem>[
        for (var i = 1; i <= 6; i++)
          _item(
            time: '14:19',
            isOurTeam: false,
            score: '7-${4 + i}',
            teamLabel: 'adversário',
          ),
        _item(time: '14:24', isOurTeam: true, score: '8-10'),
        _item(time: '14:36', isOurTeam: true, score: '18-21'),
      ];

      final group = MatchDetailPlayByPlayGroup(
        setNumber: 1,
        setIndex: 0,
        finalScoreLabel: '18-21',
        items: items,
      );

      final timeline = buildPlayByPlaySetTimeline(
        group: group,
        detail: _detail(groups: [group]),
      );

      expect(timeline.blocks.first.isLongestStreak, isTrue);
      expect(timeline.summary.maxStreak, 6);
      expect(timeline.summary.closerLabel, 'Diego / Eduardo');
      expect(timeline.summary.finalScore, '18 – 21');
    });

    test('excludes estimated points from streak blocks', () {
      final group = MatchDetailPlayByPlayGroup(
        setNumber: 1,
        setIndex: 0,
        finalScoreLabel: '18-21',
        items: [
          _item(time: '14:19', isOurTeam: false, score: '7-8', teamLabel: 'adversário'),
          _item(time: '14:20', isOurTeam: false, score: '7-9', teamLabel: 'adversário'),
          _item(time: '14:21', isOurTeam: false, score: '7-10', teamLabel: 'adversário'),
          MatchDetailPlayByPlayItem(
            time: '14:36',
            isOurTeam: true,
            description: 'Ponto · sua dupla',
            setNumber: 1,
            scoreLabel: '18-21',
            teamLabel: 'sua dupla',
            isEstimated: true,
          ),
        ],
      );

      final timeline = buildPlayByPlaySetTimeline(
        group: group,
        detail: _detail(groups: [group]),
      );

      expect(timeline.blocks, hasLength(1));
      expect(timeline.blocks.single.points, hasLength(3));
      expect(timeline.unrecordedPointsCount, 1);
      expect(timeline.lastRecordedScoreLabel, '7 – 10');
      expect(timeline.summary.finalScore, '18 – 21');
      expect(timeline.summary.closerLabel, 'Diego / Eduardo');
    });

    test('uses PONTO label for isolated points', () {
      final group = MatchDetailPlayByPlayGroup(
        setNumber: 1,
        setIndex: 0,
        finalScoreLabel: '1-0',
        items: [_item(time: '14:29', isOurTeam: true, score: '1-0')],
      );

      final timeline = buildPlayByPlaySetTimeline(
        group: group,
        detail: _detail(groups: [group]),
      );

      expect(timeline.blocks.single.label, 'PONTO');
    });
  });

  group('defaultPlayByPlaySetIndex', () {
    test('returns current set when live', () {
      final detail = _detail(
        phase: MatchDetailPhase.live,
        currentSetIndex: 1,
        groups: [
          const MatchDetailPlayByPlayGroup(
            setNumber: 1,
            setIndex: 0,
            finalScoreLabel: '21-18',
            items: [],
          ),
          MatchDetailPlayByPlayGroup(
            setNumber: 2,
            setIndex: 1,
            finalScoreLabel: '10-8',
            items: [_item(time: '15:00', isOurTeam: true, score: '10-8')],
          ),
        ],
      );

      expect(defaultPlayByPlaySetIndex(detail), 1);
    });
  });
}
