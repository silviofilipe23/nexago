import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/firebase/firebase_providers.dart';
import '../../tournaments/data/nexago_artifacts_paths.dart';
import '../domain/ranking_logic.dart';
import '../domain/ranking_models.dart';

class RankingRepositoryException implements Exception {
  RankingRepositoryException(this.message, {this.code});

  final String message;
  final String? code;

  @override
  String toString() => message;
}

class RankingRepository {
  RankingRepository(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _athleteRankings =>
      _firestore.collection(NexagoArtifactsPaths.athleteRankingsCollection());

  CollectionReference<Map<String, dynamic>> get _teamRankings =>
      _firestore.collection(NexagoArtifactsPaths.teamRankingsCollection());

  CollectionReference<Map<String, dynamic>> get _categoryResults =>
      _firestore.collection(
        NexagoArtifactsPaths.tournamentCategoryResultsCollection(),
      );

  CollectionReference<Map<String, dynamic>> get _teams =>
      _firestore.collection(NexagoArtifactsPaths.teamsCollection());

  Future<List<TournamentCategoryResult>> getResultsByYear(int year) async {
    try {
      var snap =
          await _categoryResults.where('year', isEqualTo: year).get();
      if (snap.docs.isEmpty) {
        snap = await _categoryResults
            .where('year', isEqualTo: year.toString())
            .get();
      }
      return snap.docs.map(TournamentCategoryResult.fromFirestore).toList();
    } on FirebaseException catch (e) {
      if (e.code == 'failed-precondition') {
        throw RankingRepositoryException(
          'Índice Firestore ausente para consulta por ano. '
          'Execute o deploy de índices.',
          code: e.code,
        );
      }
      rethrow;
    }
  }

  Future<RankingTeamPlayers?> getTeamById(String teamId) async {
    final id = teamId.trim();
    if (id.isEmpty) return null;
    final snap = await _teams.doc(id).get();
    if (!snap.exists) return null;
    final data = snap.data() ?? {};
    final rawSize = data['teamSize'];
    final rawMembers = data['memberUids'];
    return RankingTeamPlayers(
      teamId: id,
      player1Id: _readStr(data['player1Id']),
      player2Id: _readStr(data['player2Id']),
      teamName: _readStr(data['teamName']),
      gender: _readStr(data['gender']),
      teamSize: rawSize is num && rawSize >= 3 ? rawSize.toInt() : null,
      memberUids: rawMembers is List
          ? [
              for (final uid in rawMembers)
                if (uid is String && uid.trim().isNotEmpty) uid.trim(),
            ]
          : const [],
    );
  }

  Future<List<AthleteRankingRow>> loadAthleteRankingByYear(int year) async {
    final results = await getResultsByYear(year);
    if (results.isEmpty) return const [];

    final teamIds =
        results.map((r) => r.teamId).where((id) => id.isNotEmpty).toSet();
    final teamPlayers = await _loadTeamsMap(teamIds);

    final pointsByAthlete = <String, List<int>>{};
    for (final result in results) {
      final pts = result.pointsEarned;
      final players = teamPlayers[result.teamId];
      if (players == null) continue;
      for (final uid in [players.player1Id, players.player2Id]) {
        if (uid == null || uid.isEmpty) continue;
        pointsByAthlete.putIfAbsent(uid, () => []).add(pts);
      }
    }

    return buildAthleteRankingRowsFromPointsByAthlete(
      pointsByAthlete,
      year: year,
    );
  }

  Future<List<TeamRankingRow>> loadTeamRankingByYear(int year) async {
    final results = await getResultsByYear(year);
    if (results.isEmpty) return const [];

    final pointsByTeam = <String, List<int>>{};
    for (final result in results) {
      if (result.teamId.isEmpty) continue;
      pointsByTeam
          .putIfAbsent(result.teamId, () => [])
          .add(result.pointsEarned);
    }

    return buildTeamRankingRowsFromPointsByTeam(
      pointsByTeam,
      year: year,
    );
  }

  Future<AthleteRankingEntry?> getAthleteRankingEntry(String athleteId) async {
    final id = athleteId.trim();
    if (id.isEmpty) return null;
    final snap = await _athleteRankings.doc(id).get();
    if (!snap.exists) return null;
    return AthleteRankingEntry.fromFirestore(snap);
  }

  Future<List<AthleteRankingRow>> loadAthleteRankingGeneral() async {
    try {
      final snap = await _athleteRankings.get();
      final entries =
          snap.docs.map(AthleteRankingEntry.fromFirestore).toList();
      return buildAthleteRankingRowsFromEntries(entries);
    } on FirebaseException catch (e) {
      final isPermission = e.code == 'permission-denied' ||
          (e.message?.toLowerCase().contains('permission') ?? false);
      if (isPermission) {
        return loadAthleteRankingByYear(DateTime.now().year);
      }
      rethrow;
    }
  }

  Future<List<TeamRankingRow>> loadTeamRankingGeneral() async {
    try {
      final snap = await _teamRankings.get();
      final entries = snap.docs.map(TeamRankingEntry.fromFirestore).toList();
      return buildTeamRankingRowsFromEntries(entries);
    } on FirebaseException catch (e) {
      final isPermission = e.code == 'permission-denied' ||
          (e.message?.toLowerCase().contains('permission') ?? false);
      if (isPermission) {
        return loadTeamRankingByYear(DateTime.now().year);
      }
      rethrow;
    }
  }

  Future<List<AthleteRankingRow>> loadAthleteRanking({int? year}) async {
    if (year != null) {
      return loadAthleteRankingByYear(year);
    }
    return loadAthleteRankingGeneral();
  }

  Future<List<TeamRankingRow>> loadTeamRanking({int? year}) async {
    if (year != null) {
      return loadTeamRankingByYear(year);
    }
    return loadTeamRankingGeneral();
  }

  Future<AthleteRankingRow?> getAthleteRank(
    String athleteId, {
    int? year,
  }) async {
    final id = athleteId.trim();
    if (id.isEmpty) return null;
    final rows = await loadAthleteRanking(year: year);
    return rows.where((row) => row.athleteId == id).firstOrNull;
  }

  Future<Map<String, RankingTeamPlayers>> loadTeamsMap(
    Iterable<String> teamIds,
  ) =>
      _loadTeamsMap(teamIds);

  Future<Map<String, RankingTeamPlayers>> _loadTeamsMap(
    Iterable<String> teamIds,
  ) async {
    final unique = teamIds.where((id) => id.trim().isNotEmpty).toSet();
    final result = <String, RankingTeamPlayers>{};
    await Future.wait(
      unique.map((teamId) async {
        final team = await getTeamById(teamId);
        if (team != null) {
          result[teamId] = team;
        }
      }),
    );
    return result;
  }

  static String? _readStr(dynamic value) {
    if (value is! String) return null;
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }
}

final rankingRepositoryProvider = Provider<RankingRepository>((ref) {
  return RankingRepository(ref.watch(firestoreProvider));
});
