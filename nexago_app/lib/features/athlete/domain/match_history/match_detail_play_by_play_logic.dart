import 'package:intl/intl.dart';

import '../../../tournaments/domain/tournament_match.dart';
import 'athlete_match_detail_models.dart';

const playByPlayPreviewLimit = 6;

List<MatchDetailPlayByPlayGroup> buildPlayByPlayTimeline({
  required TournamentMatch match,
  required String perspectiveTeamId,
  required String ourTeamLabel,
  required String opponentTeamLabel,
  required bool isParticipantView,
}) {
  final ourIsSideA = match.teamAId.trim() == perspectiveTeamId.trim();
  final pointActions =
      match.lastActions.where((a) => a.isPoint).toList()
        ..sort((a, b) => a.ts.compareTo(b.ts));

  final pointsBySet = <int, List<_TimelinePoint>>{};
  for (final action in pointActions) {
    final setIndex = action.setIndex;
    final current = pointsBySet[setIndex];
    final last = current == null || current.isEmpty
        ? (our: 0, opp: 0)
        : (our: current.last.ourScore, opp: current.last.oppScore);
    final isOurPoint = action.isSideA == ourIsSideA;
    final updated = isOurPoint
        ? (our: last.our + action.delta, opp: last.opp)
        : (our: last.our, opp: last.opp + action.delta);

    pointsBySet.putIfAbsent(setIndex, () => []).add(
      _TimelinePoint(
        ts: action.ts,
        isOurTeam: isOurPoint,
        ourScore: updated.our,
        oppScore: updated.opp,
      ),
    );
  }

  if (match.sets.isNotEmpty) {
    _completeTimelineFromSetScores(
      pointsBySet: pointsBySet,
      match: match,
      ourIsSideA: ourIsSideA,
    );
  }

  if (pointsBySet.isEmpty) return const [];

  final fmt = DateFormat('HH:mm', 'pt_BR');
  final setIndexes = <int>{
    ...pointsBySet.keys,
    for (var i = 0; i < match.sets.length; i++)
      if (match.sets[i].a + match.sets[i].b > 0) i,
  }.toList()
    ..sort();

  return [
    for (final setIndex in setIndexes)
      MatchDetailPlayByPlayGroup(
        setNumber: setIndex + 1,
        setIndex: setIndex,
        finalScoreLabel: _finalScoreLabelForSet(
          match: match,
          setIndex: setIndex,
          ourIsSideA: ourIsSideA,
          pointsBySet: pointsBySet,
        ),
        items: _toPlayByPlayItems(
          points: pointsBySet[setIndex] ?? const [],
          setNumber: setIndex + 1,
          fmt: fmt,
          ourTeamLabel: ourTeamLabel,
          opponentTeamLabel: opponentTeamLabel,
          isParticipantView: isParticipantView,
        ),
      ),
  ];
}

List<MatchDetailPlayByPlayItem> buildPlayByPlayPreview(
  List<MatchDetailPlayByPlayGroup> groups, {
  int limit = playByPlayPreviewLimit,
}) {
  final flat = <MatchDetailPlayByPlayItem>[
    for (final group in groups) ...group.items,
  ];
  if (flat.isEmpty) return const [];
  if (flat.length <= limit) return flat.reversed.toList();
  return flat.reversed.take(limit).toList();
}

void _completeTimelineFromSetScores({
  required Map<int, List<_TimelinePoint>> pointsBySet,
  required TournamentMatch match,
  required bool ourIsSideA,
}) {
  for (var setIndex = 0; setIndex < match.sets.length; setIndex++) {
    final set = match.sets[setIndex];
    final targetOur = ourIsSideA ? set.a : set.b;
    final targetOpp = ourIsSideA ? set.b : set.a;
    if (targetOur + targetOpp == 0) continue;

    final recorded = List<_TimelinePoint>.from(pointsBySet[setIndex] ?? const []);
    final setStart = set.startedAt ?? match.matchStartedAt ?? recorded.firstOrNull?.ts;
    final setEnd = set.endedAt ?? match.matchEndedAt ?? recorded.lastOrNull?.ts;

    var prefixOur = 0;
    var prefixOpp = 0;
    var suffixOur = 0;
    var suffixOpp = 0;
    var recordedEndOur = 0;
    var recordedEndOpp = 0;

    if (recorded.isEmpty) {
      suffixOur = targetOur;
      suffixOpp = targetOpp;
    } else {
      recordedEndOur = recorded.last.ourScore;
      recordedEndOpp = recorded.last.oppScore;

      final first = recorded.first;
      if (first.isOurTeam) {
        prefixOur = first.ourScore - 1;
        prefixOpp = first.oppScore;
      } else {
        prefixOur = first.ourScore;
        prefixOpp = first.oppScore - 1;
      }

      suffixOur = targetOur - recordedEndOur;
      suffixOpp = targetOpp - recordedEndOpp;
    }

    if (prefixOur < 0 || prefixOpp < 0 || suffixOur < 0 || suffixOpp < 0) {
      continue;
    }

    final prefix = _syntheticPoints(
      countOur: prefixOur,
      countOpp: prefixOpp,
      startOur: 0,
      startOpp: 0,
      startTime: setStart,
      endTime: recorded.isEmpty
          ? (setEnd ?? setStart ?? DateTime.now())
          : recorded.first.ts,
    );

    final suffix = _syntheticPoints(
      countOur: suffixOur,
      countOpp: suffixOpp,
      startOur: recordedEndOur,
      startOpp: recordedEndOpp,
      startTime: recorded.isEmpty
          ? (setStart ?? DateTime.now())
          : recorded.last.ts,
      endTime: setEnd ?? recorded.lastOrNull?.ts ?? setStart ?? DateTime.now(),
    );

    pointsBySet[setIndex] = [...prefix, ...recorded, ...suffix];
  }
}

