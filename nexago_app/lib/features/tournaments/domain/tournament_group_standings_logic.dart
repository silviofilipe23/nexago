import 'tournament_match.dart';
import 'tournament_match_card_view_model.dart';
import 'tournament_match_status.dart';
import 'tournament_matches_logic.dart';

class TournamentPoolTeamStats {
  const TournamentPoolTeamStats({
    required this.teamId,
    required this.wins,
    required this.losses,
    required this.setsWon,
    required this.setsLost,
    required this.gamesWon,
    required this.gamesLost,
  });

  final String teamId;
  final int wins;
  final int losses;
  final int setsWon;
  final int setsLost;
  final int gamesWon;
  final int gamesLost;
}

class TournamentPoolStandingsRow {
  const TournamentPoolStandingsRow({
    required this.rank,
    required this.teamId,
    required this.displayName,
    required this.wins,
    required this.losses,
    required this.setsWon,
    required this.setsLost,
    required this.points,
    required this.qualifies,
    required this.isAthleteTeam,
  });

  final int rank;
  final String teamId;
  final String displayName;
  final int wins;
  final int losses;
  final int setsWon;
  final int setsLost;
  final int points;
  final bool qualifies;
  final bool isAthleteTeam;

  String get setsForDisplay => '$setsWon-$setsLost';
}

class TournamentPoolStandingsGroup {
  const TournamentPoolStandingsGroup({
    required this.poolId,
    required this.poolLabel,
    required this.rows,
    required this.teamCount,
    required this.matchCount,
    required this.isComplete,
  });

  final String poolId;
  final String poolLabel;
  final List<TournamentPoolStandingsRow> rows;
  final int teamCount;
  final int matchCount;
  final bool isComplete;
}

class _MatchScore {
  const _MatchScore({
    required this.setsA,
    required this.setsB,
    required this.gamesA,
    required this.gamesB,
  });

  final int setsA;
  final int setsB;
  final int gamesA;
  final int gamesB;
}

class _TeamStatsMutable {
  _TeamStatsMutable(this.teamId);

  final String teamId;
  int wins = 0;
  int matchesPlayed = 0;
  int setsWon = 0;
  int setsLost = 0;
  int gamesWon = 0;
  int gamesLost = 0;
  int h2hWins = 0;
  int h2hSetDiff = 0;
  int h2hGameDiff = 0;
}

class _PlayedMatch {
  const _PlayedMatch({
    required this.winnerId,
    required this.teamAId,
    required this.teamBId,
    required this.score,
  });

  final String winnerId;
  final String teamAId;
  final String teamBId;
  final _MatchScore score;
}

bool isGroupStageMatch(TournamentMatch match) {
  final matchType = match.matchType.trim().toLowerCase();
  return match.isGroupMatch ||
      matchType == 'group' ||
      matchType == 'groups';
}

_MatchScore? parseGroupMatchScore(TournamentMatch match) {
  final teamAId = match.teamAId.trim();
  final teamBId = match.teamBId.trim();
  final winnerId = match.winnerId?.trim() ?? '';

  if (match.sets.isNotEmpty) {
    var setsA = 0;
    var setsB = 0;
    var gamesA = 0;
    var gamesB = 0;
    for (final set in match.sets) {
      final a = set.a;
      final b = set.b;
      gamesA += a < 0 ? 0 : a;
      gamesB += b < 0 ? 0 : b;
      if (a > b) {
        setsA++;
      } else if (b > a) {
        setsB++;
      }
    }
    if (setsA > 0 || setsB > 0 || gamesA > 0 || gamesB > 0) {
      return _MatchScore(
        setsA: setsA,
        setsB: setsB,
        gamesA: gamesA,
        gamesB: gamesB,
      );
    }
  }

  final ra = int.tryParse(match.resultA.trim());
  final rb = int.tryParse(match.resultB.trim());
  if (ra != null && rb != null && (ra > 0 || rb > 0)) {
    return _MatchScore(
      setsA: ra < 0 ? 0 : ra,
      setsB: rb < 0 ? 0 : rb,
      gamesA: 0,
      gamesB: 0,
    );
  }

  if (winnerId.isNotEmpty && winnerId == teamAId) {
    return const _MatchScore(setsA: 1, setsB: 0, gamesA: 0, gamesB: 0);
  }
  if (winnerId.isNotEmpty && winnerId == teamBId) {
    return const _MatchScore(setsA: 0, setsB: 1, gamesA: 0, gamesB: 0);
  }
  return null;
}

int expectedGroupMatchCount(int teamCount) {
  if (teamCount < 2) return 0;
  return (teamCount * (teamCount - 1)) ~/ 2;
}

bool isPoolRoundRobinComplete(
  String poolId,
  List<String> teamIds,
  List<TournamentMatch> matches,
) {
  final expected = expectedGroupMatchCount(teamIds.length);
  if (expected == 0) return teamIds.isNotEmpty;

  final completed = matches.where((match) {
    if (!isGroupStageMatch(match)) return false;
    if (match.poolId.trim() != poolId) return false;
    return TournamentMatchStatus.isCompleted(match.status) &&
        (match.winnerId?.trim().isNotEmpty ?? false);
  }).length;

  return completed >= expected;
}

