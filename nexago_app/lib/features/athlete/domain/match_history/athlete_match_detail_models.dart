import 'athlete_match_history_models.dart';
import 'match_share_poster_data.dart';

enum MatchDetailPhase { scheduled, live, completed, canceled }

class MatchTeamPlayer {
  const MatchTeamPlayer({
    required this.initials,
    required this.avatarColor,
    this.avatarUrl,
    this.name,
    this.athleteId,
  });

  final String initials;
  final int avatarColor;
  final String? avatarUrl;
  final String? name;

  /// uid do atleta (usado p/ head-to-head individual). Nulo se não resolvido.
  final String? athleteId;
}

class MatchTeamSide {
  const MatchTeamSide({
    required this.players,
    required this.label,
    required this.roleLabel,
    this.isCurrentUser = false,
    this.teamId,
  });

  final List<MatchTeamPlayer> players;
  final String label;
  final String roleLabel;
  final bool isCurrentUser;
  final String? teamId;
}

class MatchSetScore {
  const MatchSetScore({
    required this.label,
    required this.ourScore,
    required this.opponentScore,
    this.isCurrentSet = false,
  });

  final String label;
  final int ourScore;
  final int opponentScore;
  final bool isCurrentSet;

  bool get isWin => ourScore > opponentScore;
}

class MatchSetTimelineItem {
  const MatchSetTimelineItem({
    required this.label,
    required this.description,
    required this.ourScore,
    required this.opponentScore,
    required this.isWin,
  });

  final String label;
  final String description;
  final int ourScore;
  final int opponentScore;
  final bool isWin;

  String get scoreLabel => '$ourScore - $opponentScore';
}

class MatchDetailXpInfo {
  const MatchDetailXpInfo({
    this.xpGained,
    required this.rankLabel,
    required this.streakLabel,
    this.levelProgressLabel,
    this.progress,
  });

  final int? xpGained;
  final String rankLabel;
  final String streakLabel;
  final String? levelProgressLabel;
  final double? progress;
}

class MatchDetailMomentumChartPoint {
  const MatchDetailMomentumChartPoint({
    required this.scoreDiff,
    required this.time,
    required this.scoreLabel,
    required this.isOurTeam,
    required this.teamLabel,
  });

  /// Vantagem da nossa dupla (positivo = na frente).
  final int scoreDiff;
  final String time;
  final String scoreLabel;
  final bool isOurTeam;
  final String teamLabel;
}

class MatchDetailMomentumInfo {
  const MatchDetailMomentumInfo({
    required this.eyebrow,
    required this.title,
    required this.points,
    required this.narrative,
    required this.ourTeamLabel,
    required this.opponentTeamLabel,
    required this.chartPoints,
    this.summaryLabel,
    this.chartHint,
  });

  final String eyebrow;
  final String title;
  final List<double> points;
  final String narrative;
  final String ourTeamLabel;
  final String opponentTeamLabel;
  final List<MatchDetailMomentumChartPoint> chartPoints;
  final String? summaryLabel;
  final String? chartHint;
}

class MatchDetailHeadToHeadPastMatch {
  const MatchDetailHeadToHeadPastMatch({
    required this.isWin,
    required this.label,
    required this.score,
  });

  final bool isWin;
  final String label;
  final String score;
}

class MatchDetailHeadToHeadInfo {
  const MatchDetailHeadToHeadInfo({
    required this.title,
    required this.ourWins,
    required this.ourLosses,
    required this.pastMatches,
  });

  final String title;
  final int ourWins;
  final int ourLosses;
  final List<MatchDetailHeadToHeadPastMatch> pastMatches;

  int get totalMatches => ourWins + ourLosses;
}

class MatchDetailFormRow {
  const MatchDetailFormRow({required this.label, required this.results});

  final String label;
  final List<bool> results;
}

class MatchDetailPlayByPlayItem {
  const MatchDetailPlayByPlayItem({
    required this.time,
    required this.isOurTeam,
    required this.description,
    required this.setNumber,
    required this.scoreLabel,
    required this.teamLabel,
    this.isEstimated = false,
  });

  final String time;
  final bool isOurTeam;
  final String description;
  final int setNumber;

  /// Placar do set após o ponto (perspectiva da dupla de referência).
  final String scoreLabel;
  final String teamLabel;

  /// Ponto inferido do placar do set (sem registro ponto a ponto no placar).
  final bool isEstimated;
}

class MatchDetailPlayByPlayGroup {
  const MatchDetailPlayByPlayGroup({
    required this.setNumber,
    required this.setIndex,
    required this.finalScoreLabel,
    required this.items,
  });

  final int setNumber;
  final int setIndex;
  final String finalScoreLabel;
  final List<MatchDetailPlayByPlayItem> items;
}

class AthleteMatchDetail {
  const AthleteMatchDetail({
    required this.id,
    this.tournamentId,
    required this.phase,
    required this.result,
    required this.resultBadgeLabel,
    this.statusSubtitle,
    required this.stageLabel,
    required this.ourSetsWon,
    required this.opponentSetsWon,
    required this.ourTeam,
    required this.opponentTeam,
    required this.sets,
    required this.tournamentName,
    required this.dateTimeLabel,
    required this.venueLabel,
    required this.categoryLabel,
    required this.durationLabel,
    this.scheduleTime,
    this.startsInMinutes,
    this.scheduleSubtitle,
    this.currentSetIndex,
    this.currentSetOurPoints,
    this.currentSetOpponentPoints,
    this.setTimelineItems = const [],
    this.xpInfo,
    this.momentumInfo,
    this.headToHead,
    this.formRows = const [],
    this.playByPlay = const [],
    this.playByPlayGroups = const [],
    this.sharePoster,
    this.mvpSummary,
    this.isParticipantView = true,
    this.winnerTeamId,
    this.isMatchLive = false,
  });

