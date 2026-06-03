import 'athlete_match_detail_models.dart';

/// Monta dados do card de compartilhamento conforme fase e perspectiva do atleta.
MatchDetailShareInfo? buildMatchDetailShareInfo(AthleteMatchDetail detail) {
  if (detail.phase == MatchDetailPhase.canceled) return null;

  final variant = _resolveVariant(detail);
  if (variant == null) return null;

  return switch (variant) {
    MatchDetailShareVariant.scheduled => _buildScheduled(detail),
    MatchDetailShareVariant.live => _buildLive(detail),
    MatchDetailShareVariant.victory => _buildCompleted(
      detail: detail,
      variant: MatchDetailShareVariant.victory,
    ),
    MatchDetailShareVariant.defeat => _buildCompleted(
      detail: detail,
      variant: MatchDetailShareVariant.defeat,
    ),
    MatchDetailShareVariant.spectator => _buildCompleted(
      detail: detail,
      variant: MatchDetailShareVariant.spectator,
    ),
  };
}

MatchDetailShareVariant? _resolveVariant(AthleteMatchDetail detail) {
  return switch (detail.phase) {
    MatchDetailPhase.scheduled => MatchDetailShareVariant.scheduled,
    MatchDetailPhase.live => MatchDetailShareVariant.live,
    MatchDetailPhase.completed => () {
      if (!detail.isParticipantView) {
        return MatchDetailShareVariant.spectator;
      }
      return detail.isWin
          ? MatchDetailShareVariant.victory
          : MatchDetailShareVariant.defeat;
    }(),
    MatchDetailPhase.canceled => null,
  };
}

MatchDetailShareInfo _buildScheduled(AthleteMatchDetail detail) {
  return MatchDetailShareInfo(
    variant: MatchDetailShareVariant.scheduled,
    heroTitle: 'BORA?',
    heroScoreLabel: '',
    heroScheduleLabel: _scheduleHeroLabel(detail),
    winnersLabel: detail.ourTeam.label,
    opponentsLabel: detail.opponentTeam.label,
    stageLabel: detail.stageLabel,
    tournamentName: detail.tournamentName,
    dateLabel: detail.dateTimeLabel,
    categoryBadge: _categoryBadge(detail),
    topRowSetsWon: 0,
    bottomRowSetsWon: 0,
    winnersPlayers: detail.ourTeam.players,
    opponentsPlayers: detail.opponentTeam.players,
    emphasizeTopRow: true,
    emphasizeBottomRow: true,
    showDiagonalStripes: true,
    showSetGrid: false,
  );
}

MatchDetailShareInfo _buildLive(AthleteMatchDetail detail) {
  final top = detail.ourTeam;
  final bottom = detail.opponentTeam;
  final setPoints = _setPointsFromPerspective(detail.sets, live: true);

  return MatchDetailShareInfo(
    variant: MatchDetailShareVariant.live,
    heroTitle: 'AO VIVO',
    heroScoreLabel: '${detail.ourSetsWon} — ${detail.opponentSetsWon}',
    winnersLabel: top.label,
    opponentsLabel: bottom.label,
    stageLabel: detail.stageLabel,
    tournamentName: detail.tournamentName,
    dateLabel: detail.dateTimeLabel,
    categoryBadge: _categoryBadge(detail),
    topRowSetsWon: detail.ourSetsWon,
    bottomRowSetsWon: detail.opponentSetsWon,
    winnersPlayers: top.players,
    opponentsPlayers: bottom.players,
    emphasizeTopRow: true,
    emphasizeBottomRow: true,
    setPoints: setPoints,
    showLiveBadge: true,
    showDiagonalStripes: true,
    showSetGrid: setPoints.isNotEmpty,
  );
}