List<String> computePoolStandings(
  String poolId,
  List<String> teamIds,
  List<TournamentMatch> matches,
) {
  final ids = teamIds.map((id) => id.trim()).where((id) => id.isNotEmpty).toList();
  if (ids.isEmpty) return [];

  final seedIndex = <String, int>{
    for (var i = 0; i < ids.length; i++) ids[i]: i,
  };

  final stats = <String, _TeamStatsMutable>{
    for (final teamId in ids) teamId: _TeamStatsMutable(teamId),
  };

  final played = <_PlayedMatch>[];

  for (final match in matches) {
    if (!isGroupStageMatch(match)) continue;
    if (match.poolId.trim() != poolId) continue;
    if (!TournamentMatchStatus.isCompleted(match.status)) continue;

    final winnerId = match.winnerId?.trim() ?? '';
    final teamAId = match.teamAId.trim();
    final teamBId = match.teamBId.trim();
    if (winnerId.isEmpty || teamAId.isEmpty || teamBId.isEmpty) continue;
    if (!stats.containsKey(teamAId) || !stats.containsKey(teamBId)) continue;

    final score = parseGroupMatchScore(match);
    if (score == null) continue;

    stats[winnerId]!.wins++;

    final aStats = stats[teamAId]!;
    final bStats = stats[teamBId]!;
    aStats.setsWon += score.setsA;
    aStats.setsLost += score.setsB;
    aStats.gamesWon += score.gamesA;
    aStats.gamesLost += score.gamesB;
    bStats.setsWon += score.setsB;
    bStats.setsLost += score.setsA;
    bStats.gamesWon += score.gamesB;
    bStats.gamesLost += score.gamesA;

    played.add(
      _PlayedMatch(
        winnerId: winnerId,
        teamAId: teamAId,
        teamBId: teamBId,
        score: score,
      ),
    );
  }

  int winsOf(String id) => stats[id]?.wins ?? 0;

  for (final game in played) {
    if (winsOf(game.teamAId) != winsOf(game.teamBId)) continue;
    final aStats = stats[game.teamAId]!;
    final bStats = stats[game.teamBId]!;
    if (game.winnerId == game.teamAId) {
      aStats.h2hWins++;
    } else {
      bStats.h2hWins++;
    }
    final setDiff = game.score.setsA - game.score.setsB;
    final gameDiff = game.score.gamesA - game.score.gamesB;
    aStats.h2hSetDiff += setDiff;
    bStats.h2hSetDiff -= setDiff;
    aStats.h2hGameDiff += gameDiff;
    bStats.h2hGameDiff -= gameDiff;
  }

  final entries = stats.values.toList()
    ..sort((a, b) {
      if (b.wins != a.wins) return b.wins.compareTo(a.wins);
      if (b.h2hWins != a.h2hWins) return b.h2hWins.compareTo(a.h2hWins);
      if (b.h2hSetDiff != a.h2hSetDiff) {
        return b.h2hSetDiff.compareTo(a.h2hSetDiff);
      }
      if (b.h2hGameDiff != a.h2hGameDiff) {
        return b.h2hGameDiff.compareTo(a.h2hGameDiff);
      }
      final setDiffA = a.setsWon - a.setsLost;
      final setDiffB = b.setsWon - b.setsLost;
      if (setDiffB != setDiffA) return setDiffB.compareTo(setDiffA);
      final gameDiffA = a.gamesWon - a.gamesLost;
      final gameDiffB = b.gamesWon - b.gamesLost;
      if (gameDiffB != gameDiffA) return gameDiffB.compareTo(gameDiffA);
      if (b.setsWon != a.setsWon) return b.setsWon.compareTo(a.setsWon);
      return (seedIndex[a.teamId] ?? 0).compareTo(seedIndex[b.teamId] ?? 0);
    });

  return entries.map((entry) => entry.teamId).toList();
}

Map<String, TournamentPoolTeamStats> computePoolTeamStats(
  String poolId,
  List<String> teamIds,
  List<TournamentMatch> matches,
) {
  final ids = teamIds.map((id) => id.trim()).where((id) => id.isNotEmpty).toList();
  final stats = <String, _TeamStatsMutable>{
    for (final teamId in ids) teamId: _TeamStatsMutable(teamId),
  };

  for (final match in matches) {
    if (!isGroupStageMatch(match)) continue;
    if (match.poolId.trim() != poolId) continue;
    if (!TournamentMatchStatus.isCompleted(match.status)) continue;

    final winnerId = match.winnerId?.trim() ?? '';
    final teamAId = match.teamAId.trim();
    final teamBId = match.teamBId.trim();
    if (winnerId.isEmpty || teamAId.isEmpty || teamBId.isEmpty) continue;
    if (!stats.containsKey(teamAId) || !stats.containsKey(teamBId)) continue;

    final score = parseGroupMatchScore(match);
    if (score == null) continue;

    stats[winnerId]!.wins++;
    stats[teamAId]!.matchesPlayed++;
    stats[teamBId]!.matchesPlayed++;

    final aStats = stats[teamAId]!;
    final bStats = stats[teamBId]!;
    aStats.setsWon += score.setsA;
    aStats.setsLost += score.setsB;
    aStats.gamesWon += score.gamesA;
    aStats.gamesLost += score.gamesB;
    bStats.setsWon += score.setsB;
    bStats.setsLost += score.setsA;
    bStats.gamesWon += score.gamesB;
    bStats.gamesLost += score.gamesA;
  }

  return {
    for (final entry in stats.entries)
      entry.key: TournamentPoolTeamStats(
        teamId: entry.key,
        wins: entry.value.wins,
        losses: entry.value.matchesPlayed - entry.value.wins,
        setsWon: entry.value.setsWon,
        setsLost: entry.value.setsLost,
        gamesWon: entry.value.gamesWon,
        gamesLost: entry.value.gamesLost,
      ),
  };
}

