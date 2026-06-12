import 'athlete_match_detail_models.dart';

enum PlayByPlayPointAnnotation { empate, virada }

class PlayByPlayPointRow {
  const PlayByPlayPointRow({
    required this.scoreLabel,
    this.annotation,
  });

  final String scoreLabel;
  final PlayByPlayPointAnnotation? annotation;
}

class PlayByPlayStreakBlock {
  const PlayByPlayStreakBlock({
    required this.isOurTeam,
    required this.label,
    required this.time,
    required this.points,
    this.isLongestStreak = false,
  });

  final bool isOurTeam;
  final String label;
  final String time;
  final List<PlayByPlayPointRow> points;
  final bool isLongestStreak;
}

class PlayByPlaySetSummary {
  const PlayByPlaySetSummary({
    required this.closerLabel,
    required this.finalScore,
    required this.maxStreak,
    required this.comebackCount,
    required this.tieCount,
    required this.durationLabel,
  });

  final String closerLabel;
  final String finalScore;
  final int maxStreak;
  final int comebackCount;
  final int tieCount;
  final String durationLabel;
}

class PlayByPlaySetTimeline {
  const PlayByPlaySetTimeline({
    required this.setNumber,
    required this.startTime,
    required this.blocks,
    required this.summary,
    this.unrecordedPointsCount = 0,
    this.lastRecordedScoreLabel,
  });

  final int setNumber;
  final String startTime;
  final List<PlayByPlayStreakBlock> blocks;
  final PlayByPlaySetSummary summary;
  final int unrecordedPointsCount;
  final String? lastRecordedScoreLabel;
}

PlayByPlaySetTimeline buildPlayByPlaySetTimeline({
  required MatchDetailPlayByPlayGroup group,
  required AthleteMatchDetail detail,
}) {
  final items = group.items;
  final recordedItems =
      items.where((item) => !item.isEstimated).toList(growable: false);
  final unrecordedPointsCount = items.length - recordedItems.length;

  if (recordedItems.isEmpty && items.isNotEmpty) {
    return PlayByPlaySetTimeline(
      setNumber: group.setNumber,
      startTime: '—',
      blocks: const [],
      unrecordedPointsCount: unrecordedPointsCount,
      summary: PlayByPlaySetSummary(
        closerLabel: _closerLabelFromFinalScore(
          detail: detail,
          finalScoreLabel: group.finalScoreLabel,
        ),
        finalScore: _displayScore(group.finalScoreLabel),
        maxStreak: 0,
        comebackCount: 0,
        tieCount: 0,
        durationLabel: '—',
      ),
    );
  }

  if (recordedItems.isEmpty) {
    return PlayByPlaySetTimeline(
      setNumber: group.setNumber,
      startTime: '—',
      blocks: const [],
      summary: PlayByPlaySetSummary(
        closerLabel: '—',
        finalScore: _displayScore(group.finalScoreLabel),
        maxStreak: 0,
        comebackCount: 0,
        tieCount: 0,
        durationLabel: '—',
      ),
    );
  }

  final rawBlocks = _buildStreakBlocks(recordedItems);
  final maxStreak = rawBlocks.isEmpty
      ? 0
      : rawBlocks.map((b) => b.points.length).reduce((a, b) => a > b ? a : b);

  final blocks = [
    for (final block in rawBlocks)
      PlayByPlayStreakBlock(
        isOurTeam: block.isOurTeam,
        label: block.label,
        time: block.time,
        points: block.points,
        isLongestStreak: block.points.length == maxStreak && maxStreak >= 2,
      ),
  ];

  var tieCount = 0;
  var comebackCount = 0;
  for (final block in blocks) {
    for (final point in block.points) {
      if (point.annotation == PlayByPlayPointAnnotation.empate) tieCount++;
      if (point.annotation == PlayByPlayPointAnnotation.virada) comebackCount++;
    }
  }

  final closerLabel = _closerLabelFromFinalScore(
    detail: detail,
    finalScoreLabel: group.finalScoreLabel,
  );
  final lastRecorded = recordedItems.last;

  return PlayByPlaySetTimeline(
    setNumber: group.setNumber,
    startTime: recordedItems.first.time,
    blocks: blocks,
    unrecordedPointsCount: unrecordedPointsCount,
    lastRecordedScoreLabel: unrecordedPointsCount > 0
        ? _displayScore(lastRecorded.scoreLabel)
        : null,
    summary: PlayByPlaySetSummary(
      closerLabel: closerLabel,
      finalScore: _displayScore(group.finalScoreLabel),
      maxStreak: maxStreak,
      comebackCount: comebackCount,
      tieCount: tieCount,
      durationLabel: _durationLabel(recordedItems),
    ),
  );
}

