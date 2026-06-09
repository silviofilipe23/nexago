import 'athlete_match_detail_models.dart';
import 'match_detail_share_builder.dart';

/// Conteúdo demo alinhado ao protótipo B até existir API dedicada.
/// TODO: remover ou condicionar quando Firestore expuser XP, H2H, etc.
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

  final share = buildMatchDetailShareInfo(detail);

  return detail.copyWith(
    ourTeam: updatedOurTeam,
    setTimelineItems: timeline,
    xpInfo: xp,
    headToHead: h2h,
    shareInfo: share,
  );
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