List<String> teamIdsInPool(List<TournamentMatch> poolMatches) {
  final ordered = <String>[];
  final seen = <String>{};
  final sorted = [...poolMatches]..sort((a, b) => a.matchNumber.compareTo(b.matchNumber));
  for (final match in sorted) {
    for (final teamId in [match.teamAId.trim(), match.teamBId.trim()]) {
      if (teamId.isEmpty || seen.contains(teamId)) continue;
      seen.add(teamId);
      ordered.add(teamId);
    }
  }
  return ordered;
}

String poolLabelForId(String poolId) {
  final trimmed = poolId.trim();
  if (trimmed.isEmpty) return 'Geral';
  if (trimmed.toLowerCase().startsWith('grupo')) return trimmed;
  return 'Grupo $trimmed';
}

String teamDisplayNameFromCards({
  required String teamId,
  required List<TournamentMatch> poolMatches,
  required Map<String, TournamentMatchCardViewModel> cardsById,
}) {
  final id = teamId.trim();
  if (id.isEmpty) return '';

  for (final match in poolMatches) {
    final card = cardsById[match.id];
    if (card == null) continue;
    if (match.teamAId.trim() == id) {
      final name = card.teamA.displayName.trim();
      if (name.isNotEmpty) return name;
    }
    if (match.teamBId.trim() == id) {
      final name = card.teamB.displayName.trim();
      if (name.isNotEmpty) return name;
    }
  }

  for (final match in poolMatches) {
    if (match.teamAId.trim() == id) {
      final desc = match.teamADescription?.trim();
      if (desc != null && desc.isNotEmpty) return desc;
    }
    if (match.teamBId.trim() == id) {
      final desc = match.teamBDescription?.trim();
      if (desc != null && desc.isNotEmpty) return desc;
    }
  }

  return id;
}

List<TournamentPoolStandingsGroup> buildPoolStandingsGroups({
  required List<TournamentMatch> poolMatches,
  required Map<String, TournamentMatchCardViewModel> cardsById,
  required int qualifiersPerGroup,
  required Set<String> athleteTeamIds,
}) {
  if (poolMatches.isEmpty) return const [];

  final poolGroups = groupMatchesByPool(poolMatches);
  final safeQualifiers = qualifiersPerGroup < 1 ? 2 : qualifiersPerGroup;

  return poolGroups.map((group) {
    final first = group.matches.first;
    final effectivePoolId =
        first.poolId.trim().isEmpty ? 'Geral' : first.poolId.trim();
    final teamIds = teamIdsInPool(group.matches);
    final rankedIds =
        computePoolStandings(effectivePoolId, teamIds, group.matches);
    final statsByTeam =
        computePoolTeamStats(effectivePoolId, teamIds, group.matches);
    final isComplete = isPoolRoundRobinComplete(
      effectivePoolId,
      teamIds,
      group.matches,
    );

    final rows = <TournamentPoolStandingsRow>[];
    for (var i = 0; i < rankedIds.length; i++) {
      final teamId = rankedIds[i];
      final stats = statsByTeam[teamId]!;
      final rank = i + 1;
      rows.add(
        TournamentPoolStandingsRow(
          rank: rank,
          teamId: teamId,
          displayName: teamDisplayNameFromCards(
            teamId: teamId,
            poolMatches: group.matches,
            cardsById: cardsById,
          ),
          wins: stats.wins,
          losses: stats.losses,
          setsWon: stats.setsWon,
          setsLost: stats.setsLost,
          points: stats.wins * 2,
          qualifies: rank <= safeQualifiers,
          isAthleteTeam: athleteTeamIds.contains(teamId),
        ),
      );
    }

    return TournamentPoolStandingsGroup(
      poolId: effectivePoolId,
      poolLabel: group.poolLabel,
      rows: rows,
      teamCount: teamIds.length,
      matchCount: group.matches.length,
      isComplete: isComplete,
    );
  }).toList();
}

bool isGroupStageCompleteForCategory(List<TournamentPoolStandingsGroup> groups) {
  if (groups.isEmpty) return false;
  return groups.every((group) => group.isComplete);
}
