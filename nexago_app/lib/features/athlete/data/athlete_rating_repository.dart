import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/firebase/firebase_providers.dart';
import '../../tournaments/data/nexago_artifacts_paths.dart';
import '../domain/athlete_rating.dart';
import '../domain/level_points_history.dart';

/// Leitura de `athleteRatings/{athleteId}_{sportCode}` (estado da engine de
/// rating; escrita é exclusiva do backend).
class AthleteRatingRepository {
  AthleteRatingRepository(this._firestore, this._auth);

  final FirebaseFirestore _firestore;
  final FirebaseAuthProviderLike _auth;

  Stream<AthleteRating?> watchOwnRating(String sportCode) {
    final uid = _auth.currentUid;
    if (uid == null || uid.isEmpty) return Stream.value(null);
    return watchRating(athleteId: uid, sportCode: sportCode);
  }

  Stream<AthleteRating?> watchRating({
    required String athleteId,
    required String sportCode,
  }) {
    return _firestore
        .collection(NexagoArtifactsPaths.athleteRatingsCollection())
        .doc('${athleteId}_$sportCode')
        .snapshots()
        .map((doc) => doc.exists ? AthleteRating.fromFirestore(doc) : null);
  }

  /// Partidas rateadas do atleta logado no esporte, em ordem cronológica.
  /// Filtra esporte e ordena no cliente: `array-contains` sozinho não pede
  /// índice composto, e o ledger de um atleta é pequeno.
  Future<List<LevelPointsEntry>> loadOwnLevelPointsHistory(
    String sportCode,
  ) async {
    final uid = _auth.currentUid;
    if (uid == null || uid.isEmpty) return const [];
    final snap = await _firestore
        .collection(NexagoArtifactsPaths.ratingEventsCollection())
        .where('athleteIds', arrayContains: uid)
        .get();
    final entries = <LevelPointsEntry>[];
    for (final doc in snap.docs) {
      if (doc.data()['sportCode'] != sportCode) continue;
      final entry = levelPointsEntryFromEvent(doc.data(), uid);
      if (entry != null) entries.add(entry);
    }
    return entries..sort((a, b) => a.endedAt.compareTo(b.endedAt));
  }
}

/// Indireção mínima para injetar o uid atual sem acoplar no FirebaseAuth.
abstract interface class FirebaseAuthProviderLike {
  String? get currentUid;
}

class _FirebaseAuthUid implements FirebaseAuthProviderLike {
  _FirebaseAuthUid(this._read);

  final Ref _read;

  @override
  String? get currentUid =>
      _read.read(firebaseAuthProvider).currentUser?.uid.trim();
}

final athleteRatingRepositoryProvider = Provider<AthleteRatingRepository>((ref) {
  return AthleteRatingRepository(
    ref.watch(firestoreProvider),
    _FirebaseAuthUid(ref),
  );
});
