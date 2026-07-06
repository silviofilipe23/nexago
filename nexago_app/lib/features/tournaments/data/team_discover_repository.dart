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
        _teamRankings =
            firestore.collection(NexagoArtifactsPaths.teamRankingsCollection()),
        _users = firestore.collection('public_profiles'),
        _rankingRepository = rankingRepository;

  final CollectionReference<Map<String, dynamic>> _teams;
  final CollectionReference<Map<String, dynamic>> _teamRankings;
  final CollectionReference<Map<String, dynamic>> _users;
  final RankingRepository _rankingRepository;

  static const pageSize = 30;

  final _rankingCache = <String, TeamDiscoverRankingSnapshot>{};
  List<TeamRankingRow>? _generalTeamRanking;

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
    Query<Map<String, dynamic>> query =
        _teams.orderBy(FieldPath.documentId).limit(limit);

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

  Future<TeamDiscoverRankingSnapshot> rankingFor(String teamId) async {
    final cached = _rankingCache[teamId];
    if (cached != null) return cached;

    final snap = await _teamRankings.doc(teamId).get();
    TeamRankingEntry? entry;
    if (snap.exists) {
      entry = TeamRankingEntry.fromFirestore(snap);
    }

    var rank = 0;
    if (entry != null && entry.totalPoints > 0) {
      _generalTeamRanking ??=
          await _rankingRepository.loadTeamRankingGeneral();
      final idx =
          _generalTeamRanking!.indexWhere((r) => r.teamId == teamId);
      if (idx >= 0) rank = idx + 1;
    }

    final snapshot = TeamDiscoverRankingSnapshot(
      rank: rank > 0 ? rank : null,
      points: entry?.totalPoints ?? 0,
      tournamentsCount: entry?.tournamentsCount ?? 0,
    );
    _rankingCache[teamId] = snapshot;
    return snapshot;
  }

  Future<List<TeamDiscoverEntry>> enrichEntries({
    required List<TournamentTeam> teams,
    required String? currentUserId,
    Set<String> followingTeamIds = const {},
  }) async {
    final entries = <TeamDiscoverEntry>[];
    for (final team in teams) {
      final p1 = await _profileFor(team.player1Id);
      final p2 = team.isLookingForPartner
          ? null
          : await _profileFor(team.player2Id);
      final ranking = await rankingFor(team.id);
      final isCurrent = currentUserId != null &&
          currentUserId.isNotEmpty &&
          team.containsPlayer(currentUserId);
      entries.add(
        buildTeamDiscoverEntry(
          team: team,
          player1: p1,
          player2: p2,
          ranking: ranking,
          isFollowing: followingTeamIds.contains(team.id),
          isCurrentUserTeam: isCurrent,
        ),
      );
    }
    return entries;
  }

  Future<int?> viewerTeamPoints(String? currentUserId) async {
    final uid = currentUserId?.trim();
    if (uid == null || uid.isEmpty) return null;
    final results = await Future.wait([
      _teams.where('player1Id', isEqualTo: uid).limit(5).get(),
      _teams.where('player2Id', isEqualTo: uid).limit(5).get(),
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