  final String id;
  final String? tournamentId;
  final MatchDetailPhase phase;
  final AthleteMatchResult result;
  final String resultBadgeLabel;
  final String? statusSubtitle;
  final String stageLabel;
  final int ourSetsWon;
  final int opponentSetsWon;
  final MatchTeamSide ourTeam;
  final MatchTeamSide opponentTeam;
  final List<MatchSetScore> sets;
  final String tournamentName;
  final String dateTimeLabel;
  final String venueLabel;
  final String categoryLabel;
  final String durationLabel;
  final DateTime? scheduleTime;
  final int? startsInMinutes;
  final String? scheduleSubtitle;
  final int? currentSetIndex;
  final int? currentSetOurPoints;
  final int? currentSetOpponentPoints;
  final List<MatchSetTimelineItem> setTimelineItems;
  final MatchDetailXpInfo? xpInfo;
  final MatchDetailMomentumInfo? momentumInfo;
  final MatchDetailHeadToHeadInfo? headToHead;
  final List<MatchDetailFormRow> formRows;
  final List<MatchDetailPlayByPlayItem> playByPlay;
  final List<MatchDetailPlayByPlayGroup> playByPlayGroups;

  /// Dados do pôster de compartilhamento — a mesma arte do portal do atleta.
  final MatchSharePosterData? sharePoster;

  int get totalPlayByPlayPoints =>
      playByPlayGroups.fold(0, (sum, g) => sum + g.items.length);
  final String? mvpSummary;
  final bool isParticipantView;
  final String? winnerTeamId;
  final bool isMatchLive;

  bool get isWin => result == AthleteMatchResult.win;
  bool get hasMvp => mvpSummary != null && mvpSummary!.isNotEmpty;
  bool get hasTieBreak =>
      sets.any((s) => s.label.toUpperCase().contains('TIE'));

  String get matchScoreLabel => '$ourSetsWon - $opponentSetsWon';

  AthleteMatchDetail copyWith({
    String? id,
    String? tournamentId,
    MatchDetailPhase? phase,
    AthleteMatchResult? result,
    String? resultBadgeLabel,
    String? statusSubtitle,
    String? stageLabel,
    int? ourSetsWon,
    int? opponentSetsWon,
    MatchTeamSide? ourTeam,
    MatchTeamSide? opponentTeam,
    List<MatchSetScore>? sets,
    String? tournamentName,
    String? dateTimeLabel,
    String? venueLabel,
    String? categoryLabel,
    String? durationLabel,
    DateTime? scheduleTime,
    int? startsInMinutes,
    String? scheduleSubtitle,
    int? currentSetIndex,
    int? currentSetOurPoints,
    int? currentSetOpponentPoints,
    List<MatchSetTimelineItem>? setTimelineItems,
    MatchDetailXpInfo? xpInfo,
    MatchDetailMomentumInfo? momentumInfo,
    MatchDetailHeadToHeadInfo? headToHead,
    List<MatchDetailFormRow>? formRows,
    List<MatchDetailPlayByPlayItem>? playByPlay,
    List<MatchDetailPlayByPlayGroup>? playByPlayGroups,
    MatchSharePosterData? sharePoster,
    String? mvpSummary,
    bool? isParticipantView,
    String? winnerTeamId,
    bool? isMatchLive,
  }) {
    return AthleteMatchDetail(
      id: id ?? this.id,
      tournamentId: tournamentId ?? this.tournamentId,
      phase: phase ?? this.phase,
      result: result ?? this.result,
      resultBadgeLabel: resultBadgeLabel ?? this.resultBadgeLabel,
      statusSubtitle: statusSubtitle ?? this.statusSubtitle,
      stageLabel: stageLabel ?? this.stageLabel,
      ourSetsWon: ourSetsWon ?? this.ourSetsWon,
      opponentSetsWon: opponentSetsWon ?? this.opponentSetsWon,
      ourTeam: ourTeam ?? this.ourTeam,
      opponentTeam: opponentTeam ?? this.opponentTeam,
      sets: sets ?? this.sets,
      tournamentName: tournamentName ?? this.tournamentName,
      dateTimeLabel: dateTimeLabel ?? this.dateTimeLabel,
      venueLabel: venueLabel ?? this.venueLabel,
      categoryLabel: categoryLabel ?? this.categoryLabel,
      durationLabel: durationLabel ?? this.durationLabel,
      scheduleTime: scheduleTime ?? this.scheduleTime,
      startsInMinutes: startsInMinutes ?? this.startsInMinutes,
      scheduleSubtitle: scheduleSubtitle ?? this.scheduleSubtitle,
      currentSetIndex: currentSetIndex ?? this.currentSetIndex,
      currentSetOurPoints: currentSetOurPoints ?? this.currentSetOurPoints,
      currentSetOpponentPoints:
          currentSetOpponentPoints ?? this.currentSetOpponentPoints,
      setTimelineItems: setTimelineItems ?? this.setTimelineItems,
      xpInfo: xpInfo ?? this.xpInfo,
      momentumInfo: momentumInfo ?? this.momentumInfo,
      headToHead: headToHead ?? this.headToHead,
      formRows: formRows ?? this.formRows,
      playByPlay: playByPlay ?? this.playByPlay,
      playByPlayGroups: playByPlayGroups ?? this.playByPlayGroups,
      sharePoster: sharePoster ?? this.sharePoster,
      mvpSummary: mvpSummary ?? this.mvpSummary,
      isParticipantView: isParticipantView ?? this.isParticipantView,
      winnerTeamId: winnerTeamId ?? this.winnerTeamId,
      isMatchLive: isMatchLive ?? this.isMatchLive,
    );
  }
}
