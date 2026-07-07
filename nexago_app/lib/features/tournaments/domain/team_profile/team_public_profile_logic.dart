import 'package:intl/intl.dart';

import '../../../athlete/domain/athlete_display_name.dart';
import '../../../athlete/domain/athlete_firestore_codes.dart';
import '../../../athlete/domain/athlete_profile.dart';
import '../../../athlete/domain/athlete_public_profile_models.dart';
import '../tournament_match.dart';
import '../tournament_match_display.dart';
import '../tournament_match_status.dart';
import '../tournament_team.dart';
import 'team_public_profile_models.dart';

String teamProfileDisplayName({
  required TournamentTeam team,
  AthleteProfile? player1,
  AthleteProfile? player2,
}) {
  final name = team.teamName?.trim();
  if (name != null && name.isNotEmpty) return name;
  return pairDisplayName(player1, player2);
}

String teamProfileSportLabel(AthleteProfile? player1, AthleteProfile? player2) {
  final profile = player1 ?? player2;
  if (profile == null) return '—';
  final id = profile.primarySportFirestoreId;
  if (id != null && id.isNotEmpty) {
    final label = AthleteFirestoreCodes.sportFirestoreToLabel(id);
    if (label != null && label.isNotEmpty) return label;
  }
  return profile.sport.trim().isNotEmpty ? profile.sport : '—';
}

String formatTeamTogetherLabel(DateTime? createdAt) {
  if (createdAt == null) return '';
  final now = DateTime.now();
  var totalMonths =
      (now.year - createdAt.year) * 12 + now.month - createdAt.month;
  if (now.day < createdAt.day) totalMonths--;
  if (totalMonths < 1) return '<1 mês';
  final years = totalMonths ~/ 12;
  final months = totalMonths % 12;
  if (years > 0 && months > 0) return '${years}a ${months}m';
  if (years > 0) return '${years}a';
  return '${months}m';
}

String formatTeamFormedLabel(DateTime? createdAt) {
  if (createdAt == null) return '';
  return DateFormat('MMM/yyyy', 'pt_BR').format(createdAt).toLowerCase();
}

String teamProfileLocationLabel(AthleteProfile? player1, AthleteProfile? player2) {
  final profile = player1 ?? player2;
  if (profile == null) return '';
  return athleteLocationLabel(profile);
}

List<String> teamProfileTagLabels(AthleteProfile? player1, AthleteProfile? player2) {
  final tags = <String>[];
  final category = player1?.category?.trim() ?? player2?.category?.trim() ?? '';
  if (category.isNotEmpty) tags.add(category);

  final age = athleteAgeCategoryLabel(player1?.birthDate ?? player2?.birthDate);
  if (age.isNotEmpty) tags.add(age);

  final gender = athleteGenderShortLabel(
    player1?.gender ?? player2?.gender,
  );
  if (gender.isNotEmpty) tags.add(gender);

  final location = teamProfileLocationLabel(player1, player2);
  if (location.isNotEmpty) tags.add(location);

  return tags;
}

TeamProfileStats buildTeamProfileStats({
  required List<TournamentMatch> matches,
  required String teamId,
  required int rankingPoints,
}) {
  final completed = matches
      .where((m) => TournamentMatchStatus.isCompleted(m.status))
      .toList();
  final games = completed.length;
  if (games == 0) {
    return TeamProfileStats(points: rankingPoints);
  }

  var wins = 0;
  for (final match in completed) {
    if (match.athleteTeamWon(teamId)) wins++;
  }
  final winRate = games == 0 ? 0 : ((wins / games) * 100).round();
  final campaigns = buildTeamCampaigns(
    matches: completed,
    teamId: teamId,
    tournamentNames: const {},
  );
  final titles = campaigns.where((c) => c.resultLabel == '1º').length;

  return TeamProfileStats(
    games: games,
    winRatePercent: winRate,
    titles: titles,
    points: rankingPoints,
  );
}

List<TeamCampaignEntry> buildTeamCampaigns({
  required List<TournamentMatch> matches,
  required String teamId,
  required Map<String, String> tournamentNames,
}) {
  final completed = matches
      .where((m) => TournamentMatchStatus.isCompleted(m.status))
      .toList();
  if (completed.isEmpty) return const [];

  final byTournament = <String, List<TournamentMatch>>{};
  for (final match in completed) {
    final tid = match.tournamentId.trim();
    if (tid.isEmpty) continue;
    byTournament.putIfAbsent(tid, () => []).add(match);
  }

  final entries = <TeamCampaignEntry>[];
  for (final entry in byTournament.entries) {
    final tournamentMatches = entry.value;
    var wins = 0;
    var losses = 0;
    DateTime? latest;
    for (final match in tournamentMatches) {
      if (match.athleteTeamWon(teamId)) {
        wins++;
      } else if (match.winnerId?.trim().isNotEmpty == true) {
        losses++;
      }
      final played = playedAtForMatch(match);
      if (played != null && (latest == null || played.isAfter(latest))) {
        latest = played;
      }
    }

    entries.add(
      TeamCampaignEntry(
        tournamentId: entry.key,
        tournamentName: tournamentNames[entry.key]?.trim().isNotEmpty == true
            ? tournamentNames[entry.key]!.trim()
            : 'Torneio',
        resultLabel: _campaignResultLabel(
          tournamentMatches: tournamentMatches,
          teamId: teamId,
        ),
        wins: wins,
        losses: losses,
        playedAt: latest,
        locationLabel: _campaignLocationLabel(tournamentMatches),
      ),
    );
  }

  entries.sort((a, b) {
    final aDate = a.playedAt;
    final bDate = b.playedAt;
    if (aDate == null && bDate == null) return 0;
    if (aDate == null) return 1;
    if (bDate == null) return -1;
    return bDate.compareTo(aDate);
  });

  return entries;
}

