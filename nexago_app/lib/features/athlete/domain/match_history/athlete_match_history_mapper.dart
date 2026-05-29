import 'package:intl/intl.dart';

import '../../../tournaments/domain/tournament_detail_model.dart';
import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_display.dart';
import '../../../tournaments/domain/tournament_match_status.dart';
import 'athlete_match_history_models.dart';

class TournamentHistoryMeta {
  const TournamentHistoryMeta({
    this.venue = '',
    this.periodLabel = '',
  });

  final String venue;
  final String periodLabel;
}

class AthleteMatchHistoryMapperContext {
  const AthleteMatchHistoryMapperContext({
    required this.athleteTeamIds,
    required this.tournamentNames,
    required this.teamDisplayNames,
  });

  final Set<String> athleteTeamIds;
  final Map<String, String> tournamentNames;
  final Map<String, String> teamDisplayNames;
}

AthleteMatchHistoryItem? mapMatchToHistoryItem({
  required TournamentMatch match,
  required AthleteMatchHistoryMapperContext context,
}) {
  if (!TournamentMatchStatus.isCompleted(match.status)) return null;

  final athleteTeamId = _athleteTeamIdForMatch(match, context.athleteTeamIds);
  if (athleteTeamId == null) return null;

  final playedAt = playedAtForMatch(match);
  if (playedAt == null) return null;

  final opponentTeamId = match.opponentTeamIdFor(athleteTeamId);
  final opponentLabel = opponentTeamId != null
      ? context.teamDisplayNames[opponentTeamId] ?? opponentTeamId
      : 'Adversário';

  final tournamentName =
      context.tournamentNames[match.tournamentId] ?? 'Torneio';
  final competitionLabel = '$tournamentName · ${match.categoryId}';

  final isWin = match.athleteTeamWon(athleteTeamId);
  final scoreDisplay = scoreDisplayForAthleteTeam(
    match: match,
    athleteTeamId: athleteTeamId,
  );
  final setsDisplay = setsSummaryForAthleteTeam(
    match: match,
    athleteTeamId: athleteTeamId,
  );

  return AthleteMatchHistoryItem(
    id: match.id,
    playedAt: playedAt,
    result: isWin ? AthleteMatchResult.win : AthleteMatchResult.loss,
    opponentLabel: opponentLabel,
    competitionLabel: competitionLabel,
    scoreDisplay: scoreDisplay,
    setsDisplay: setsDisplay.isEmpty ? null : setsDisplay,
  );
}

String? _athleteTeamIdForMatch(
  TournamentMatch match,
  Set<String> athleteTeamIds,
) {
  if (athleteTeamIds.contains(match.teamAId)) return match.teamAId;
  if (athleteTeamIds.contains(match.teamBId)) return match.teamBId;
  return null;
}

List<AthleteTournamentHistoryItem> buildTournamentHistoryItems({
  required List<AthleteMatchHistoryItem> matches,
  required List<TournamentMatch> rawMatches,
  required Set<String> athleteTeamIds,
  required Map<String, String> tournamentNames,
  Map<String, TournamentHistoryMeta> tournamentMeta = const {},
}) {
  final byTournament = <String, List<TournamentMatch>>{};
  for (final match in rawMatches) {
    if (match.tournamentId.isEmpty) continue;
    byTournament.putIfAbsent(match.tournamentId, () => []).add(match);
  }

  final items = <AthleteTournamentHistoryItem>[];
  for (final entry in byTournament.entries) {
    final tournamentId = entry.key;
    final tournamentMatches = entry.value;
    var wins = 0;
    var losses = 0;
    String? categoryLabel;
    DateTime? latestPlayedAt;

    for (final match in tournamentMatches) {
      final teamId = _athleteTeamIdForMatch(match, athleteTeamIds);
      if (teamId == null || !TournamentMatchStatus.isCompleted(match.status)) {
        continue;
      }
      categoryLabel ??= match.categoryId;
      final playedAt = playedAtForMatch(match);
      if (playedAt != null &&
          (latestPlayedAt == null || playedAt.isAfter(latestPlayedAt))) {
        latestPlayedAt = playedAt;
      }
      if (match.athleteTeamWon(teamId)) {
        wins++;
      } else if (match.winnerId?.trim().isNotEmpty == true) {
        losses++;
      }
    }

    if (wins + losses == 0) continue;

    final meta = tournamentMeta[tournamentId] ?? const TournamentHistoryMeta();
    final periodLabel = meta.periodLabel.isNotEmpty
        ? meta.periodLabel
        : (latestPlayedAt != null
            ? formatTournamentPeriodFromDate(latestPlayedAt)
            : '');

    items.add(
      AthleteTournamentHistoryItem(
        id: tournamentId,
        tournamentId: tournamentId,
        name: tournamentNames[tournamentId] ?? 'Torneio',
        venue: meta.venue,
        periodLabel: periodLabel,
        categoryLabel: categoryLabel ?? '',
        genderLabel: inferGenderLabel(categoryLabel ?? ''),
        placement: 0,
        medal: TournamentPlacement.other,
        wins: wins,
        losses: losses,
      ),
    );
  }

  items.sort((a, b) {
    final aDate = _parsePeriodLabel(a.periodLabel);
    final bDate = _parsePeriodLabel(b.periodLabel);
    if (aDate != null && bDate != null) {
      return bDate.compareTo(aDate);
    }
    return a.name.compareTo(b.name);
  });
  return items;
}

String formatTournamentPeriodFromDate(DateTime date) {
  return DateFormat('MMM yyyy', 'pt_BR').format(date).toUpperCase();
}

String formatTournamentVenue(String location, String city) {
  final loc = location.trim();
  final c = city.trim();
  if (loc.isEmpty && c.isEmpty) return '';
  if (loc.isEmpty) return c;
  if (c.isEmpty) return loc;
  return '$loc · $c';
}

TournamentHistoryMeta metaFromTournamentDetail(TournamentDetail? detail) {
  if (detail == null) return const TournamentHistoryMeta();
  return TournamentHistoryMeta(
    venue: formatTournamentVenue(detail.location, detail.city),
    periodLabel: detail.dateLabel.trim().isNotEmpty
        ? detail.dateLabel.trim().toUpperCase()
        : formatTournamentPeriodFromDate(detail.startDate),
  );
}

String inferGenderLabel(String categoryId) {
  final value = categoryId.toLowerCase();
  if (value.contains('masc') || value.contains('masculino')) return 'MASC';
  if (value.contains('fem') || value.contains('feminino')) return 'FEM';
  if (value.contains('misto') || value.contains('mista')) return 'MISTO';
  return '';
}

DateTime? _parsePeriodLabel(String label) {
  if (label.trim().isEmpty) return null;
  try {
    return DateFormat('MMM yyyy', 'pt_BR').parse(label.toLowerCase());
  } catch (_) {
    return null;
  }
}
