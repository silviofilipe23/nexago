import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/search/search_keywords.dart';
import 'package:nexago_app/core/firebase/firebase_providers.dart';
import '../../athlete/domain/athlete_profile.dart';
import '../../ranking/data/ranking_repository.dart';
import '../../ranking/domain/ranking_models.dart';
import '../domain/team_discover_logic.dart';
import '../domain/team_discover_models.dart';
import '../domain/tournament_team.dart';
import 'nexago_artifacts_paths.dart';

class TeamDiscoverRepository {
  TeamDiscoverRepository({
    required FirebaseFirestore firestore,
    required RankingRepository rankingRepository,
  })  : _teams = firestore.collection(NexagoArtifactsPaths.teamsCollection()),
        _users = firestore.collection('public_profiles'),
        _rankingRepository = rankingRepository;

  final CollectionReference<Map<String, dynamic>> _teams;
  final CollectionReference<Map<String, dynamic>> _users;
  final RankingRepository _rankingRepository;

  static const pageSize = 30;

  final _rankingCache = <String, TeamDiscoverRankingSnapshot>{};
  Future<List<TeamRankingRow>>? _generalTeamRanking;

  Future<AthleteProfile?> _profileFor(String uid) async {
    final id = uid.trim();
    if (id.isEmpty) return null;
    final snap = await _users.doc(id).get();
    if (!snap.exists) return null;
    return AthleteProfile.fromFirestore(snap);
  }

  Future<List<TournamentTeam>> searchTeamsByKeywords(
    String term, {
    int max = 25,
  }) async {
    final token = normalizeSearchTerm(term);
    if (!isSearchTermLongEnough(term)) return [];

    try {
      final snap = await _teams
          .where('keywords', arrayContains: token)
          .where('registrationPaid', isEqualTo: true)
          .limit(max)
          .get();
      return snap.docs.map(TournamentTeam.fromFirestore).toList();
    } catch (e, stackTrace) {
      if (kDebugMode) {
        debugPrint('TeamDiscoverRepository.searchTeamsByKeywords failed: $e');
        debugPrint('$stackTrace');
      }
      return [];
    }
  }

  Future<TeamDiscoverPageResult> fetchPage({
    String? startAfterDocumentId,
    int limit = pageSize,
  }) async {
    // Só equipe com inscrição PAGA entra na listagem. A equipe nasce no aceite
    // do convite, antes de qualquer pagamento — sem este filtro o Descobrir
    // mostrava duplas que nunca pagaram e nunca jogaram, além das que sobraram
    // de inscrições canceladas. `registrationPaid` é carimbado só pelas Cloud
    // Functions, no instante em que a inscrição fecha.
    Query<Map<String, dynamic>> query = _teams
        .where('registrationPaid', isEqualTo: true)
        .orderBy(FieldPath.documentId)
        .limit(limit);

    if (startAfterDocumentId != null &&
        startAfterDocumentId.trim().isNotEmpty) {
      query = query.startAfter([startAfterDocumentId.trim()]);
    }

    final snap = await query.get();
    final teams = snap.docs.map(TournamentTeam.fromFirestore).toList();
    final lastId = snap.docs.isEmpty ? null : snap.docs.last.id;
    final hasMore = snap.docs.length >= limit;

    return TeamDiscoverPageResult(
      teams: teams,
      lastDocumentId: lastId,
      hasMore: hasMore,
    );
  }

  /// Posições do ranking geral com pontos, na ordem. Cacheado até
  /// [clearCaches]; também abastece [_rankingCache] pra não reler cada doc.
  Future<List<TeamRankingRow>> _rankedRows() => _generalTeamRanking ??=
          _rankingRepository.loadTeamRankingGeneral().then((all) {
        final rows = all.where((r) => r.totalPoints > 0).toList();
        for (final r in rows) {
          _rankingCache[r.teamId] = TeamDiscoverRankingSnapshot(
            rank: r.rank,
            points: r.totalPoints,
            tournamentsCount: r.tournamentsCount,
          );
        }
        return rows;
      }).catchError((Object e) {
        _generalTeamRanking = null;
        throw e;
      });

