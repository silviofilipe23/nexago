import 'tournament_discovery_labels.dart';
import 'tournament_discovery_models.dart';

Set<String> collectLeagueTournamentIds(List<DiscoveryLeague> leagues) {
  final ids = <String>{};
  for (final league in leagues) {
    for (final stage in league.stages) {
      ids.addAll(stage.tournamentIds);
    }
  }
  return ids;
}

class ResolvedLeagueContext {
  const ResolvedLeagueContext({
    required this.league,
    required this.stage,
  });

  final DiscoveryLeague league;
  final DiscoveryLeagueStage stage;
}

ResolvedLeagueContext? resolveLeagueContext(
  List<DiscoveryLeague> leagues,
  String tournamentId,
) {
  for (final league in leagues) {
    final stages = [...league.stages]..sort((a, b) => a.order.compareTo(b.order));
    for (final stage in stages) {
      if (stage.tournamentIds.contains(tournamentId)) {
        return ResolvedLeagueContext(league: league, stage: stage);
      }
    }
  }
  return null;
}

String leagueContextLabel(ResolvedLeagueContext ctx) {
  return '${ctx.league.name} · ${ctx.stage.name}';
}

List<DiscoveryTournament> filterDiscoveryTournaments({
  required List<DiscoveryTournament> tournaments,
  required TournamentDiscoveryCategoryFilter category,
  required bool openOnly,
  TournamentFormat? format,
  DateTime? dateFrom,
  double? priceMax,
}) {
  return tournaments.where((t) {
    if (!tournamentMatchesCategoryFilter(t, category)) return false;
    if (!tournamentMatchesOpenFilter(t, openOnly)) return false;
    if (format != null && t.format != format) return false;
    // Mesma semântica do portal web: começa antes de `dateFrom` sai;
    // acima do teto de preço sai (gratuito passa sempre).
    if (dateFrom != null && t.startDate.isBefore(dateFrom)) return false;
    if (priceMax != null && t.priceValue > priceMax) return false;
    return true;
  }).toList();
}

/// Quantos filtros não-default estão ativos — o número do badge do botão
/// "Mais filtros" (paridade com `activeFilterCount` do portal web).
int discoveryActiveFilterCount({
  required TournamentDiscoveryCategoryFilter category,
  required bool openOnly,
  TournamentFormat? format,
  DateTime? dateFrom,
  double? priceMax,
}) {
  var count = 0;
  if (category != TournamentDiscoveryCategoryFilter.all) count++;
  if (format != null) count++;
  if (dateFrom != null) count++;
  if (priceMax != null) count++;
  if (openOnly) count++;
  return count;
}

List<DiscoveryLeague> visibleLeaguesForTournaments({
  required List<DiscoveryLeague> leagues,
  required List<DiscoveryTournament> filteredTournaments,
}) {
  final filteredIds = filteredTournaments.map((t) => t.id).toSet();
  return leagues.where((league) {
    for (final stage in league.stages) {
      for (final id in stage.tournamentIds) {
        if (filteredIds.contains(id)) return true;
      }
    }
    return false;
  }).toList();
}

List<DiscoveryTournament> standaloneTournaments({
  required List<DiscoveryLeague> leagues,
  required List<DiscoveryTournament> filteredTournaments,
}) {
  final inLeague = collectLeagueTournamentIds(leagues);
  return filteredTournaments.where((t) => !inLeague.contains(t.id)).toList();
}

int leagueTournamentCount(
  DiscoveryLeague league,
  Set<String> filteredIds,
) {
  var n = 0;
  for (final stage in league.stages) {
    for (final id in stage.tournamentIds) {
      if (filteredIds.contains(id)) n++;
    }
  }
  return n;
}

DateTime _dayStart(DateTime dt) => DateTime(dt.year, dt.month, dt.day);

/// Próximo `startDate` entre os torneios visíveis da liga.
DateTime? discoveryLeagueNearestStartDate(
  DiscoveryLeague league,
  Map<String, DiscoveryTournament> tournamentsById,
) {
  DateTime? nearest;
  for (final stage in league.stages) {
    for (final id in stage.tournamentIds) {
      final tournament = tournamentsById[id];
      if (tournament == null) continue;
      final start = tournament.startDate;
      if (nearest == null || start.isBefore(nearest)) {
        nearest = start;
      }
    }
  }
  return nearest;
}

int compareDiscoveryTournamentsByDateProximity(
  DiscoveryTournament a,
  DiscoveryTournament b, {
  DateTime? now,
}) {
  final clock = now ?? DateTime.now();
  final today = _dayStart(clock);
  final aStart = a.startDate;
  final bStart = b.startDate;
  final aPast = aStart.isBefore(today);
  final bPast = bStart.isBefore(today);

  if (!aPast && bPast) return -1;
  if (aPast && !bPast) return 1;
  if (!aPast && !bPast) {
    final cmp = aStart.compareTo(bStart);
    if (cmp != 0) return cmp;
    return a.name.toLowerCase().compareTo(b.name.toLowerCase());
  }

  final cmp = bStart.compareTo(aStart);
  if (cmp != 0) return cmp;
  return a.name.toLowerCase().compareTo(b.name.toLowerCase());
}

int compareDiscoveryLeaguesByDateProximity(
  DiscoveryLeague a,
  DiscoveryLeague b,
  Map<String, DiscoveryTournament> tournamentsById, {
  DateTime? now,
}) {
  final aDate = discoveryLeagueNearestStartDate(a, tournamentsById);
  final bDate = discoveryLeagueNearestStartDate(b, tournamentsById);
  if (aDate == null && bDate == null) {
    return a.name.toLowerCase().compareTo(b.name.toLowerCase());
  }
  if (aDate == null) return 1;
  if (bDate == null) return -1;

  final clock = now ?? DateTime.now();
  final today = _dayStart(clock);
  final aPast = aDate.isBefore(today);
  final bPast = bDate.isBefore(today);

  if (!aPast && bPast) return -1;
  if (aPast && !bPast) return 1;
  if (!aPast && !bPast) {
    final cmp = aDate.compareTo(bDate);
    if (cmp != 0) return cmp;
    return a.name.toLowerCase().compareTo(b.name.toLowerCase());
  }

  final cmp = bDate.compareTo(aDate);
  if (cmp != 0) return cmp;
  return a.name.toLowerCase().compareTo(b.name.toLowerCase());
}

List<DiscoveryTournament> sortDiscoveryTournamentsByDateProximity(
  List<DiscoveryTournament> tournaments, {
  DateTime? now,
}) {
  final sorted = [...tournaments]
    ..sort(
      (a, b) => compareDiscoveryTournamentsByDateProximity(a, b, now: now),
    );
  return sorted;
}

List<DiscoveryLeague> sortDiscoveryLeaguesByDateProximity(
  List<DiscoveryLeague> leagues,
  List<DiscoveryTournament> tournaments, {
  DateTime? now,
}) {
  final byId = {for (final t in tournaments) t.id: t};
  final sorted = [...leagues]
    ..sort(
      (a, b) => compareDiscoveryLeaguesByDateProximity(
        a,
        b,
        byId,
        now: now,
      ),
    );
  return sorted;
}
