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
}) {
  return tournaments.where((t) {
    if (!tournamentMatchesCategoryFilter(t, category)) return false;
    if (!tournamentMatchesOpenFilter(t, openOnly)) return false;
    return true;
  }).toList();
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