  /// Página ordenada pelo ranking, paginada de ponta a ponta: equipes com
  /// pontos na ordem do ranking e, esgotadas, as sem pontos por id. Só
  /// equipes com inscrição paga entram; ids do ranking sem equipe paga são
  /// pulados (a página pode vir menor que [limit], nunca vazia com mais).
  Future<TeamDiscoverRankedPage> fetchRankedPage({
    int rankedOffset = 0,
    String? startAfterDocumentId,
    int limit = pageSize,
  }) async {
    final rows = await _rankedRows();
    var offset = rankedOffset;
    var cursor = startAfterDocumentId;
    final collected = <TournamentTeam>[];

    while (offset < rows.length && collected.isEmpty) {
      final end = min(offset + limit, rows.length);
      final ids = [for (final r in rows.sublist(offset, end)) r.teamId];
      offset = end;
      final snap = await _teams
          .where(FieldPath.documentId, whereIn: ids)
          .where('registrationPaid', isEqualTo: true)
          .get();
      final byId = {
        for (final doc in snap.docs) doc.id: TournamentTeam.fromFirestore(doc),
      };
      collected.addAll([
        for (final id in ids)
          if (byId[id] != null) byId[id]!,
      ]);
    }
    if (collected.isNotEmpty || offset < rows.length) {
      return TeamDiscoverRankedPage(
        teams: collected,
        nextRankedOffset: offset,
        lastDocumentId: cursor,
        hasMore: true,
      );
    }

    // Fase 2: sem pontos, por id, ignorando as já listadas na fase 1.
    final ranked = {for (final r in rows) r.teamId};
    var hasMore = true;
    while (collected.isEmpty && hasMore) {
      final page = await fetchPage(startAfterDocumentId: cursor, limit: limit);
      cursor = page.lastDocumentId;
      hasMore = page.hasMore;
      collected.addAll(page.teams.where((t) => !ranked.contains(t.id)));
    }
    return TeamDiscoverRankedPage(
      teams: collected,
      nextRankedOffset: offset,
      lastDocumentId: cursor,
      hasMore: hasMore,
    );
  }

  /// Posição e pontos vêm do ranking geral (uma leitura da coleção, em cache),
  /// não de um doc por equipe.
  Future<TeamDiscoverRankingSnapshot> rankingFor(String teamId) async {
    await _rankedRows();
    return _rankingCache[teamId] ?? const TeamDiscoverRankingSnapshot();
  }

  Future<List<TeamDiscoverEntry>> enrichEntries({
    required List<TournamentTeam> teams,
    required String? currentUserId,
    Set<String> followingTeamIds = const {},
  }) async {
    return Future.wait([
      for (final team in teams)
        _enrichOne(
          team: team,
          currentUserId: currentUserId,
          followingTeamIds: followingTeamIds,
        ),
    ]);
  }

  Future<TeamDiscoverEntry> _enrichOne({
    required TournamentTeam team,
    required String? currentUserId,
    required Set<String> followingTeamIds,
  }) async {
    final results = await Future.wait([
      _profileFor(team.player1Id),
      team.isLookingForPartner
          ? Future<AthleteProfile?>.value(null)
          : _profileFor(team.player2Id),
      rankingFor(team.id),
    ]);
    final isCurrent = currentUserId != null &&
        currentUserId.isNotEmpty &&
        team.containsPlayer(currentUserId);
    return buildTeamDiscoverEntry(
      team: team,
      player1: results[0] as AthleteProfile?,
      player2: results[1] as AthleteProfile?,
      ranking: results[2] as TeamDiscoverRankingSnapshot,
      isFollowing: followingTeamIds.contains(team.id),
      isCurrentUserTeam: isCurrent,
    );
  }

  Future<int?> viewerTeamPoints(String? currentUserId) async {
    final uid = currentUserId?.trim();
    if (uid == null || uid.isEmpty) return null;
    final results = await Future.wait([
      _teams
          .where('player1Id', isEqualTo: uid)
          .where('registrationPaid', isEqualTo: true)
          .limit(5)
          .get(),
      _teams
          .where('player2Id', isEqualTo: uid)
          .where('registrationPaid', isEqualTo: true)
          .limit(5)
          .get(),
    ]);
    String? teamId;
    for (final snap in results) {
      for (final doc in snap.docs) {
        final team = TournamentTeam.fromFirestore(doc);
        if (!team.isLookingForPartner) {
          teamId = team.id;
          break;
        }
      }
      if (teamId != null) break;
    }
    if (teamId == null) return null;
    final ranking = await rankingFor(teamId);
    return ranking.points > 0 ? ranking.points : null;
  }

  void clearCaches() {
    _rankingCache.clear();
    _generalTeamRanking = null;
  }

  /// Preview aleatório para o Compete Hub (amostra do pool paginado).
  Future<List<TeamDiscoverEntry>> fetchRandomPreview({
    required String? currentUserId,
    Set<String> followingTeamIds = const {},
    int samplePoolSize = pageSize,
    int previewCount = 5,
    Random? random,
  }) async {
    final page = await fetchPage(limit: samplePoolSize);
    final picked = pickRandomTeamsForHubPreview(
      page.teams,
      count: previewCount,
      random: random,
    );
    if (picked.isEmpty) return const [];
    return enrichEntries(
      teams: picked,
      currentUserId: currentUserId,
      followingTeamIds: followingTeamIds,
    );
  }
}

final teamDiscoverRepositoryProvider = Provider<TeamDiscoverRepository>((ref) {
  return TeamDiscoverRepository(
    firestore: ref.watch(firestoreProvider),
    rankingRepository: ref.watch(rankingRepositoryProvider),
  );
});
