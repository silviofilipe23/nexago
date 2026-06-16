import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../../../core/search/search_keywords.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_listing_status.dart';
import 'league_document_mapper.dart';

class LeaguesRepository {
  LeaguesRepository(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _collection =>
      _firestore.collection('leagues');

  Stream<List<DiscoveryLeague>> watchLeagues() {
    return _collection.snapshots().map((snap) {
      final items = snap.docs
          .map(LeagueDocumentMapper.fromSnapshot)
          .whereType<DiscoveryLeague>()
          .where((league) => isPubliclyListedLeague(league.listingStatus))
          .toList();
      items.sort(
        (a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()),
      );
      return items;
    });
  }

  Stream<DiscoveryLeague?> watchLeague(String id) {
    if (id.isEmpty) return Stream.value(null);
    return _collection.doc(id).snapshots().map(LeagueDocumentMapper.fromSnapshot);
  }

  /// Busca ligas por prefixo em `keywords`.
  Future<List<DiscoveryLeague>> searchByKeywords(
    String term, {
    int max = 40,
  }) async {
    final token = normalizeSearchTerm(term);
    if (!isSearchTermLongEnough(term)) return [];

    try {
      final snap = await _collection
          .where('keywords', arrayContains: token)
          .limit(max)
          .get();
      final items = snap.docs
          .map(LeagueDocumentMapper.fromSnapshot)
          .whereType<DiscoveryLeague>()
          .where((league) => isPubliclyListedLeague(league.listingStatus))
          .toList();
      items.sort(
        (a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()),
      );
      return items;
    } catch (e, stackTrace) {
      if (kDebugMode) {
        debugPrint('LeaguesRepository.searchByKeywords failed: $e');
        debugPrint('$stackTrace');
      }
      return [];
    }
  }
}
