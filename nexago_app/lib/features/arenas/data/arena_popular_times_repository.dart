import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/arena_popular_times.dart';

/// Lê `arenaPopularTimes/{arenaId}` (leitura pública; quem grava é a agendada
/// `refreshArenaPopularTimes`).
class ArenaPopularTimesRepository {
  ArenaPopularTimesRepository(this._firestore);

  final FirebaseFirestore _firestore;

  /// `null` enquanto a arena não tem resumo.
  Stream<ArenaPopularTimes?> watch(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) return Stream.value(null);
    return _firestore
        .collection('arenaPopularTimes')
        .doc(id)
        .snapshots()
        .map((snap) {
      final data = snap.data();
      return data == null ? null : ArenaPopularTimes.fromMap(data);
    });
  }
}