List<_TimelinePoint> _syntheticPoints({
  required int countOur,
  required int countOpp,
  required int startOur,
  required int startOpp,
  required DateTime? startTime,
  required DateTime? endTime,
}) {
  final total = countOur + countOpp;
  if (total <= 0) return const [];

  final sides = _interleavePointSides(countOur: countOur, countOpp: countOpp);
  final start = startTime ?? DateTime.now();
  final end = endTime ?? start;
  final durationMs = end.isAfter(start)
      ? end.difference(start).inMilliseconds
      : total * 1000;

  var our = startOur;
  var opp = startOpp;
  final points = <_TimelinePoint>[];

  for (var i = 0; i < sides.length; i++) {
    final isOurTeam = sides[i];
    if (isOurTeam) {
      our++;
    } else {
      opp++;
    }

    final progress = sides.length == 1 ? 1.0 : i / (sides.length - 1);
    final ts = start.add(
      Duration(milliseconds: (durationMs * progress).round()),
    );

    points.add(
      _TimelinePoint(
        ts: ts,
        isOurTeam: isOurTeam,
        ourScore: our,
        oppScore: opp,
      ),
    );
  }

  return points;
}

List<bool> _interleavePointSides({
  required int countOur,
  required int countOpp,
}) {
  final sides = <bool>[];
  var ourLeft = countOur;
  var oppLeft = countOpp;

  while (ourLeft > 0 || oppLeft > 0) {
    if (ourLeft > oppLeft && ourLeft > 0) {
      sides.add(true);
      ourLeft--;
    } else if (oppLeft > 0) {
      sides.add(false);
      oppLeft--;
    } else if (ourLeft > 0) {
      sides.add(true);
      ourLeft--;
    }
  }

  return sides;
}

List<MatchDetailPlayByPlayItem> _toPlayByPlayItems({
  required List<_TimelinePoint> points,
  required int setNumber,
  required DateFormat fmt,
  required String ourTeamLabel,
  required String opponentTeamLabel,
  required bool isParticipantView,
}) {
  return [
    for (final point in points)
      MatchDetailPlayByPlayItem(
        time: fmt.format(point.ts),
        isOurTeam: point.isOurTeam,
        description: 'Ponto · ${_teamLabelForPoint(
          isOurPoint: point.isOurTeam,
          ourTeamLabel: ourTeamLabel,
          opponentTeamLabel: opponentTeamLabel,
          isParticipantView: isParticipantView,
        )}',
        setNumber: setNumber,
        scoreLabel: '${point.ourScore}-${point.oppScore}',
        teamLabel: _teamLabelForPoint(
          isOurPoint: point.isOurTeam,
          ourTeamLabel: ourTeamLabel,
          opponentTeamLabel: opponentTeamLabel,
          isParticipantView: isParticipantView,
        ),
      ),
  ];
}

String _finalScoreLabelForSet({
  required TournamentMatch match,
  required int setIndex,
  required bool ourIsSideA,
  required Map<int, List<_TimelinePoint>> pointsBySet,
}) {
  if (setIndex < match.sets.length) {
    final set = match.sets[setIndex];
    final our = ourIsSideA ? set.a : set.b;
    final opp = ourIsSideA ? set.b : set.a;
    if (our + opp > 0) return '$our-$opp';
  }

  final points = pointsBySet[setIndex];
  if (points == null || points.isEmpty) return '0-0';
  final last = points.last;
  return '${last.ourScore}-${last.oppScore}';
}

String _teamLabelForPoint({
  required bool isOurPoint,
  required String ourTeamLabel,
  required String opponentTeamLabel,
  required bool isParticipantView,
}) {
  if (isParticipantView) {
    return isOurPoint ? 'sua dupla' : 'adversário';
  }
  return isOurPoint ? ourTeamLabel : opponentTeamLabel;
}

class _TimelinePoint {
  const _TimelinePoint({
    required this.ts,
    required this.isOurTeam,
    required this.ourScore,
    required this.oppScore,
  });

  final DateTime ts;
  final bool isOurTeam;
  final int ourScore;
  final int oppScore;
}

extension _FirstLast<T> on List<T> {
  T? get firstOrNull => isEmpty ? null : first;
  T? get lastOrNull => isEmpty ? null : last;
}
