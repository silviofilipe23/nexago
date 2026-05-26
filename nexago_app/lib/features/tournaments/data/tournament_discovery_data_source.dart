import '../domain/tournament_detail_model.dart';
import '../domain/tournament_discovery_models.dart';

/// Fonte de dados para discovery (mock ou Firestore).
abstract interface class TournamentDiscoveryDataSource {
  Stream<List<DiscoveryTournament>> watchTournaments();

  Stream<List<DiscoveryLeague>> watchLeagues();

  Stream<DiscoveryTournament?> watchTournament(String id);

  Stream<TournamentDetail?> watchTournamentDetail(String id);

  Stream<DiscoveryLeague?> watchLeague(String id);
}
