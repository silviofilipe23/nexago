import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/firebase/firebase_providers.dart';

import '../../data/organizer_tournament_reviews_repository.dart';
import 'organizer_tournament_review_models.dart';

final organizerTournamentReviewsRepositoryProvider =
    Provider<OrganizerTournamentReviewsRepository>((ref) {
  return OrganizerTournamentReviewsRepository(ref.watch(firestoreProvider));
});

final tournamentReviewSummaryProvider =
    StreamProvider.autoDispose.family<TournamentReviewSummary?, String>((ref, tournamentId) {
  return ref.watch(organizerTournamentReviewsRepositoryProvider).watchSummary(tournamentId);
});

/// Só deve ser observado com 3+ avaliações no resumo (a rule nega antes disso).
final tournamentAnonymousReviewsProvider = StreamProvider.autoDispose
    .family<List<AnonymousTournamentReview>, String>((ref, tournamentId) {
  return ref.watch(organizerTournamentReviewsRepositoryProvider).watchAnonymousReviews(tournamentId);
});

/// Público: o detalhe do torneio (atleta) mostra a nota do organizador na linha dele.
final organizerReputationProvider =
    StreamProvider.autoDispose.family<OrganizerReputation?, String>((ref, organizerId) {
  return ref
      .watch(organizerTournamentReviewsRepositoryProvider)
      .watchOrganizerReputation(organizerId);
});
