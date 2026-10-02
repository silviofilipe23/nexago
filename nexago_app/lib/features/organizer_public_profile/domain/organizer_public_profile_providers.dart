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
final organizerIsFollowedProvider =
    StreamProvider.autoDispose.family<bool, String>((ref, organizerId) {
  final uid = ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
  if (uid.isEmpty) return Stream.value(false);
  return ref.watch(organizerPublicProfileRepositoryProvider).watchIsFollowing(
        organizerId: organizerId,
        followerId: uid,
      );
});

/// Nomes das duplas campeãs dos eventos realizados (teamId → "Lima / Prado").
final organizerChampionNamesProvider = FutureProvider.autoDispose
    .family<Map<String, String>, String>((ref, organizerId) async {
  final events = await ref.watch(organizerEventsProvider(organizerId).future);
  final teamIds = organizerChampionTeamIds(organizerCompletedEvents(events));
  if (teamIds.isEmpty) return const {};
  return ref
      .read(tournamentMatchEnrichmentServiceProvider)
      .resolveTeamDisplayNames(teamIds);
});

/// Lista "Organizadores", já na ordem da spec (abertas > seguidores > nome).
final organizersDirectoryProvider =
    StreamProvider.autoDispose<List<OrganizerPublicProfile>>((ref) {
  return ref
      .watch(organizerPublicProfileRepositoryProvider)
      .watchListedProfiles()
      .map(sortOrganizersDirectory);
});
