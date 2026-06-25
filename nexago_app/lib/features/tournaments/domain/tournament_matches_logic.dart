import 'tournament_match.dart';
import 'tournament_match_display.dart';

class TournamentMatchRoundGroup {
  const TournamentMatchRoundGroup({
    required this.roundLabel,
    required this.matches,
  });

  final String roundLabel;
  final List<TournamentMatch> matches;
}

class TournamentMatchPoolGroup {
  const TournamentMatchPoolGroup({
    required this.poolLabel,
    required this.matches,
  });

  final String poolLabel;
  final List<TournamentMatch> matches;
}

List<TournamentMatch> filterMatchesByCategory(
  List<TournamentMatch> matches,
  String categoryId,
) {
  if (categoryId.isEmpty) return matches;
  return matches.where((m) => m.categoryId == categoryId).toList();
}

List<TournamentMatch> bracketMatchesForCategory(
  List<TournamentMatch> matches,
  String categoryId,
) {
  return filterMatchesByCategory(
    matches,
    categoryId,
  ).where((m) => m.isBracketMatch).toList()..sort((a, b) {
    final groupOrder = bracketGroupSortOrder(
      a,
    ).compareTo(bracketGroupSortOrder(b));
    if (groupOrder != 0) return groupOrder;
    return a.matchNumber.compareTo(b.matchNumber);
  });
}

/// Chave composta para agrupar fases sem colapsar WB/LB ou tipos distintos no mesmo `round`.
String bracketGroupKey(TournamentMatch match) {
  final type = match.matchType.trim();
  final typeLower = type.toLowerCase();
  if (type == 'WB' || type == 'LB') return '$type:${match.round}';
  // Chave gerada pela CF usa matchType genérico "knockout" + round por fase.
  if (typeLower == 'knockout') return 'knockout:${match.round}';
  if (type.isNotEmpty) return type;
  final desc = match.description?.trim();
  if (desc != null && desc.isNotEmpty) return 'desc:$desc';
  return 'round:${match.round}';
}

int bracketGroupSortOrder(TournamentMatch match) {
  final type = match.matchType.trim().toLowerCase();
  // Dupla eliminatória: WB1 → LB1 → WB2 → LB2 …
  if (type == 'wb') return match.round * 10;
  if (type == 'lb') return match.round * 10 + 5;
  if (type == 'knockout') return 200 + match.round;
  if (type == 'third place') return 8900;
  if (type == 'final') return 9000;
  if (type == 'grand final' || type == 'grand_final') return 9100;
  const knownOrder = <String, int>{
    'round of 32': 10,
    'round of 16': 20,
    'quarter-final': 30,
    'semi-final': 40,
    'elimination': 50,
    'other': 55,
  };
  final base = knownOrder[type] ?? 60;
  return base * 10 + match.round;
}

List<TournamentMatchRoundGroup> groupBracketMatchesByRound(
  List<TournamentMatch> matches,
) {
  if (matches.isEmpty) return const [];

  final byGroup = <String, List<TournamentMatch>>{};
  for (final match in matches) {
    byGroup.putIfAbsent(bracketGroupKey(match), () => []).add(match);
  }

  final keys = byGroup.keys.toList()
    ..sort((a, b) {
      final aOrder = bracketGroupSortOrder(byGroup[a]!.first);
      final bOrder = bracketGroupSortOrder(byGroup[b]!.first);
      final orderCmp = aOrder.compareTo(bOrder);
      if (orderCmp != 0) return orderCmp;
      return a.compareTo(b);
    });

  return keys.map((key) {
    final groupMatches = [...byGroup[key]!]
      ..sort((a, b) => a.matchNumber.compareTo(b.matchNumber));
    return TournamentMatchRoundGroup(
      roundLabel: bracketRoundGroupLabel(groupMatches),
      matches: groupMatches,
    );
  }).toList();
}

List<TournamentMatch> poolMatchesForCategory(
  List<TournamentMatch> matches,
  String categoryId,
) {
  return filterMatchesByCategory(
    matches,
    categoryId,
  ).where((m) => m.isPoolMatch).toList()..sort((a, b) {
    final p = a.poolId.compareTo(b.poolId);
    if (p != 0) return p;
    return a.matchNumber.compareTo(b.matchNumber);
  });
}

List<TournamentMatchPoolGroup> groupMatchesByPool(
  List<TournamentMatch> matches,
) {
  if (matches.isEmpty) return const [];

  final byPool = <String, List<TournamentMatch>>{};
  for (final m in matches) {
    final key = m.poolId.trim().isEmpty ? 'Geral' : m.poolId.trim();
    byPool.putIfAbsent(key, () => []).add(m);
  }

  final keys = byPool.keys.toList()..sort();
  return keys
      .map(
        (k) => TournamentMatchPoolGroup(
          poolLabel: k.startsWith('Grupo') ? k : 'Grupo $k',
          matches: byPool[k]!,
        ),
      )
      .toList();
}

String matchStatusLabel(String status) {
  final s = status.toLowerCase();
  if (s.contains('progress')) return 'Em andamento';
  if (s.contains('completed')) return 'Finalizada';
  if (s.contains('cancel')) return 'Cancelada';
  return 'Agendada';
}

bool matchInvolvesTeam(TournamentMatch match, String teamId) {
  final id = teamId.trim();
  if (id.isEmpty) return false;
  return match.teamAId.trim() == id || match.teamBId.trim() == id;
}

bool matchInvolvesAnyTeam(TournamentMatch match, Set<String> teamIds) {
  if (teamIds.isEmpty) return false;
  return teamIds.any((teamId) => matchInvolvesTeam(match, teamId));
}

List<TournamentMatch> filterAthleteMatches(
  List<TournamentMatch> matches,
  Set<String> teamIds,
) {
  if (teamIds.isEmpty) return const [];
  return matches.where((m) => matchInvolvesAnyTeam(m, teamIds)).toList();
}

String? athleteTeamIdForCategory(
  Map<String, String> teamIdsByCategory,
  String categoryId,
) {
  final key = categoryId.trim();
  if (key.isEmpty) return null;

  final exact = teamIdsByCategory[key]?.trim();
  if (exact != null && exact.isNotEmpty) return exact;

  final normalized = key.toLowerCase();
  for (final entry in teamIdsByCategory.entries) {
    if (entry.key.trim().toLowerCase() == normalized) {
      final teamId = entry.value.trim();
      if (teamId.isNotEmpty) return teamId;
    }
  }
  return null;
}

Set<String> athleteTeamIdsForHighlight(Map<String, String> teamIdsByCategory) {
  return teamIdsByCategory.values
      .map((id) => id.trim())
      .where((id) => id.isNotEmpty)
      .toSet();
}

bool isAthleteMatchForHighlight(
  TournamentMatch match,
  Set<String> athleteTeamIds,
) {
  return matchInvolvesAnyTeam(match, athleteTeamIds);
}
