import 'package:intl/intl.dart';

import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_point_event.dart';
import '../../../tournaments/domain/tournament_match_point_action.dart';
import 'athlete_match_detail_models.dart';
import 'match_detail_play_by_play_logic.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';

const _minPointsForMomentum = 4;

MatchDetailMomentumInfo? buildMatchDetailMomentumInfo({
  required TournamentMatch match,
  required String perspectiveTeamId,
  required String ourTeamLabel,
  required String opponentTeamLabel,
  required MatchDetailPhase phase,
  required bool isParticipantView,
  List<TournamentMatchPointEvent> pointEvents = const [],
}) {
  if (phase != MatchDetailPhase.live && phase != MatchDetailPhase.completed) {
    return null;
  }

  final focusSetIndex = _focusSetIndex(match, phase);
  if (focusSetIndex == null) return null;

  final ourIsSideA = _ourIsSideA(match, perspectiveTeamId);
  final actions = _pointActionsForSet(match.lastActions, focusSetIndex);
  final setItems = _focusSetPlayByPlayItems(
    match: match,
    focusSetIndex: focusSetIndex,
    perspectiveTeamId: perspectiveTeamId,
    ourTeamLabel: ourTeamLabel,
    opponentTeamLabel: opponentTeamLabel,
    isParticipantView: isParticipantView,
    pointEvents: pointEvents,
  );

  final scoredPointCount =
      setItems.isNotEmpty ? setItems.length : actions.length;
  if (scoredPointCount < _minPointsForMomentum) return null;

  final chartPoints = setItems.isNotEmpty
      ? _buildChartPointsFromPlayByPlay(setItems)
      : _buildChartPointsFromActions(
          actions: actions,
          ourIsSideA: ourIsSideA,
          ourTeamLabel: ourTeamLabel,
          opponentTeamLabel: opponentTeamLabel,
          isParticipantView: isParticipantView,
        );
  if (chartPoints.length < 2) return null;

  final sparkline = _buildSparklineFromChartPoints(chartPoints);
  if (sparkline.length < 2) return null;

  final ourLabel = isParticipantView ? 'você' : ourTeamLabel;
  final opponentLabel = isParticipantView ? 'adversário' : opponentTeamLabel;
  final setNumber = focusSetIndex + 1;
  final isLive = phase == MatchDetailPhase.live;

  return MatchDetailMomentumInfo(
    eyebrow: isLive ? 'SET ATUAL' : 'RESUMO DO SET',
    title: isLive ? 'Quem está dominando?' : 'Como foi o ritmo',
    points: sparkline,
    ourTeamLabel: ourTeamLabel,
    opponentTeamLabel: opponentTeamLabel,
    chartPoints: chartPoints,
    narrative: buildSetNarrative(
      actions: actions,
      ourIsSideA: ourIsSideA,
      ourLabel: ourLabel,
      opponentLabel: opponentLabel,
      setNumber: setNumber,
      isParticipantView: isParticipantView,
    ),
    summaryLabel: _buildSummaryLabel(
      actions: actions,
      ourIsSideA: ourIsSideA,
      ourLabel: ourLabel,
      opponentLabel: opponentLabel,
      isParticipantView: isParticipantView,
    ),
    chartHint: 'Toque no gráfico para percorrer os pontos',
  );
}

List<MatchDetailPlayByPlayItem> _focusSetPlayByPlayItems({
  required TournamentMatch match,
  required int focusSetIndex,
  required String perspectiveTeamId,
  required String ourTeamLabel,
  required String opponentTeamLabel,
  required bool isParticipantView,
  List<TournamentMatchPointEvent> pointEvents = const [],
}) {
  final groups = buildPlayByPlayTimeline(
    match: match,
    perspectiveTeamId: perspectiveTeamId,
    ourTeamLabel: ourTeamLabel,
    opponentTeamLabel: opponentTeamLabel,
    isParticipantView: isParticipantView,
    pointEvents: pointEvents,
  );

  for (final group in groups) {
    if (group.setIndex == focusSetIndex) {
      return group.items;
    }
  }
  return const [];
}

