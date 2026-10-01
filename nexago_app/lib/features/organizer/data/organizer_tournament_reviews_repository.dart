import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/tournament_reviews/organizer_tournament_review_models.dart';

/// Leitura das avaliações do torneio pelo organizador — só o servidor grava esses docs.
class OrganizerTournamentReviewsRepository {
  OrganizerTournamentReviewsRepository(this._firestore);

  final FirebaseFirestore _firestore;

  /// Resumo ao vivo — `null` até o job abrir a janela do torneio.
  Stream<TournamentReviewSummary?> watchSummary(String tournamentId) {
    final id = tournamentId.trim();
    if (id.isEmpty) return Stream.value(null);
    return _firestore
        .collection('tournamentReviewSummaries')
        .doc(id)
        .snapshots()
        .map((snap) => TournamentReviewSummary.fromMap(snap.id, snap.data()));
  }

  /// Só com `count >= 3` no resumo: abaixo disso a rule nega a leitura. A ordem (`shuffleKey`)
  /// é aplicada em `tournamentReviewCommentCards`, sem `orderBy`.
  Stream<List<AnonymousTournamentReview>> watchAnonymousReviews(String tournamentId) {
    final id = tournamentId.trim();
    if (id.isEmpty) return Stream.value(const []);
    return _firestore
        .collection('tournaments')
        .doc(id)
        .collection('anonymousReviews')
        .snapshots()
        .map((snap) => [
              for (final doc in snap.docs)
                if (AnonymousTournamentReview.fromMap(doc.id, doc.data()) case final review?) review,
            ]);
  }
}
