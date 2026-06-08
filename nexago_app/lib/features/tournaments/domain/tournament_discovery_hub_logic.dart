import 'tournament_discovery_models.dart';

String _norm(String input) => input.trim().toLowerCase();

bool matchesDiscoveryQuery({
  required String query,
  required List<String> haystack,
}) {
  final q = _norm(query);
  if (q.isEmpty) return true;
  for (final raw in haystack) {
    final v = _norm(raw);
    if (v.contains(q)) return true;
  }
  return false;
}

List<DiscoveryTournament> filterTournamentsByQuery(
  List<DiscoveryTournament> tournaments,
  String query,
) {
  if (_norm(query).isEmpty) return tournaments;
  return tournaments.where((t) {
    return matchesDiscoveryQuery(
      query: query,
      haystack: [
        t.name,
        t.city,
        t.location,
        t.dateLabel,
      ],
    );
  }).toList();
}

List<DiscoveryLeague> filterLeaguesByQuery(
  List<DiscoveryLeague> leagues,
  String query,
) {
  if (_norm(query).isEmpty) return leagues;
  return leagues.where((l) {
    return matchesDiscoveryQuery(
      query: query,
      haystack: [
        l.name,
        l.city ?? '',
        l.seasonLabel ?? '',
      ],
    );
  }).toList();
}

Map<String, MyTournamentRegistration> registrationsByTournamentId(
  List<MyTournamentRegistration> regs,
) {
  final out = <String, MyTournamentRegistration>{};
  for (final r in regs) {
    final id = r.tournamentId.trim();
    if (id.isEmpty) continue;
    out[id] = r;
  }
  return out;
}

Map<String, Set<String>> registeredCategoriesByTournament(
  List<MyTournamentRegistration> regs,
) {
  final out = <String, Set<String>>{};
  for (final r in regs) {
    final tournamentId = r.tournamentId.trim();
    final categoryId = r.categoryId.trim();
    if (tournamentId.isEmpty || categoryId.isEmpty) continue;
    out.putIfAbsent(tournamentId, () => {}).add(categoryId);
  }
  return out;
}

