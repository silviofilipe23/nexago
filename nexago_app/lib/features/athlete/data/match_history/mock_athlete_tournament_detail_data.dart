import '../../domain/match_history/athlete_match_history_models.dart';
import '../../domain/match_history/athlete_tournament_detail_models.dart';
import 'mock_athlete_match_history_data.dart';

AthleteTournamentDetail? mockAthleteTournamentDetail(String tournamentId) {
  final bundle = mockAthleteMatchHistoryBundle();
  final summary = bundle.tournaments
      .where((t) => t.tournamentId == tournamentId)
      .firstOrNull;
  if (summary == null) {
    final byId = bundle.tournaments.where((t) => t.id == tournamentId).firstOrNull;
    if (byId == null) return null;
    return _detailFromSummary(byId, tournamentId: byId.tournamentId ?? byId.id);
  }

  if (tournamentId == 'tour-copa-goias-2026') {
    return _detailCopaGoias2026(summary);
  }

  return _detailFromSummary(summary, tournamentId: tournamentId);
}

AthleteTournamentDetail _detailCopaGoias2026(AthleteTournamentHistoryItem summary) {
  return AthleteTournamentDetail(
    tournamentId: 'tour-copa-goias-2026',
    name: 'Copa Goiás Beach Open',
    championBadgeLabel: 'CAMPEÃO • 1º LUGAR',
    metaLabel: 'Sub 19 • Masc • MAR 2026',
    gamesCount: 4,
    wins: 4,
    losses: 0,
    xpEarned: 180,
    venueName: 'Arena ErreJota',
    venueCity: 'Goiânia · GO',
    partner: const AthleteTournamentPartner(
      initials: 'EN',
      avatarColor: 0xFF2BD17E,
      name: 'Você / Enzo',
      monthsTogetherLabel: '14 meses juntos',
    ),
    campaignTag: 'INVICTO',
    matches: [
      AthleteTournamentCampaignMatch(
        id: 'camp-copa-oitavas',
        matchId: 'm1',
        stageLabel: 'OITAVAS',
        playedAt: DateTime(2026, 3, 28, 14, 30),
        opponentLabel: 'vs Costa / Vieira',
        scoreDisplay: '2 - 1',
        result: AthleteMatchResult.win,
      ),
      AthleteTournamentCampaignMatch(
        id: 'camp-copa-quartas',
        matchId: 'camp-copa-quartas',
        stageLabel: 'QUARTAS',
        playedAt: DateTime(2026, 3, 29, 10, 0),
        opponentLabel: 'vs Reis / Andrade',
        scoreDisplay: '2 - 0',
        result: AthleteMatchResult.win,
      ),
      AthleteTournamentCampaignMatch(
        id: 'camp-copa-semis',
        matchId: 'camp-copa-semis',
        stageLabel: 'SEMIS',
        playedAt: DateTime(2026, 3, 29, 16, 30),
        opponentLabel: 'vs Mello / Tavares',
        scoreDisplay: '2 - 1',
        result: AthleteMatchResult.win,
      ),
      AthleteTournamentCampaignMatch(
        id: 'camp-copa-final',
        matchId: 'camp-copa-final',
        stageLabel: 'FINAL',
        playedAt: DateTime(2026, 3, 30, 18, 0),
        opponentLabel: 'vs Goes / Santiago',
        scoreDisplay: '2 - 0',
        result: AthleteMatchResult.win,
        isFinal: true,
      ),
    ],
  );
}

AthleteTournamentDetail _detailFromSummary(
  AthleteTournamentHistoryItem summary, {
  required String tournamentId,
}) {
  final placementLabel = switch (summary.placement) {
    1 => 'CAMPEÃO • 1º LUGAR',
    2 => '2º LUGAR',
    3 => '3º LUGAR',
    _ => '${summary.placement}º LUGAR',
  };

  final meta = '${summary.categoryLabel} · ${summary.genderLabel} · ${summary.periodLabel}';
  final venueParts = summary.venue.split('·').map((s) => s.trim()).toList();
  final venueName = venueParts.isNotEmpty ? venueParts.first : summary.venue;
  final venueCity = venueParts.length > 1 ? venueParts.sublist(1).join(' · ') : '—';

  final games = summary.wins + summary.losses;
  final xp = summary.wins * 40 + (summary.placement == 1 ? 40 : 0);
  final tag = summary.losses == 0 && summary.wins > 0 ? 'INVICTO' : 'CAMPANHA';

  return AthleteTournamentDetail(
    tournamentId: tournamentId,
    name: summary.name,
    championBadgeLabel: placementLabel,
    metaLabel: meta,
    gamesCount: games,
    wins: summary.wins,
    losses: summary.losses,
    xpEarned: xp,
    venueName: venueName,
    venueCity: venueCity,
    partner: const AthleteTournamentPartner(
      initials: 'EN',
      avatarColor: 0xFF2BD17E,
      name: 'Você / Enzo',
      monthsTogetherLabel: '8 meses juntos',
    ),
    campaignTag: tag,
    matches: _generatedCampaignMatches(summary),
  );
}

List<AthleteTournamentCampaignMatch> _generatedCampaignMatches(
  AthleteTournamentHistoryItem summary,
) {
  final stages = ['FASE 1', 'FASE 2', 'FASE 3', 'FASE 4', 'FASE 5'];
  final opponents = [
    'vs Dupla A',
    'vs Dupla B',
    'vs Dupla C',
    'vs Dupla D',
    'vs Dupla E',
  ];
  final count = (summary.wins + summary.losses).clamp(1, 5);
  final base = DateTime(2026, 2, 1);

  return List.generate(count, (i) {
    final isWin = i < summary.wins;
    return AthleteTournamentCampaignMatch(
      id: '${summary.id}-match-$i',
      matchId: i == 0 ? 'm1' : null,
      stageLabel: stages[i % stages.length],
      playedAt: base.add(Duration(days: i * 2, hours: 14)),
      opponentLabel: opponents[i % opponents.length],
      scoreDisplay: isWin ? '2 - ${i.isEven ? 1 : 0}' : '1 - 2',
      result: isWin ? AthleteMatchResult.win : AthleteMatchResult.loss,
      isFinal: i == count - 1,
    );
  });
}
