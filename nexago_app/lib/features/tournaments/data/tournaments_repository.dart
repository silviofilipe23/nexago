import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../../../core/search/search_keywords.dart';
import '../domain/tournament_detail_model.dart';
import '../domain/tournament_discovery_helpers.dart';
import '../domain/tournament_discovery_models.dart';
import 'nexago_artifacts_paths.dart';
import 'tournament_document_mapper.dart';
import '../domain/tournament_listing_status.dart';

class TournamentsRepository {
  TournamentsRepository(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _root =>
      _firestore.collection('tournaments');

  Stream<List<DiscoveryTournament>> watchDiscoveryTournaments() {
    return _root.snapshots().map((snap) {
      final items = <DiscoveryTournament>[];
      for (final doc in snap.docs) {
        final data = doc.data();
        final raw =
            (data['listingStatus'] as String?) ?? (data['status'] as String?);
        if (!isPubliclyListedTournament(raw)) continue;
        final item = TournamentDocumentMapper.fromSnapshot(doc);
        if (item != null) items.add(item);
      }
      items.sort(compareDiscoveryTournamentsByDateProximity);
      return items;
    });
  }

  Stream<DiscoveryTournament?> watchTournament(String id) {
    return watchTournamentDetail(id).map((d) => d?.toDiscovery());
  }

  Stream<TournamentDetail?> watchTournamentDetail(String id) {
    if (id.isEmpty) return Stream.value(null);
    return _root.doc(id).snapshots().asyncMap((doc) async {
      if (doc.exists) {
        return TournamentDocumentMapper.detailFromSnapshot(doc);
      }
      final legacy = await _firestore
          .doc(NexagoArtifactsPaths.legacyTournamentDoc(id))
          .get();
      return TournamentDocumentMapper.detailFromSnapshot(legacy);
    });
  }

  Future<Map<String, String>> getTournamentNames(Set<String> ids) async {
    if (ids.isEmpty) return {};
    final names = <String, String>{};
    for (final id in ids) {
      if (id.trim().isEmpty) continue;
      var doc = await _root.doc(id).get();
      if (!doc.exists) {
        doc = await _firestore
            .doc(NexagoArtifactsPaths.legacyTournamentDoc(id))
            .get();
      }
      final detail = TournamentDocumentMapper.detailFromSnapshot(doc);
      if (detail != null) names[id] = detail.name;
    }
    return names;
  }

  /// Busca torneios por prefixo em `keywords` (coleção raiz + legado).
  Future<List<DiscoveryTournament>> searchByKeywords(
    String term, {
    int max = 40,
  }) async {
    final token = normalizeSearchTerm(term);
    if (!isSearchTermLongEnough(term)) return [];

    final byId = <String, DiscoveryTournament>{};

    Future<void> mergeQuery(Query<Map<String, dynamic>> query) async {
      try {
        final snap = await query.limit(max).get();
        for (final doc in snap.docs) {
          final data = doc.data();
          final raw =
              (data['listingStatus'] as String?) ?? (data['status'] as String?);
          if (!isPubliclyListedTournament(raw)) continue;
          final item = TournamentDocumentMapper.fromSnapshot(doc);
          if (item != null) byId[item.id] = item;
        }
      } catch (e, stackTrace) {
        if (kDebugMode) {
          debugPrint('TournamentsRepository.searchByKeywords failed: $e');
          debugPrint('$stackTrace');
        }
      }
    }

    await mergeQuery(
      _root.where('keywords', arrayContains: token),
    );
    await mergeQuery(
      _firestore
          .collection(
            '${NexagoArtifactsPaths.publicDataBase}/tournaments',
          )
          .where('keywords', arrayContains: token),
    );

    final items = byId.values.toList()
      ..sort(compareDiscoveryTournamentsByDateProximity);
    return items.take(max).toList();
  }

  Future<Map<String, TournamentDetail>> getTournamentDetails(Set<String> ids) async {
    if (ids.isEmpty) return {};
    final details = <String, TournamentDetail>{};
    for (final id in ids) {
      if (id.trim().isEmpty) continue;
      var doc = await _root.doc(id).get();
      if (!doc.exists) {
        doc = await _firestore
            .doc(NexagoArtifactsPaths.legacyTournamentDoc(id))
            .get();
      }
      final detail = TournamentDocumentMapper.detailFromSnapshot(doc);
      if (detail != null) details[id] = detail;
    }
    return details;
  }
}
