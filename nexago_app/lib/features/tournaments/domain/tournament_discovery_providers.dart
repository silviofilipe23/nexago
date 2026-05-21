import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../arenas/domain/arenas_providers.dart';
import '../data/firestore_tournament_discovery_data_source.dart';
import '../data/leagues_repository.dart';
import '../data/mock_tournament_discovery_data_source.dart';
import '../data/tournament_discovery_data_source.dart';
import '../data/tournaments_repository.dart';
import 'tournament_discovery_config.dart';
import 'tournament_discovery_labels.dart';
import 'tournament_discovery_models.dart';

final tournamentsRepositoryProvider = Provider<TournamentsRepository>((ref) {
  return TournamentsRepository(ref.watch(firestoreProvider));
});

final leaguesRepositoryProvider = Provider<LeaguesRepository>((ref) {
  return LeaguesRepository(ref.watch(firestoreProvider));
});

final tournamentDiscoveryDataSourceProvider =
    Provider<TournamentDiscoveryDataSource>((ref) {
  if (kUseFirestoreTournamentDiscovery) {
    return FirestoreTournamentDiscoveryDataSource(
      tournamentsRepository: ref.watch(tournamentsRepositoryProvider),
      leaguesRepository: ref.watch(leaguesRepositoryProvider),
    );
  }
  return MockTournamentDiscoveryDataSource();
});

final discoveryTournamentsProvider =
    StreamProvider.autoDispose<List<DiscoveryTournament>>((ref) {
  return ref.watch(tournamentDiscoveryDataSourceProvider).watchTournaments();
});

final discoveryLeaguesProvider =
    StreamProvider.autoDispose<List<DiscoveryLeague>>((ref) {
  return ref.watch(tournamentDiscoveryDataSourceProvider).watchLeagues();
});

final tournamentDetailProvider = StreamProvider.autoDispose
    .family<DiscoveryTournament?, String>((ref, tournamentId) {
  return ref
      .watch(tournamentDiscoveryDataSourceProvider)
      .watchTournament(tournamentId);
});

final leagueDetailProvider =
    StreamProvider.autoDispose.family<DiscoveryLeague?, String>((ref, leagueId) {
  return ref.watch(tournamentDiscoveryDataSourceProvider).watchLeague(leagueId);
});

/// Stats derivados da lista carregada (sem números fake).
final discoveryLiveStatsProvider =
    Provider.autoDispose<TournamentDiscoveryLiveStats>((ref) {
  final tournaments = ref.watch(discoveryTournamentsProvider).valueOrNull ??
      const <DiscoveryTournament>[];
  return computeDiscoveryLiveStats(tournaments);
});
