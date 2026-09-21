import 'package:cloud_firestore/cloud_firestore.dart';
import '../../athlete/domain/athlete_podiums.dart';
import '../../tournaments/domain/category_level_eligibility.dart';
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

  CollectionReference<Map<String, dynamic>> get _tournaments =>
      _firestore.collection('tournaments');

  Future<List<TournamentCategoryResult>> getResultsByYear(int year) async {
    try {
      var snap = await _categoryResults.where('year', isEqualTo: year).get();
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
    return RankingTeamPlayers.fromDoc(id, snap.data() ?? {});
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
      for (final uid in players.memberIds) {
        pointsByAthlete.putIfAbsent(uid, () => []).add(pts);
      }
    }

    return buildAthleteRankingRowsFromPointsByAthlete(
      pointsByAthlete,
      year: year,
    );
  }

  /// Pódios do atleta: toda colocação até [kPodiumMaxPlace] em torneios.
  ///
  /// Parte das EQUIPES do atleta em vez de varrer
  /// todos os resultados: pódio é raro, e ler a coleção inteira a cada abertura
  /// de perfil sairia caro sem necessidade. Resultados e torneios vão em lotes
  /// de 10 com `whereIn`, em paralelo.
  Future<List<AthletePodium>> loadAthletePodiums(String athleteId) async {
    final uid = athleteId.trim();
    if (uid.isEmpty) return const [];

    final teamIds = await _teamIdsForAthlete(uid);
    if (teamIds.isEmpty) return const [];

    final resultSnaps = await Future.wait(
      _chunks(teamIds).map(
        (chunk) => _categoryResults.where('teamId', whereIn: chunk).get(),
      ),
    );

    final podiumResults = <TournamentCategoryResult>[];
    for (final snap in resultSnaps) {
      for (final doc in snap.docs) {
        final r = TournamentCategoryResult.fromFirestore(doc);
        if (isPodiumPlace(r.finalPlace)) podiumResults.add(r);
      }
    }
    if (podiumResults.isEmpty) return const [];

    final info = await _loadTournamentInfo(
      podiumResults
          .map((r) => r.tournamentId)
          .where((i) => i.isNotEmpty)
          .toSet(),
    );

    return sortPodiumsForDisplay([
      for (final r in podiumResults)
        AthletePodium(
          tournamentId: r.tournamentId,
          // Torneio apagado ainda tem resultado: o pódio não some, só fica sem
          // nome bonito.
          tournamentName: info[r.tournamentId]?.name ?? 'Torneio',
          place: r.finalPlace,
          year: r.year,
          sportCode: info[r.tournamentId]?.sportCode,
          completedAt: r.completedAt,
        ),
    ]);
  }

  /// Equipes de que o atleta participa, por QUALQUER um dos três caminhos.
  ///
  /// Dupla NÃO grava `memberUids` — esse campo só existe nas equipes nomeadas
  /// (trio/quarteto/quinteto). Dupla tem `player1Id`/`player2Id`. Consultar só
  /// `memberUids` perdia toda dupla, que é justamente o formato do vôlei de
  /// praia e do beach tennis. É a mesma união que `RankingTeamPlayers.memberIds`
  /// faz do outro lado, e `extractTeamMemberUids` nas functions.
  Future<List<String>> _teamIdsForAthlete(String uid) async {
    final snaps = await Future.wait([
      _teams.where('memberUids', arrayContains: uid).get(),
      _teams.where('player1Id', isEqualTo: uid).get(),
      _teams.where('player2Id', isEqualTo: uid).get(),
    ]);

    // Set: equipe nomeada aparece em memberUids E em player1/player2.
    final ids = <String>{};
    for (final snap in snaps) {
      for (final doc in snap.docs) {
        ids.add(doc.id);
      }
    }
    return ids.toList();
  }

  /// Nome e esporte dos torneios, em lotes de 10.
  Future<Map<String, ({String name, String? sportCode})>> _loadTournamentInfo(
    Set<String> ids,
  ) async {
    if (ids.isEmpty) return const {};

    final snaps = await Future.wait(
      _chunks(ids.toList()).map(
        (chunk) =>
            _tournaments.where(FieldPath.documentId, whereIn: chunk).get(),
      ),
    );

    final out = <String, ({String name, String? sportCode})>{};
    for (final snap in snaps) {
      for (final doc in snap.docs) {
        final data = doc.data();
        out[doc.id] = (
          name: (data['name'] as String?)?.trim().isNotEmpty == true
              ? (data['name'] as String).trim()
              : 'Torneio',
          sportCode: CategoryLevelEligibility.tournamentSportToLevelSportCode(
            data['sport'] as String?,
          ),
        );
      }
    }
    return out;
  }

  /// `whereIn` aceita no máximo 10 valores por consulta.
  static List<List<String>> _chunks(List<String> ids) {
    final out = <List<String>>[];
    for (var i = 0; i < ids.length; i += 10) {
      out.add(ids.sublist(i, i + 10 > ids.length ? ids.length : i + 10));
    }
    return out;
  }

  /// Ranking individual POR MODALIDADE, no formato `{código do esporte: linhas}`.
  ///
  /// O ranking normal é um só, global: os resultados carregam `tournamentId`,
  /// mas não o esporte. A modalidade mora em `tournaments/{id}.sport`, então é
  /// preciso juntar resultado → torneio para poder separar os baldes.
  ///
  /// A leitura dos torneios vai em lotes de 10 com `documentId whereIn`, em
  /// paralelo — mesmo padrão de `UsersRepository`. Um `get()` por torneio
  /// transformaria uma tela em dezenas de idas ao Firestore.
  ///
  /// Só existe POR ANO. O ranking geral sai de `athleteRankings`, uma coleção
  /// pré-calculada que também não tem esporte; separar por modalidade exige os
  /// resultados crus, e esses só são consultáveis por ano.
  Future<Map<String, List<AthleteRankingRow>>> loadAthleteRankingBySport({
    required int year,
  }) async {
    final results = await getResultsByYear(year);
    if (results.isEmpty) return const {};

    final sportByTournament = await _loadSportByTournament(
      results.map((r) => r.tournamentId).where((id) => id.isNotEmpty).toSet(),
    );
    if (sportByTournament.isEmpty) return const {};

    final teamPlayers = await _loadTeamsMap(
      results.map((r) => r.teamId).where((id) => id.isNotEmpty).toSet(),
    );

    // {esporte: {atleta: [pontos]}}
    final bySport = <String, Map<String, List<int>>>{};
    for (final result in results) {
      final sport = sportByTournament[result.tournamentId];
      if (sport == null) continue;
      final players = teamPlayers[result.teamId];
      if (players == null) continue;
      final bucket = bySport.putIfAbsent(sport, () => <String, List<int>>{});
      for (final uid in players.memberIds) {
        bucket.putIfAbsent(uid, () => []).add(result.pointsEarned);
      }
    }

    return {
      for (final entry in bySport.entries)
        entry.key: buildAthleteRankingRowsFromPointsByAthlete(
          entry.value,
          year: year,
        ),
    };
  }

  /// `{tournamentId: código de esporte do perfil}`. Torneio sem esporte
  /// reconhecido fica de fora — melhor não contar do que contar no balde errado.
  Future<Map<String, String>> _loadSportByTournament(Set<String> ids) async {
    if (ids.isEmpty) return const {};

    final chunks = <List<String>>[];
    final all = ids.toList();
    for (var i = 0; i < all.length; i += 10) {
      chunks.add(all.sublist(i, i + 10 > all.length ? all.length : i + 10));
    }

    final snaps = await Future.wait(
      chunks.map(
        (chunk) =>
            _tournaments.where(FieldPath.documentId, whereIn: chunk).get(),
      ),
    );

    final out = <String, String>{};
    for (final snap in snaps) {
      for (final doc in snap.docs) {
        final raw = doc.data()['sport'] as String?;
        final code = CategoryLevelEligibility.tournamentSportToLevelSportCode(
          raw,
        );
        if (code != null && code.isNotEmpty) out[doc.id] = code;
      }
    }
    return out;
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
      final entries = snap.docs.map(AthleteRankingEntry.fromFirestore).toList();
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
}

final rankingRepositoryProvider = Provider<RankingRepository>((ref) {
  return RankingRepository(ref.watch(firestoreProvider));
});