List<TeamHeadToHeadEntry> buildTeamHeadToHead({
  required List<TournamentMatch> matches,
  required String teamId,
  Map<String, String> teamDisplayNames = const {},
}) {
  final id = teamId.trim();
  if (id.isEmpty) return const [];

  final completed = matches
      .where((m) => TournamentMatchStatus.isCompleted(m.status))
      .toList();
  if (completed.isEmpty) return const [];

  final byOpponent = <String, _HeadToHeadAccumulator>{};
  for (final match in completed) {
    final opponentId = match.opponentTeamIdFor(id);
    if (opponentId == null || opponentId.trim().isEmpty) continue;
    final opp = opponentId.trim();
    final acc = byOpponent.putIfAbsent(opp, _HeadToHeadAccumulator.new);
    if (match.athleteTeamWon(id)) {
      acc.wins++;
    } else if (match.winnerId?.trim().isNotEmpty == true) {
      acc.losses++;
    }
    acc.opponentLabel = _opponentLabel(
      match: match,
      teamId: id,
      teamDisplayNames: teamDisplayNames,
    );
    final played = playedAtForMatch(match);
    if (played != null &&
        (acc.lastPlayedAt == null || played.isAfter(acc.lastPlayedAt!))) {
      acc.lastPlayedAt = played;
    }
  }

  final entries = byOpponent.entries
      .map(
        (e) => TeamHeadToHeadEntry(
          opponentTeamId: e.key,
          opponentLabel: e.value.opponentLabel,
          wins: e.value.wins,
          losses: e.value.losses,
          lastPlayedAt: e.value.lastPlayedAt,
        ),
      )
      .toList();

  entries.sort((a, b) {
    final byTotal = b.totalMatches.compareTo(a.totalMatches);
    if (byTotal != 0) return byTotal;
    return b.wins.compareTo(a.wins);
  });

  return entries;
}

String _campaignResultLabel({
  required List<TournamentMatch> tournamentMatches,
  required String teamId,
}) {
  for (final match in tournamentMatches) {
    if (_isFinalMatch(match) && match.athleteTeamWon(teamId)) {
      return '1º';
    }
  }

  TournamentMatch? deepestLoss;
  var maxDepth = -1;
  for (final match in tournamentMatches) {
    if (match.athleteTeamWon(teamId)) continue;
    if (match.winnerId?.trim().isEmpty ?? true) continue;
    final depth = _matchRoundDepth(match);
    if (depth > maxDepth) {
      maxDepth = depth;
      deepestLoss = match;
    }
  }

  if (deepestLoss != null) {
    return _abbreviateRoundLabel(matchRoundLabel(deepestLoss));
  }

  if (tournamentMatches.isNotEmpty) {
    return _abbreviateRoundLabel(matchRoundLabel(tournamentMatches.first));
  }
  return '—';
}

String _abbreviateRoundLabel(String label) {
  final normalized = label.trim().toLowerCase();
  if (normalized.contains('final') && !normalized.contains('semi')) return 'F';
  if (normalized.contains('semi')) return 'SF';
  if (normalized.contains('quart')) return 'QF';
  if (normalized.contains('oitav')) return 'O16';
  if (normalized.contains('32')) return 'R32';
  if (normalized == '1º' || normalized == '1o') return '1º';
  return label.length <= 4 ? label.toUpperCase() : label;
}

bool _isFinalMatch(TournamentMatch match) {
  final type = match.matchType.trim().toLowerCase();
  return type == 'final';
}

int _matchRoundDepth(TournamentMatch match) {
  final type = match.matchType.trim().toLowerCase();
  if (type == 'final') return 100;
  if (type == 'third place') return 90;
  if (type.contains('semi')) return 80;
  if (type.contains('quarter')) return 70;
  if (type.contains('16')) return 60;
  if (type.contains('32')) return 50;
  if (match.round > 0) return 40 + match.round;
  return 10;
}

String _opponentLabel({
  required TournamentMatch match,
  required String teamId,
  Map<String, String> teamDisplayNames = const {},
}) {
  final id = teamId.trim();
  final isTeamA = match.teamAId.trim() == id;
  final description = isTeamA
      ? match.teamBDescription?.trim()
      : match.teamADescription?.trim();
  if (description != null && description.isNotEmpty) return description;
  final opponentId = match.opponentTeamIdFor(id)?.trim();
  if (opponentId != null && opponentId.isNotEmpty) {
    final resolved = teamDisplayNames[opponentId]?.trim();
    if (resolved != null && resolved.isNotEmpty && resolved != opponentId) {
      return resolved;
    }
    return opponentId;
  }
  return 'Adversário';
}

String _campaignLocationLabel(List<TournamentMatch> matches) {
  for (final match in matches) {
    final court = matchCourtLabelForCard(match);
    if (court.isNotEmpty) return court;
  }
  return '';
}

class _HeadToHeadAccumulator {
  int wins = 0;
  int losses = 0;
  String opponentLabel = 'Adversário';
  DateTime? lastPlayedAt;
}
