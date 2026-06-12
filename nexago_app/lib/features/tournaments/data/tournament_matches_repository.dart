import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/tournament_match.dart';
import '../domain/tournament_match_point_event.dart';
import 'nexago_artifacts_paths.dart';
import 'tournament_match_mapper.dart';
import 'tournament_match_point_event_mapper.dart';

/// Lê partidas em `artifacts/.../matches` filtradas por `tournamentId`.
///
/// Índice recomendado: `tournamentId` (ver `firestore.indexes.json` no volley-track-app).
class TournamentMatchesRepository {
  TournamentMatchesRepository(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _matches =>
      _firestore.collection(NexagoArtifactsPaths.matchesCollection());

  Stream<List<TournamentMatch>> watchByTournament(String tournamentId) {
    if (tournamentId.isEmpty) return Stream.value(const []);

    return _matches
        .where('tournamentId', isEqualTo: tournamentId)
        .snapshots()
        .map(_mapAndSort);
  }

  Stream<List<TournamentMatch>> watchByCategory(
    String tournamentId,
    String categoryName,
  ) {
    if (tournamentId.isEmpty || categoryName.isEmpty) {
      return Stream.value(const []);
    }

    return _matches
        .where('tournamentId', isEqualTo: tournamentId)
        .where('categoryId', isEqualTo: categoryName)
        .snapshots()
        .map(_mapAndSort);
  }

  Future<TournamentMatch?> getById(String matchId) async {
    if (matchId.trim().isEmpty) return null;
    final snap = await _matches.doc(matchId).get();
    return TournamentMatchMapper.fromSnapshot(snap);
  }

  Stream<TournamentMatch?> watchById(String matchId) {
    final id = matchId.trim();
    if (id.isEmpty) return Stream.value(null);
    return _matches
        .doc(id)
        .snapshots()
        .map(TournamentMatchMapper.fromSnapshot);
  }

  CollectionReference<Map<String, dynamic>> _pointEventsRef(String matchId) {
    return _firestore.collection(
      NexagoArtifactsPaths.matchPointEventsCollection(matchId),
    );
  }

  Future<List<TournamentMatchPointEvent>> getPointEvents(String matchId) async {
    final id = matchId.trim();
    if (id.isEmpty) return const [];

    final snap = await _pointEventsRef(id).orderBy('seq').get();
    return _mapPointEvents(snap.docs);
  }

  Stream<List<TournamentMatchPointEvent>> watchPointEvents(String matchId) {
    final id = matchId.trim();
    if (id.isEmpty) return Stream.value(const []);

    return _pointEventsRef(id)
        .orderBy('seq')
        .snapshots()
        .map((snap) => _mapPointEvents(snap.docs));
  }

  List<TournamentMatchPointEvent> _mapPointEvents(
    List<QueryDocumentSnapshot<Map<String, dynamic>>> docs,
  ) {
    return docs
        .map(TournamentMatchPointEventMapper.fromSnapshot)
        .whereType<TournamentMatchPointEvent>()
        .toList(growable: false);
  }

  Future<List<TournamentMatch>> getByTeamId(String teamId) async {
    if (teamId.trim().isEmpty) return [];

    final results = await Future.wait([
      _matches.where('teamAId', isEqualTo: teamId).get(),
      _matches.where('teamBId', isEqualTo: teamId).get(),
    ]);

    final byId = <String, TournamentMatch>{};
    for (final snap in results) {
      for (final doc in snap.docs) {
        final match = TournamentMatchMapper.fromSnapshot(doc);
        if (match != null) byId[match.id] = match;
      }
    }
    return _sortMatches(byId.values.toList());
  }

  Future<List<TournamentMatch>> getByTeamIds(Iterable<String> teamIds) async {
    final ids = teamIds.where((id) => id.trim().isNotEmpty).toSet();
    if (ids.isEmpty) return [];

    final byId = <String, TournamentMatch>{};
    final batches = await Future.wait(ids.map(getByTeamId));
    for (final list in batches) {
      for (final match in list) {
        byId[match.id] = match;
      }
    }
    return _sortMatches(byId.values.toList());
  }

  List<TournamentMatch> _mapAndSort(
    QuerySnapshot<Map<String, dynamic>> snap,
  ) {
    final items = snap.docs
        .map(TournamentMatchMapper.fromSnapshot)
        .whereType<TournamentMatch>()
        .toList();
    return _sortMatches(items);
  }

  List<TournamentMatch> _sortMatches(List<TournamentMatch> items) {
    items.sort((a, b) {
      final c = a.categoryId.compareTo(b.categoryId);
      if (c != 0) return c;
      final r = a.round.compareTo(b.round);
      if (r != 0) return r;
      return a.matchNumber.compareTo(b.matchNumber);
    });
    return items;
  }
}
