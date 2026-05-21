import '../domain/tournament_discovery_config.dart';
import '../domain/tournament_discovery_models.dart';
import 'leagues_repository.dart';
import 'mock_tournament_discovery_data.dart';
import 'mock_tournament_discovery_data_source.dart';
import 'tournament_discovery_data_source.dart';
import 'tournaments_repository.dart';

class FirestoreTournamentDiscoveryDataSource
    implements TournamentDiscoveryDataSource {
  FirestoreTournamentDiscoveryDataSource({
    required TournamentsRepository tournamentsRepository,
    required LeaguesRepository leaguesRepository,
    MockTournamentDiscoveryDataSource? mockFallback,
  })  : _tournamentsRepository = tournamentsRepository,
        _leaguesRepository = leaguesRepository,
        _mockFallback = mockFallback ??
            MockTournamentDiscoveryDataSource(
              tournaments: buildMockDiscoveryTournaments(),
              leagues: mockDiscoveryLeagues,
            );

  final TournamentsRepository _tournamentsRepository;
  final LeaguesRepository _leaguesRepository;
  final MockTournamentDiscoveryDataSource _mockFallback;

  @override
  Stream<List<DiscoveryTournament>> watchTournaments() {
    return _tournamentsRepository.watchDiscoveryTournaments().map((list) {
      if (list.isEmpty && kFallbackToMockIfEmpty) {
        return buildMockDiscoveryTournaments();
      }
      return list;
    });
  }

  @override
  Stream<List<DiscoveryLeague>> watchLeagues() {
    return _leaguesRepository.watchLeagues().map((list) {
      if (list.isEmpty && kFallbackToMockIfEmpty) {
        return mockDiscoveryLeagues;
      }
      return list;
    });
  }

  @override
  Stream<DiscoveryTournament?> watchTournament(String id) {
    return _tournamentsRepository.watchTournament(id).asyncMap((t) async {
      if (t != null) return t;
      if (!kFallbackToMockIfEmpty) return null;
      return _mockFallback.watchTournament(id).first;
    });
  }

  @override
  Stream<DiscoveryLeague?> watchLeague(String id) {
    return _leaguesRepository.watchLeague(id).asyncMap((l) async {
      if (l != null) return l;
      if (!kFallbackToMockIfEmpty) return null;
      return _mockFallback.watchLeague(id).first;
    });
  }
}
