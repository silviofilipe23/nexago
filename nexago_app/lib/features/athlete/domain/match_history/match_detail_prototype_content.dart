import 'athlete_match_detail_models.dart';

/// Conteúdo demo alinhado ao protótipo B até existir API dedicada.
/// TODO: remover ou condicionar quando Firestore expuser XP, H2H, momentum, etc.
AthleteMatchDetail enrichMatchDetailWithPrototypeDemo(AthleteMatchDetail detail) {
  final ourRole = detail.ourTeam.isCurrentUser
      ? 'VOCÊ • #11'
      : detail.ourTeam.roleLabel;

  final updatedOurTeam = detail.ourTeam.isCurrentUser
      ? MatchTeamSide(
          players: detail.ourTeam.players,
          label: detail.ourTeam.label,
          roleLabel: ourRole,
          isCurrentUser: true,
          teamId: detail.ourTeam.teamId,
        )
      : detail.ourTeam;

  final timeline = _enrichTimeline(detail.setTimelineItems);
  final opponentLabel = detail.opponentTeam.label;

  MatchDetailXpInfo? xp;
  if (detail.isParticipantView &&
      detail.phase == MatchDetailPhase.completed &&
      detail.isWin) {
    xp = const MatchDetailXpInfo(
      xpGained: 45,
      rankLabel: '#11',
      streakLabel: '5 vitórias seguidas',
      levelProgressLabel: 'faltam 120 XP pro nível 6',
      progress: 0.62,
    );
  }

  MatchDetailMomentumInfo? momentum;
  if (detail.phase == MatchDetailPhase.completed ||
      detail.phase == MatchDetailPhase.live) {
    final hasTieBreak = detail.hasTieBreak;
    momentum = MatchDetailMomentumInfo(
      eyebrow: detail.phase == MatchDetailPhase.live
          ? 'EM TEMPO REAL'
          : (hasTieBreak ? 'A VIRADA' : 'MOMENTUM'),
      title: detail.phase == MatchDetailPhase.live
          ? 'Momentum'
          : (hasTieBreak
              ? 'Momentum do tie-break'
              : 'Momentum da partida'),
      points: detail.phase == MatchDetailPhase.live
          ? const [0.3, 0.45, 0.35, 0.55, 0.5, 0.65, 0.6, 0.75]
          : const [0.2, 0.25, 0.2, 0.35, 0.55, 0.7, 0.85, 0.9, 1.0],
      narrative: hasTieBreak
          ? 'Atrás de 0-2, você emendou 5 pontos seguidos e fechou em 15-12.'
          : 'Sequência forte no fim do set decidiu o placar.',
    );
  }

  MatchDetailHeadToHeadInfo? h2h;
  if (detail.isParticipantView &&
      (detail.phase == MatchDetailPhase.completed ||
          detail.phase == MatchDetailPhase.scheduled)) {
    h2h = MatchDetailHeadToHeadInfo(
      title: detail.phase == MatchDetailPhase.scheduled
          ? 'Você leva vantagem'
          : 'Você vs $opponentLabel',
      ourWins: 3,
      ourLosses: 1,
      pastMatches: const [
        MatchDetailHeadToHeadPastMatch(
          isWin: true,
          label: 'Open Goiânia · mar 26',
          score: '2-0',
        ),
        MatchDetailHeadToHeadPastMatch(
          isWin: false,
          label: 'BR Cup · fev 26',
          score: '1-2',
        ),
        MatchDetailHeadToHeadPastMatch(
          isWin: true,
          label: 'Estadual GO · jan 26',
          score: '2-1',
        ),
      ],
    );
  }

  List<MatchDetailFormRow> formRows = const [];
  if (detail.isParticipantView &&
      detail.phase == MatchDetailPhase.scheduled) {
    formRows = [
      const MatchDetailFormRow(
        label: 'Você',
        results: [true, true, true, false, true],
      ),
      MatchDetailFormRow(
        label: opponentLabel,
        results: const [true, false, true, true, false],
      ),
    ];
  }

  List<MatchDetailPlayByPlayItem> playByPlay = const [];
  if (detail.phase == MatchDetailPhase.live) {
    playByPlay = const [
      MatchDetailPlayByPlayItem(
        time: '18:32',
        isOurTeam: true,
        description: 'Ace de Marcos Vinícius',
      ),
      MatchDetailPlayByPlayItem(
        time: '18:31',
        isOurTeam: true,
        description: 'Bloqueio de Victor Azevedo',
      ),
      MatchDetailPlayByPlayItem(
        time: '18:30',
        isOurTeam: false,
        description: 'Ataque de Igor Mendonça',
      ),
      MatchDetailPlayByPlayItem(
        time: '18:29',
        isOurTeam: false,
        description: 'Set 1 encerrado · 21-9',
      ),
    ];
  }

  MatchDetailShareInfo? share;
  if (detail.phase == MatchDetailPhase.completed) {
    share = _buildShareInfo(detail);
  }

  return detail.copyWith(
    ourTeam: updatedOurTeam,
    setTimelineItems: timeline,
    xpInfo: xp,
    momentumInfo: momentum,
    headToHead: h2h,
    formRows: formRows,
    playByPlay: playByPlay,
    shareInfo: share,
  );
}

MatchDetailShareInfo _buildShareInfo(AthleteMatchDetail detail) {
  final winnerIsOur = _winnerIsOurTeam(detail);
  final winnersSide = winnerIsOur ? detail.ourTeam : detail.opponentTeam;
  final opponentsSide = winnerIsOur ? detail.opponentTeam : detail.ourTeam;
  final sets = winnerIsOur ? detail.sets : _flipSetScores(detail.sets);

  final ourSets = winnerIsOur ? detail.ourSetsWon : detail.opponentSetsWon;
  final oppSets = winnerIsOur ? detail.opponentSetsWon : detail.ourSetsWon;

  return MatchDetailShareInfo(
    statusLabel: detail.isParticipantView && detail.isWin
        ? 'VITÓRIA'
        : 'PARTIDA',
    scoreLabel: '$ourSets - $oppSets',
    winnersLabel: winnersSide.label,
    opponentsLabel: opponentsSide.label,
    stageLabel: detail.stageLabel,
    tournamentName: detail.tournamentName,
    dateLabel: detail.dateTimeLabel,
    setPoints: [
      for (final set in sets)
        MatchDetailShareSetPoint(
          label: set.label.toUpperCase(),
          winnersScore: set.ourScore,
          opponentsScore: set.opponentScore,
        ),
    ],
    winnersPlayers: winnersSide.players,
    opponentsPlayers: opponentsSide.players,
  );
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

List<MatchSetTimelineItem> _enrichTimeline(List<MatchSetTimelineItem> items) {
  const descriptions = [
    'Largada perfeita, sequência de 6 aces.',
    'Igor / João reagiram no fim do set.',
    'Virada de 0-2 com 5 pontos seguidos.',
  ];
  return [
    for (var i = 0; i < items.length; i++)
      MatchSetTimelineItem(
        label: items[i].label,
        description: i < descriptions.length
            ? descriptions[i]
            : (items[i].description.isNotEmpty
                ? items[i].description
                : ''),
        ourScore: items[i].ourScore,
        opponentScore: items[i].opponentScore,
        isWin: items[i].isWin,
      ),
  ];
}