MatchDetailShareInfo _buildCompleted({
  required AthleteMatchDetail detail,
  required MatchDetailShareVariant variant,
}) {
  final ourFirst = variant == MatchDetailShareVariant.defeat;
  final winnerIsOur = _winnerIsOurTeam(detail);

  final MatchTeamSide topSide;
  final MatchTeamSide bottomSide;
  final int topSets;
  final int bottomSets;
  final List<MatchSetScore> setsForPoints;

  if (ourFirst) {
    topSide = detail.ourTeam;
    bottomSide = detail.opponentTeam;
    topSets = detail.ourSetsWon;
    bottomSets = detail.opponentSetsWon;
    setsForPoints = detail.sets;
  } else {
    final winnersSide = winnerIsOur ? detail.ourTeam : detail.opponentTeam;
    final losersSide = winnerIsOur ? detail.opponentTeam : detail.ourTeam;
    topSide = winnersSide;
    bottomSide = losersSide;
    topSets = winnerIsOur ? detail.ourSetsWon : detail.opponentSetsWon;
    bottomSets = winnerIsOur ? detail.opponentSetsWon : detail.ourSetsWon;
    setsForPoints = winnerIsOur ? detail.sets : _flipSetScores(detail.sets);
  }

  final heroTitle = switch (variant) {
    MatchDetailShareVariant.victory => 'VITÓRIA',
    MatchDetailShareVariant.defeat => 'FIM DE\nJOGO',
    MatchDetailShareVariant.spectator => 'FIM DE\nJOGO',
    _ => 'PARTIDA',
  };

  final emphasizeTop = variant != MatchDetailShareVariant.defeat;
  final emphasizeBottom = variant != MatchDetailShareVariant.victory;

  return MatchDetailShareInfo(
    variant: variant,
    heroTitle: heroTitle,
    heroScoreLabel: '$topSets — $bottomSets',
    winnersLabel: topSide.label,
    opponentsLabel: bottomSide.label,
    stageLabel: detail.stageLabel,
    tournamentName: detail.tournamentName,
    dateLabel: detail.dateTimeLabel,
    categoryBadge: _categoryBadge(detail),
    topRowSetsWon: topSets,
    bottomRowSetsWon: bottomSets,
    winnersPlayers: topSide.players,
    opponentsPlayers: bottomSide.players,
    emphasizeTopRow: emphasizeTop,
    emphasizeBottomRow: emphasizeBottom,
    setPoints: _setPointsFromPerspective(setsForPoints),
    showSetGrid: setsForPoints.isNotEmpty,
  );
}

List<MatchDetailShareSetPoint> _setPointsFromPerspective(
  List<MatchSetScore> sets, {
  bool live = false,
}) {
  return [
    for (final set in sets)
      MatchDetailShareSetPoint(
        label: set.label.toUpperCase(),
        winnersScore: set.ourScore,
        opponentsScore: set.opponentScore,
        isCurrentSet: live && set.isCurrentSet,
        displayLabel: live && set.isCurrentSet ? 'AGORA' : null,
      ),
  ];
}

bool _winnerIsOurTeam(AthleteMatchDetail detail) {
  if (detail.isParticipantView) return detail.isWin;
  final winnerId = detail.winnerTeamId?.trim() ?? '';
  final ourId = detail.ourTeam.teamId?.trim() ?? '';
  if (winnerId.isNotEmpty && ourId.isNotEmpty) return winnerId == ourId;
  return true;
}

List<MatchSetScore> _flipSetScores(List<MatchSetScore> sets) {
  return sets
      .map(
        (s) => MatchSetScore(
          label: s.label,
          ourScore: s.opponentScore,
          opponentScore: s.ourScore,
          isCurrentSet: s.isCurrentSet,
        ),
      )
      .toList();
}

String _categoryBadge(AthleteMatchDetail detail) {
  final label = detail.categoryLabel.trim();
  if (label.isNotEmpty) return label;
  return detail.stageLabel.trim();
}

String _scheduleHeroLabel(AthleteMatchDetail detail) {
  final raw = detail.dateTimeLabel.trim();
  if (raw.isEmpty) return '—';
  final parts = raw.split(' ');
  if (parts.length >= 2) {
    return '${parts.first} • ${parts.sublist(1).join(' ')}';
  }
  return raw;
}