List<MatchDetailMomentumChartPoint> _buildChartPointsFromPlayByPlay(
  List<MatchDetailPlayByPlayItem> items,
) {
  final points = <MatchDetailMomentumChartPoint>[
    const MatchDetailMomentumChartPoint(
      scoreDiff: 0,
      time: '—',
      scoreLabel: '0-0',
      isOurTeam: true,
      teamLabel: '',
    ),
  ];

  for (final item in items) {
    final scoreParts = item.scoreLabel.split('-');
    if (scoreParts.length != 2) continue;

    final ourScore = int.tryParse(scoreParts[0]);
    final oppScore = int.tryParse(scoreParts[1]);
    if (ourScore == null || oppScore == null) continue;

    points.add(
      MatchDetailMomentumChartPoint(
        scoreDiff: ourScore - oppScore,
        time: item.time,
        scoreLabel: item.scoreLabel,
        isOurTeam: item.isOurTeam,
        teamLabel: item.teamLabel,
      ),
    );
  }

  return points;
}

List<MatchDetailMomentumChartPoint> _buildChartPointsFromActions({
  required List<TournamentMatchPointAction> actions,
  required bool ourIsSideA,
  required String ourTeamLabel,
  required String opponentTeamLabel,
  required bool isParticipantView,
}) {
  final sorted = List<TournamentMatchPointAction>.from(actions)
    ..sort((a, b) => a.ts.compareTo(b.ts));
  final fmt = DateFormat('HH:mm', 'pt_BR');

  var ourScore = 0;
  var oppScore = 0;
  final points = <MatchDetailMomentumChartPoint>[
    const MatchDetailMomentumChartPoint(
      scoreDiff: 0,
      time: '—',
      scoreLabel: '0-0',
      isOurTeam: true,
      teamLabel: '',
    ),
  ];

  for (final action in sorted) {
    final isOurPoint = action.isSideA == ourIsSideA;
    if (isOurPoint) {
      ourScore += action.delta;
    } else {
      oppScore += action.delta;
    }

    final teamLabel = isOurPoint
        ? (isParticipantView ? 'sua dupla' : ourTeamLabel)
        : (isParticipantView ? 'adversário' : opponentTeamLabel);

    points.add(
      MatchDetailMomentumChartPoint(
        scoreDiff: ourScore - oppScore,
        // `ts` é instante (UTC): a hora do ponto é a da parede SP.
        time: fmt.format(toNexagoEventLocal(action.ts)),
        scoreLabel: '$ourScore-$oppScore',
        isOurTeam: isOurPoint,
        teamLabel: teamLabel,
      ),
    );
  }

  return points;
}

List<double> _buildSparklineFromChartPoints(
  List<MatchDetailMomentumChartPoint> chartPoints,
) {
  return [
    for (final point in chartPoints)
      0.5 + (point.scoreDiff / 8).clamp(-0.45, 0.45),
  ];
}

int? _focusSetIndex(TournamentMatch match, MatchDetailPhase phase) {
  if (phase == MatchDetailPhase.live) {
    return match.currentSetIndex;
  }

  final setIndexes = match.lastActions
      .where((a) => a.isPoint)
      .map((a) => a.setIndex)
      .toSet()
      .toList()
    ..sort();
  if (setIndexes.isEmpty) return null;
  return setIndexes.last;
}

List<TournamentMatchPointAction> _pointActionsForSet(
  List<TournamentMatchPointAction> actions,
  int setIndex,
) {
  return actions.where((a) => a.isPoint && a.setIndex == setIndex).toList();
}

bool _ourIsSideA(TournamentMatch match, String perspectiveTeamId) {
  return match.teamAId.trim() == perspectiveTeamId.trim();
}

String? _buildSummaryLabel({
  required List<TournamentMatchPointAction> actions,
  required bool ourIsSideA,
  required String ourLabel,
  required String opponentLabel,
  required bool isParticipantView,
}) {
  final streak = _activeStreak(actions, ourIsSideA: ourIsSideA);
  if (streak == null || streak.$2 < 2) return null;

  final who = streak.$1
      ? (isParticipantView ? 'você' : ourLabel)
      : (isParticipantView ? 'adversário' : opponentLabel);
  return '${streak.$2} pontos seguidos · $who';
}

