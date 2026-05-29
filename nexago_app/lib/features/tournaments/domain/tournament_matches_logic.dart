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
  return filterMatchesByCategory(matches, categoryId)
      .where((m) => m.isBracketMatch)
      .toList()
    ..sort((a, b) {
      final r = a.round.compareTo(b.round);
      if (r != 0) return r;
      return a.matchNumber.compareTo(b.matchNumber);
    });
}

List<TournamentMatch> poolMatchesForCategory(
  List<TournamentMatch> matches,
  String categoryId,
) {
  return filterMatchesByCategory(matches, categoryId)
      .where((m) => m.isPoolMatch)
      .toList()
    ..sort((a, b) {
      final p = a.poolId.compareTo(b.poolId);
      if (p != 0) return p;
      return a.matchNumber.compareTo(b.matchNumber);
    });
}

List<TournamentMatchRoundGroup> groupBracketMatchesByRound(
  List<TournamentMatch> matches,
) {
  if (matches.isEmpty) return const [];

  final byRound = <int, List<TournamentMatch>>{};
  for (final m in matches) {
    byRound.putIfAbsent(m.round, () => []).add(m);
  }

  final rounds = byRound.keys.toList()..sort();
  return rounds
      .map(
        (r) => TournamentMatchRoundGroup(
          roundLabel: bracketRoundGroupLabel(byRound[r]!),
          matches: byRound[r]!,
        ),
      )
      .toList();
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
