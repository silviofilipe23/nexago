import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/cache_for.dart';
import '../../../core/search/search_keywords.dart';
import 'package:nexago_app/core/firebase/firebase_providers.dart';
import '../../athlete/domain/athlete_display_name.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../data/firestore_tournament_discovery_data_source.dart';
import '../data/leagues_repository.dart';
import '../data/mock_tournament_discovery_data_source.dart';
import '../data/tournament_discovery_data_source.dart';
import '../data/tournament_inscriptions_repository.dart';
import '../data/tournament_match_enrichment_service.dart';
import '../data/tournament_matches_repository.dart';
import '../data/tournament_teams_repository.dart';
import '../data/tournaments_repository.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';
import 'tournament_group_standings_logic.dart';
import 'tournament_match.dart';
import 'tournament_match_card_view_model.dart';
import 'tournament_match_point_event.dart';
import 'tournament_matches_logic.dart';
import 'tournament_team.dart';
import 'tournament_detail_logic.dart';
import 'tournament_detail_model.dart';
import 'tournament_discovery_config.dart';
import 'tournament_discovery_labels.dart';
import 'tournament_discovery_models.dart';

final tournamentsRepositoryProvider = Provider<TournamentsRepository>((ref) {
  return TournamentsRepository(ref.watch(firestoreProvider));
});

final tournamentMatchesRepositoryProvider =
    Provider<TournamentMatchesRepository>((ref) {
  return TournamentMatchesRepository(ref.watch(firestoreProvider));
});

final tournamentTeamsRepositoryProvider =
    Provider<TournamentTeamsRepository>((ref) {
  return TournamentTeamsRepository(ref.watch(firestoreProvider));
});

final tournamentMatchEnrichmentServiceProvider =
    Provider<TournamentMatchEnrichmentService>((ref) {
  return TournamentMatchEnrichmentService(
    teamsRepository: ref.watch(tournamentTeamsRepositoryProvider),
    usersRepository: ref.watch(usersRepositoryProvider),
  );
});

final tournamentMatchesProvider = StreamProvider.autoDispose
    .family<List<TournamentMatch>, String>((ref, tournamentId) {
  return ref
      .watch(tournamentMatchesRepositoryProvider)
      .watchByTournament(tournamentId);
});

final matchPointEventsProvider = StreamProvider.autoDispose
    .family<List<TournamentMatchPointEvent>, String>((ref, matchId) {
  return ref
      .watch(tournamentMatchesRepositoryProvider)
      .watchPointEvents(matchId);
});

final tournamentMatchCardsProvider = StreamProvider.autoDispose
    .family<List<TournamentMatchCardViewModel>, String>((ref, tournamentId) {
  final repo = ref.watch(tournamentMatchesRepositoryProvider);
  final enrichment = ref.watch(tournamentMatchEnrichmentServiceProvider);
  return repo
      .watchByTournament(tournamentId)
      .asyncMap(enrichment.enrichMatches);
});

typedef TournamentCategoryPoolTeamNamesKey = ({
  String tournamentId,
  String categoryId,
});

/// Nomes das equipes na fase de grupos (inscrições + perfis públicos).
final tournamentCategoryPoolTeamDisplayNamesProvider = FutureProvider.autoDispose
    .family<Map<String, String>, TournamentCategoryPoolTeamNamesKey>(
  (ref, key) async {
    ref.watch(tournamentMatchesProvider(key.tournamentId));
    final matches =
        await ref.read(tournamentMatchesProvider(key.tournamentId).future);
    final pool = poolMatchesForCategory(matches, key.categoryId);

    final teamIds = <String>{};
    final descriptions = <String, String>{};
    for (final match in pool) {
      for (final side in [
        (match.teamAId, match.teamADescription),
        (match.teamBId, match.teamBDescription),
      ]) {
        final id = side.$1.trim();
        if (id.isEmpty) continue;
        teamIds.add(id);
        final desc = side.$2?.trim();
        if (desc != null &&
            desc.isNotEmpty &&
            isResolvedTeamDisplayName(id, desc)) {
          descriptions[id] = desc;
        }
      }
    }
    if (teamIds.isEmpty) return const {};

    final enrichment = ref.read(tournamentMatchEnrichmentServiceProvider);
    final inscriptions =
        await ref
            .read(tournamentInscriptionsRepositoryProvider)
            .watchByTournament(key.tournamentId)
            .first;

    final teamsById = <String, TournamentTeam>{};
    for (final row in inscriptions) {
      final categoryId =
          (row.inscription['categoryId'] as String?)?.trim() ?? '';
      if (categoryId != key.categoryId.trim()) continue;
      final teamId = (row.inscription['teamId'] as String?)?.trim() ?? '';
      if (teamId.isEmpty || !teamIds.contains(teamId) || row.team == null) {
        continue;
      }
      teamsById[teamId] = TournamentTeam.fromMap(teamId, row.team!);
    }

    final fromInscriptions =
        await enrichment.resolveTeamDisplayNamesFromTeams(teamsById);
    final fromRepository = await enrichment.resolveTeamDisplayNames(
      teamIds,
      descriptionsByTeamId: descriptions,
    );

    return mergeTeamDisplayNameMaps(
      mergeTeamDisplayNameMaps(descriptions, fromRepository),
      fromInscriptions,
    );
  },
);

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
  cacheFor(ref);
  return ref.watch(tournamentDiscoveryDataSourceProvider).watchTournaments();
});

final discoveryTournamentKeywordSearchProvider = FutureProvider.autoDispose
    .family<List<DiscoveryTournament>, String>((ref, query) async {
  if (!isSearchTermLongEnough(query)) return const [];
  return ref.read(tournamentsRepositoryProvider).searchByKeywords(query);
});

final discoveryLeagueKeywordSearchProvider = FutureProvider.autoDispose
    .family<List<DiscoveryLeague>, String>((ref, query) async {
  if (!isSearchTermLongEnough(query)) return const [];
  return ref.read(leaguesRepositoryProvider).searchByKeywords(query);
});

final discoveryLeaguesProvider =
    StreamProvider.autoDispose<List<DiscoveryLeague>>((ref) {
  cacheFor(ref);
  return ref.watch(tournamentDiscoveryDataSourceProvider).watchLeagues();
});

final tournamentDetailProvider = StreamProvider.autoDispose
    .family<TournamentDetail?, String>((ref, tournamentId) {
  // Detalhe é reaberto com frequência: mantém vivo para reabrir instantâneo.
  cacheFor(ref);
  return ref
      .watch(tournamentDiscoveryDataSourceProvider)
      .watchTournamentDetail(tournamentId);
});

/// Nome exibível do organizador (`users/{managerId}`).
final tournamentOrganizerDisplayProvider = Provider.autoDispose
    .family<String, String>((ref, managerId) {
  final id = managerId.trim();
  if (id.isEmpty) return tournamentOrganizerDisplayName();
  final profile = ref.watch(athleteProfileByIdProvider(id)).valueOrNull;
  final display =
      profile != null ? athleteDisplayName(profile, fallback: '') : '';
  final profileName = display.isNotEmpty ? display : null;
  final email = ref.watch(athleteUserEmailProvider(id)).valueOrNull;
  return tournamentOrganizerDisplayName(
    profileName: profileName,
    email: email,
  );
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
