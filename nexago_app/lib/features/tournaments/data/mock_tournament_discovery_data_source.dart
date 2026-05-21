import 'dart:async';

import '../domain/tournament_discovery_models.dart';
import 'mock_tournament_discovery_data.dart';
import 'tournament_discovery_data_source.dart';

class MockTournamentDiscoveryDataSource implements TournamentDiscoveryDataSource {
  MockTournamentDiscoveryDataSource({
    List<DiscoveryTournament>? tournaments,
    List<DiscoveryLeague>? leagues,
  })  : _tournaments = tournaments ?? buildMockDiscoveryTournaments(),
        _leagues = leagues ?? mockDiscoveryLeagues;

  final List<DiscoveryTournament> _tournaments;
  final List<DiscoveryLeague> _leagues;

  @override
  Stream<List<DiscoveryTournament>> watchTournaments() =>
      Stream.value(List<DiscoveryTournament>.from(_tournaments));

  @override
  Stream<List<DiscoveryLeague>> watchLeagues() =>
      Stream.value(List<DiscoveryLeague>.from(_leagues));

  @override
  Stream<DiscoveryTournament?> watchTournament(String id) {
    for (final t in _tournaments) {
      if (t.id == id) return Stream.value(t);
    }
    return Stream.value(null);
  }

  @override
  Stream<DiscoveryLeague?> watchLeague(String id) {
    for (final l in _leagues) {
      if (l.id == id) return Stream.value(l);
    }
    return Stream.value(null);
  }
}