String _closerLabelFromFinalScore({
  required AthleteMatchDetail detail,
  required String finalScoreLabel,
}) {
  final score = _parseScore(finalScoreLabel);
  if (score.our > score.opp) return detail.ourTeam.label;
  if (score.opp > score.our) return detail.opponentTeam.label;
  return '—';
}

int defaultPlayByPlaySetIndex(AthleteMatchDetail detail) {
  if (detail.playByPlayGroups.isEmpty) {
    return detail.currentSetIndex ?? 0;
  }

  if (detail.phase == MatchDetailPhase.live) {
    final current = detail.currentSetIndex;
    if (current != null) return current;
  }

  return detail.playByPlayGroups.last.setIndex;
}

MatchDetailPlayByPlayGroup? playByPlayGroupForSet(
  AthleteMatchDetail detail,
  int setIndex,
) {
  for (final group in detail.playByPlayGroups) {
    if (group.setIndex == setIndex) return group;
  }
  return null;
}

String buildPlayByPlaySubtitle(AthleteMatchDetail detail) {
  final parts = <String>[
    detail.tournamentName.trim(),
    detail.stageLabel.trim(),
    if (detail.venueLabel.trim().isNotEmpty) detail.venueLabel.trim(),
  ].where((p) => p.isNotEmpty);
  return parts.join(' · ').toUpperCase();
}

class _RawStreakBlock {
  const _RawStreakBlock({
    required this.isOurTeam,
    required this.label,
    required this.time,
    required this.points,
  });

  final bool isOurTeam;
  final String label;
  final String time;
  final List<PlayByPlayPointRow> points;
}

List<_RawStreakBlock> _buildStreakBlocks(List<MatchDetailPlayByPlayItem> items) {
  final blocks = <_RawStreakBlock>[];
  if (items.isEmpty) return blocks;

  var streakStart = 0;
  for (var i = 1; i <= items.length; i++) {
    final streakEnded = i == items.length ||
        items[i].isOurTeam != items[streakStart].isOurTeam;
    if (!streakEnded) continue;

    final streakItems = items.sublist(streakStart, i);
    final points = <PlayByPlayPointRow>[];

    for (var j = 0; j < streakItems.length; j++) {
      final item = streakItems[j];
      final score = _parseScore(item.scoreLabel);
      final prevScore = j == 0
          ? _scoreBeforePoint(score, item.isOurTeam)
          : _parseScore(streakItems[j - 1].scoreLabel);

      PlayByPlayPointAnnotation? annotation;
      if (score.our == score.opp) {
        annotation = PlayByPlayPointAnnotation.empate;
      } else if (_tookLead(
        before: prevScore,
        after: score,
        isOurPoint: item.isOurTeam,
      )) {
        annotation = PlayByPlayPointAnnotation.virada;
      }

      points.add(
        PlayByPlayPointRow(
          scoreLabel: _displayScore(item.scoreLabel),
          annotation: annotation,
        ),
      );
    }

    final length = streakItems.length;
    blocks.add(
      _RawStreakBlock(
        isOurTeam: streakItems.first.isOurTeam,
        label: length == 1 ? 'PONTO' : '$length SEGUIDOS',
        time: streakItems.first.time,
        points: points,
      ),
    );
    streakStart = i;
  }

  return blocks;
}

({int our, int opp}) _parseScore(String raw) {
  final normalized = raw.replaceAll('—', '-').replaceAll('–', '-');
  final parts = normalized.split('-').map((p) => p.trim()).toList();
  if (parts.length != 2) return (our: 0, opp: 0);
  return (our: int.tryParse(parts[0]) ?? 0, opp: int.tryParse(parts[1]) ?? 0);
}

({int our, int opp}) _scoreBeforePoint(
  ({int our, int opp}) after,
  bool isOurPoint,
) {
  if (isOurPoint) {
    return (our: after.our - 1, opp: after.opp);
  }
  return (our: after.our, opp: after.opp - 1);
}

bool _tookLead({
  required ({int our, int opp}) before,
  required ({int our, int opp}) after,
  required bool isOurPoint,
}) {
  if (isOurPoint) {
    return after.our > after.opp && before.our <= before.opp;
  }
  return after.opp > after.our && before.opp <= before.our;
}

String _displayScore(String raw) {
  final score = _parseScore(raw);
  return '${score.our} – ${score.opp}';
}

String _durationLabel(List<MatchDetailPlayByPlayItem> items) {
  if (items.length < 2) return '—';

  final start = _parseClock(items.first.time);
  final end = _parseClock(items.last.time);
  if (start == null || end == null) return '—';

  var diff = end - start;
  if (diff < 0) diff += 24 * 60;
  if (diff <= 0) return "1'";
  return "$diff'";
}

int? _parseClock(String time) {
  final parts = time.split(':');
  if (parts.length != 2) return null;
  final hour = int.tryParse(parts[0]);
  final minute = int.tryParse(parts[1]);
  if (hour == null || minute == null) return null;
  return hour * 60 + minute;
}
