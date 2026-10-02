import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/firebase/firebase_providers.dart';
import '../../organizer/domain/tournament_reviews/organizer_tournament_review_models.dart';
import '../../tournaments/domain/tournament_discovery_providers.dart';
import '../data/organizer_public_profile_repository.dart';
import 'organizer_event.dart';
import 'organizer_public_profile_logic.dart';
import 'organizer_public_profile_models.dart';

/// Toda `family` daqui é chaveada pelo uid do organizador (`String`): chave `List` criaria um
/// provider novo a cada build (loop de rebuild).

final organizerPublicProfileRepositoryProvider =
    Provider<OrganizerPublicProfileRepository>((ref) {
      return OrganizerPublicProfileRepository(ref.watch(firestoreProvider));
    });

final organizerPublicProfileProvider = StreamProvider.autoDispose
    .family<OrganizerPublicProfile?, String>((ref, organizerId) {
      return ref
          .watch(organizerPublicProfileRepositoryProvider)
          .watchProfile(organizerId);
    });

final organizerEventsProvider = StreamProvider.autoDispose
    .family<List<OrganizerEvent>, String>((ref, organizerId) {
      return ref
          .watch(organizerPublicProfileRepositoryProvider)
          .watchEvents(organizerId);
    });

final organizerReviewSummariesProvider = StreamProvider.autoDispose
    .family<List<TournamentReviewSummary>, String>((ref, organizerId) {
      return ref
          .watch(organizerPublicProfileRepositoryProvider)
          .watchReviewSummaries(organizerId);
    });

/// O atleta logado segue este organizador. Sem login (ou no próprio perfil), `false`.
final organizerIsFollowedProvider = StreamProvider.autoDispose
    .family<bool, String>((ref, organizerId) {
      final uid = ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
      if (uid.isEmpty) return Stream.value(false);
      return ref
          .watch(organizerPublicProfileRepositoryProvider)
          .watchIsFollowing(organizerId: organizerId, followerId: uid);
    });

/// Ids das duplas campeãs dos eventos realizados, ordenados e unidos por vírgula. A `String`
/// só muda quando o conjunto muda: placar e `categoryOps` regravam o torneio o tempo todo, e
/// sem esta chave cada regravação refaria a busca dos nomes.
final organizerChampionTeamIdsKeyProvider = Provider.autoDispose
    .family<String, String>((ref, organizerId) {
      final events =
          ref.watch(organizerEventsProvider(organizerId)).valueOrNull ??
          const <OrganizerEvent>[];
      final ids = organizerChampionTeamIds(
        organizerCompletedEvents(events),
      ).toList()..sort();
      return ids.join(',');
    });

/// teamId → "Lima / Prado" para a chave de [organizerChampionTeamIdsKeyProvider].
final championTeamNamesByKeyProvider = FutureProvider.autoDispose
    .family<Map<String, String>, String>((ref, teamIdsKey) async {
      final teamIds = teamIdsKey
          .split(',')
          .where((id) => id.isNotEmpty)
          .toSet();
      if (teamIds.isEmpty) return const {};
      return ref
          .read(tournamentMatchEnrichmentServiceProvider)
          .resolveTeamDisplayNames(teamIds);
    });

/// Nomes das duplas campeãs dos eventos realizados do organizador.
final organizerChampionNamesProvider = FutureProvider.autoDispose
    .family<Map<String, String>, String>((ref, organizerId) {
      final key = ref.watch(organizerChampionTeamIdsKeyProvider(organizerId));
      return ref.watch(championTeamNamesByKeyProvider(key).future);
    });

/// Lista "Organizadores", já na ordem da spec (abertas > seguidores > nome).
final organizersDirectoryProvider =
    StreamProvider.autoDispose<List<OrganizerPublicProfile>>((ref) {
      return ref
          .watch(organizerPublicProfileRepositoryProvider)
          .watchListedProfiles()
          .map(sortOrganizersDirectory);
    });