String buildSetNarrative({
  required List<TournamentMatchPointAction> actions,
  required bool ourIsSideA,
  required String ourLabel,
  required String opponentLabel,
  required int setNumber,
  required bool isParticipantView,
}) {
  final comeback = _comebackNarrative(
    actions: actions,
    ourIsSideA: ourIsSideA,
    ourLabel: ourLabel,
    setNumber: setNumber,
    isParticipantView: isParticipantView,
  );
  if (comeback != null) return comeback;

  final streak = _activeStreak(actions, ourIsSideA: ourIsSideA);
  if (streak != null && streak.$2 >= 3) {
    if (streak.$1) {
      return isParticipantView
          ? 'Você emendou ${streak.$2} pontos seguidos no set $setNumber.'
          : '$ourLabel emendou ${streak.$2} pontos seguidos no set $setNumber.';
    }
    return isParticipantView
        ? 'Adversário com ${streak.$2} pontos seguidos no set $setNumber.'
        : '$opponentLabel com ${streak.$2} pontos seguidos no set $setNumber.';
  }

  final dominance = _dominanceNarrative(
    actions: actions,
    ourIsSideA: ourIsSideA,
    ourLabel: ourLabel,
    setNumber: setNumber,
    isParticipantView: isParticipantView,
  );
  if (dominance != null) return dominance;

  final maxDiff = _maxPointDifference(actions, ourIsSideA: ourIsSideA);
  if (maxDiff <= 2) {
    return 'Set equilibrado — a diferença nunca passou de 2 pontos.';
  }

  return 'Set $setNumber disputado ponto a ponto até o final.';
}

String? _comebackNarrative({
  required List<TournamentMatchPointAction> actions,
  required bool ourIsSideA,
  required String ourLabel,
  required int setNumber,
  required bool isParticipantView,
}) {
  var ourScore = 0;
  var oppScore = 0;
  var maxDeficit = 0;
  var deficitAtMax = 0;

  for (final action in actions) {
    final isOurPoint = action.isSideA == ourIsSideA;
    if (isOurPoint) {
      ourScore += action.delta;
    } else {
      oppScore += action.delta;
    }

    final diff = ourScore - oppScore;
    if (diff < 0 && (-diff) > maxDeficit) {
      maxDeficit = -diff;
      deficitAtMax = ourScore;
    }
  }

  final finalDiff = ourScore - oppScore;
  if (maxDeficit < 3 || finalDiff <= 0) return null;

  final trailingScore = deficitAtMax;
  final opponentAtTurn = trailingScore + maxDeficit;
  return isParticipantView
      ? 'Virada no set $setNumber: saiu de $trailingScore-$opponentAtTurn e fechou $ourScore-$oppScore.'
      : 'Virada de $ourLabel no set $setNumber: saiu de $trailingScore-$opponentAtTurn e fechou $ourScore-$oppScore.';
}

String? _dominanceNarrative({
  required List<TournamentMatchPointAction> actions,
  required bool ourIsSideA,
  required String ourLabel,
  required int setNumber,
  required bool isParticipantView,
}) {
  final maxLead = _maxPointDifference(actions, ourIsSideA: ourIsSideA);
  if (maxLead < 4) return null;

  return isParticipantView
      ? 'Você chegou a abrir $maxLead pontos de vantagem no set $setNumber.'
      : '$ourLabel chegou a abrir $maxLead pontos de vantagem no set $setNumber.';
}

int _maxPointDifference(
  List<TournamentMatchPointAction> actions, {
  required bool ourIsSideA,
}) {
  var ourScore = 0;
  var oppScore = 0;
  var maxLead = 0;

  for (final action in actions) {
    if (action.isSideA == ourIsSideA) {
      ourScore += action.delta;
    } else {
      oppScore += action.delta;
    }
    final lead = ourScore - oppScore;
    if (lead > maxLead) maxLead = lead;
  }
  return maxLead;
}

(bool isOurTeam, int length)? _activeStreak(
  List<TournamentMatchPointAction> actions, {
  required bool ourIsSideA,
}) {
  if (actions.isEmpty) return null;

  var streakSideIsOur = actions.last.isSideA == ourIsSideA;
  var length = 0;

  for (var i = actions.length - 1; i >= 0; i--) {
    final isOur = actions[i].isSideA == ourIsSideA;
    if (isOur != streakSideIsOur) break;
    length++;
  }

  return (streakSideIsOur, length);
}

