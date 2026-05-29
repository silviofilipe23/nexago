import 'package:intl/intl.dart';

import '../../../tournaments/domain/tournament_detail_model.dart';
import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_display.dart';
import 'athlete_match_history_models.dart';
import 'athlete_tournament_detail_models.dart';

AthleteTournamentDetail buildAthleteTournamentDetail({
  required String tournamentId,
  required AthleteTournamentHistoryItem summary,
  required TournamentDetail? tournamentDoc,
  required List<TournamentMatch> tournamentMatches,
  required String athleteTeamId,
  required Map<String, String> opponentNames,
}) {
  final placementLabel = switch (summary.placement) {
    1 => 'CAMPEÃO • 1º LUGAR',
    2 => '2º LUGAR',
    3 => '3º LUGAR',
    _ when summary.placement > 0 => '${summary.placement}º LUGAR',
    _ => 'CAMPANHA',
  };

  final periodLabel = tournamentDoc?.dateLabel.trim().isNotEmpty == true
      ? tournamentDoc!.dateLabel
      : summary.periodLabel;
  final metaParts = [
    if (summary.categoryLabel.isNotEmpty) summary.categoryLabel,
    if (summary.genderLabel.isNotEmpty) summary.genderLabel,
    if (periodLabel.isNotEmpty) periodLabel,
  ];
  final metaLabel = metaParts.join(' · ');

  final venueName = tournamentDoc?.location.trim().isNotEmpty == true
      ? tournamentDoc!.location
      : (summary.venue.isNotEmpty ? summary.venue : '—');
  final venueCity = tournamentDoc?.city.trim().isNotEmpty == true
      ? tournamentDoc!.city
      : '—';

  final games = summary.wins + summary.losses;
  final tag = summary.losses == 0 && summary.wins > 0 ? 'INVICTO' : 'CAMPANHA';

  return AthleteTournamentDetail(
    tournamentId: tournamentId,
    name: tournamentDoc?.name ?? summary.name,
    championBadgeLabel: placementLabel,
    metaLabel: metaLabel.isNotEmpty ? metaLabel : 'Torneio',
    gamesCount: games,
    wins: summary.wins,
    losses: summary.losses,
    xpEarned: summary.wins * 40,
    venueName: venueName,
    venueCity: venueCity,
    partner: const AthleteTournamentPartner(
      initials: '—',
      avatarColor: 0xFF2BD17E,
      name: 'Sua dupla',
      monthsTogetherLabel: '',
    ),
    campaignTag: tag,
    matches: _campaignMatches(
      tournamentMatches: tournamentMatches,
      athleteTeamId: athleteTeamId,
      opponentNames: opponentNames,
    ),
  );
}

List<AthleteTournamentCampaignMatch> _campaignMatches({
  required List<TournamentMatch> tournamentMatches,
  required String athleteTeamId,
  required Map<String, String> opponentNames,
}) {
  final sorted = [...tournamentMatches]
    ..sort((a, b) {
      final aDate = playedAtForMatch(a);
      final bDate = playedAtForMatch(b);
      if (aDate == null && bDate == null) {
        return a.matchNumber.compareTo(b.matchNumber);
      }
      if (aDate == null) return -1;
      if (bDate == null) return 1;
      return aDate.compareTo(bDate);
    });

  return sorted.map((match) {
    final opponentId = match.opponentTeamIdFor(athleteTeamId);
    final opponent = opponentId != null
        ? opponentNames[opponentId] ?? 'Adversário'
        : 'Adversário';
    final stageLabel = match.poolId.trim().isNotEmpty
        ? 'Grupo ${match.poolId.trim()}'
        : matchRoundLabel(match);
    final playedAt = playedAtForMatch(match) ?? DateTime.now();
    final score = scoreDisplayForAthleteTeam(
      match: match,
      athleteTeamId: athleteTeamId,
    ).replaceAll(',', ' · ');

    return AthleteTournamentCampaignMatch(
      id: match.id,
      matchId: match.id,
      stageLabel: stageLabel.toUpperCase(),
      playedAt: playedAt,
      opponentLabel: 'vs $opponent',
      scoreDisplay: score,
      result: match.athleteTeamWon(athleteTeamId)
          ? AthleteMatchResult.win
          : AthleteMatchResult.loss,
      isFinal: match.matchType.toLowerCase().contains('final'),
    );
  }).toList();
}

String formatTournamentPeriodLabel(TournamentDetail? detail) {
  if (detail == null) return '';
  if (detail.dateLabel.trim().isNotEmpty) return detail.dateLabel;
  final start = DateFormat('MMM yyyy', 'pt_BR').format(detail.startDate);
  final end = detail.endDate;
  if (end == null) return start.toUpperCase();
  return '${DateFormat('d MMM', 'pt_BR').format(detail.startDate)} – '
      '${DateFormat('d MMM yyyy', 'pt_BR').format(end)}';
}
