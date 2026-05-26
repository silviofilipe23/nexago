import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../arenas/domain/arenas_providers.dart';
import 'nexago_artifacts_paths.dart';

/// Contagem de inscrições (equipes/vagas) por `categoryId` em um torneio.
typedef TournamentCategoryEnrollmentCounts = Map<String, int>;

/// Agrega linhas de inscrição (`categoryId` = nome da categoria no torneio).
TournamentCategoryEnrollmentCounts countInscriptionsByCategoryData(
  Iterable<Map<String, dynamic>> rows,
) {
  final counts = <String, int>{};
  for (final data in rows) {
    final categoryId = (data['categoryId'] as String?)?.trim() ?? '';
    if (categoryId.isEmpty) continue;
    counts[categoryId] = (counts[categoryId] ?? 0) + 1;
  }
  return counts;
}

/// Agrega documentos de `artifacts/{projectId}/public/data/inscriptions`.
TournamentCategoryEnrollmentCounts countInscriptionsByCategory(
  Iterable<QueryDocumentSnapshot<Map<String, dynamic>>> docs,
) {
  return countInscriptionsByCategoryData(docs.map((d) => d.data()));
}

class TournamentInscriptionsRepository {
  TournamentInscriptionsRepository(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _inscriptions =>
      _firestore.collection(NexagoArtifactsPaths.inscriptionsCollection());

  Stream<TournamentCategoryEnrollmentCounts> watchEnrollmentCountsByCategory(
    String tournamentId,
  ) {
    final id = tournamentId.trim();
    if (id.isEmpty) return Stream.value(const {});

    return _inscriptions
        .where('tournamentId', isEqualTo: id)
        .snapshots()
        .map((snap) => countInscriptionsByCategory(snap.docs));
  }
}

final tournamentInscriptionsRepositoryProvider =
    Provider<TournamentInscriptionsRepository>((ref) {
  return TournamentInscriptionsRepository(ref.watch(firestoreProvider));
});

final tournamentCategoryEnrollmentCountsProvider = StreamProvider.autoDispose
    .family<TournamentCategoryEnrollmentCounts, String>((ref, tournamentId) {
  return ref
      .watch(tournamentInscriptionsRepositoryProvider)
      .watchEnrollmentCountsByCategory(tournamentId);
});

/// Inscrições confirmadas na coleção para a categoria (`categoryId` / `categoryName`).
int inscriptionCountForCategory(
  TournamentCategoryEnrollmentCounts counts,
  String categoryId,
) {
  final key = categoryId.trim();
  if (key.isEmpty) return 0;
  return counts[key] ?? 0;
}
