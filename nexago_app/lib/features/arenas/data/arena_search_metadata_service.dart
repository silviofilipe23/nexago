import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/arena_court.dart';
import '../domain/arena_search_metadata.dart';

/// Mantém `courtTypes`, `surfaces` e preço mínimo alinhados à busca do atleta.
class ArenaSearchMetadataService {
  ArenaSearchMetadataService(this._firestore);

  final FirebaseFirestore _firestore;

  Future<List<String>> courtTypeLabelsFromCourts(String arenaId) async {
    final snap = await _firestore
        .collection('arenas')
        .doc(arenaId.trim())
        .collection('courts')
        .get();
    final labels = <String>[];
    for (final doc in snap.docs) {
      labels.addAll(ArenaCourt.sportTypesFromFirestore(doc.data()));
    }
    return ArenaSearchMetadata.uniqueLabels(labels);
  }

  /// Após CRUD de quadra: une esportes do perfil + tipos das quadras; atualiza preço mínimo.
  Future<void> syncFromCourts({
    required String arenaId,
    List<String>? profileSports,
    List<String>? surfaces,
  }) async {
    final id = arenaId.trim();
    if (id.isEmpty) return;

    final arenaRef = _firestore.collection('arenas').doc(id);
    final arenaSnap = await arenaRef.get();
    final data = arenaSnap.data() ?? {};

    final existing = ArenaSearchMetadata.splitCourtTypes(
      _readStringList(data['courtTypes']),
      surfacesFromDoc: _readStringList(data['surfaces']),
    );

    final sports = profileSports ?? existing.sports;
    final surfaceList = surfaces ?? existing.surfaces;
    final fromCourts = await courtTypeLabelsFromCourts(id);
    final courtTypes = ArenaSearchMetadata.mergeSportLabels(
      profileSports: sports,
      courtTypeLabels: fromCourts,
    );

    final minPrice = await _minCourtPrice(id);
    final patch = <String, dynamic>{
      'courtTypes': courtTypes,
      'surfaces': surfaceList,
      'searchMetadataUpdatedAt': FieldValue.serverTimestamp(),
    };
    if (minPrice != null) {
      patch['pricePerHourReais'] = minPrice;
      patch['basePriceReais'] = minPrice;
    }

    await arenaRef.set(patch, SetOptions(merge: true));
  }

  Future<double?> _minCourtPrice(String arenaId) async {
    final snap = await _firestore
        .collection('arenas')
        .doc(arenaId)
        .collection('courts')
        .get();
    double? min;
    for (final doc in snap.docs) {
      final d = doc.data();
      final p = (d['basePricePerHourReais'] as num?)?.toDouble() ??
          (d['basePriceReais'] as num?)?.toDouble();
      if (p == null || p <= 0) continue;
      if (min == null || p < min) min = p;
    }
    return min;
  }

  static List<String> _readStringList(dynamic raw) {
    if (raw is! List) return const [];
    final out = <String>[];
    for (final e in raw) {
      if (e is String && e.trim().isNotEmpty) out.add(e.trim());
    }
    return out;
  }
}
