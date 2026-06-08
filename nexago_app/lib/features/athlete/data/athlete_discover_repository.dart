import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/search/search_keywords.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../../ranking/data/ranking_repository.dart';
import '../../ranking/domain/ranking_models.dart';
import '../../tournaments/data/users_repository.dart';
import 'athlete_follow_service.dart';
import '../domain/athlete_discover_logic.dart';
import '../domain/athlete_follow_providers.dart';
import '../domain/athlete_discover_models.dart';
import '../domain/athlete_profile.dart';
import '../domain/athlete_public_profile_models.dart';

class AthleteDiscoverRepository {
  AthleteDiscoverRepository({
    required FirebaseFirestore firestore,
    required RankingRepository rankingRepository,
    required UsersRepository usersRepository,
    required AthleteFollowService followService,
  })  : _users = firestore.collection('users'),
        _rankingRepository = rankingRepository,
        _usersRepository = usersRepository,
        _followService = followService;

  final CollectionReference<Map<String, dynamic>> _users;
  final RankingRepository _rankingRepository;
  final UsersRepository _usersRepository;
  final AthleteFollowService _followService;

  static const pageSize = 30;

  final _rankingCache = <String, AthletePublicRankingSnapshot>{};

  Future<AthleteDiscoverPageResult> fetchPage({
    String? startAfterDocumentId,
    int limit = pageSize,
  }) async {
    Query<Map<String, dynamic>> query = _users
        .where('role', isEqualTo: 'athlete')
        .orderBy(FieldPath.documentId)
        .limit(limit);

    if (startAfterDocumentId != null &&
        startAfterDocumentId.trim().isNotEmpty) {
      query = query.startAfter([startAfterDocumentId.trim()]);
    }

    final snap = await query.get();
    final profiles = <AthleteProfile>[];
    for (final doc in snap.docs) {
      final profile = AthleteProfile.fromFirestore(doc);
      if (isDiscoverableProfile(profile)) {
        profiles.add(profile);
      }
    }

    final lastId = snap.docs.isEmpty ? null : snap.docs.last.id;
    final hasMore = snap.docs.length >= limit;

    return AthleteDiscoverPageResult(
      profiles: profiles,
      lastDocumentId: lastId,
      hasMore: hasMore,
    );
  }

  Future<List<AthleteProfile>> searchProfiles(String term) async {
    final token = normalizeSearchTerm(term);
    if (!isSearchTermLongEnough(term)) return [];

    try {
      final snap = await _users
          .where('hasAthleteRole', isEqualTo: true)
          .where('keywords', arrayContains: token)
          .limit(25)
          .get();
      final profiles = <AthleteProfile>[];
      for (final doc in snap.docs) {
        final profile = AthleteProfile.fromFirestore(doc);
        if (isDiscoverableProfile(profile)) {
          profiles.add(profile);
        }
      }
      if (profiles.isNotEmpty) return profiles;
    } catch (e, stackTrace) {
      if (kDebugMode) {
        debugPrint('AthleteDiscoverRepository.searchProfiles keywords failed: $e');
        debugPrint('$stackTrace');
      }
    }

    final results = await _usersRepository.searchUsersByNicknameOrName(
      term,
      max: 25,
      roleFilter: 'athlete',
    );
    final profiles = <AthleteProfile>[];
    for (final user in results) {
      final snap = await _users.doc(user.uid).get();
      if (!snap.exists) continue;
      final profile = AthleteProfile.fromFirestore(snap);
      if (isDiscoverableProfile(profile)) {
        profiles.add(profile);
      }
    }
    return profiles;
  }

  Future<AthletePublicRankingSnapshot> rankingFor(String athleteId) async {
    final cached = _rankingCache[athleteId];
    if (cached != null) return cached;

    final row = await _rankingRepository.getAthleteRank(athleteId);
    final snapshot = row == null
        ? const AthletePublicRankingSnapshot()
        : AthletePublicRankingSnapshot(
            rank: row.rank,
            points: row.totalPoints,
            tournamentsCount: row.tournamentsCount,
          );
    _rankingCache[athleteId] = snapshot;
    return snapshot;
  }

  AthletePublicRankingSnapshot _rankingFromGeneralRow(
    Map<String, AthleteRankingRow> generalByAthleteId,
    String athleteId,
  ) {
    final row = generalByAthleteId[athleteId];
    if (row == null) return const AthletePublicRankingSnapshot();
    return AthletePublicRankingSnapshot(
      rank: row.rank,
      points: row.totalPoints,
      tournamentsCount: row.tournamentsCount,
    );
  }

  Future<List<AthleteDiscoverEntry>> enrichEntries({
    required List<AthleteProfile> profiles,
    required String? currentUserId,
    Set<String> followingIds = const {},
  }) async {
    final profileIds = profiles.map((profile) => profile.id).toList();
    final generalRows = await _rankingRepository.loadAthleteRankingGeneral();
    final generalByAthleteId = {
      for (final row in generalRows) row.athleteId: row,
    };
    final followerIdsByAthlete =
        await _followService.fetchFollowerIdsForAthletes(profileIds);
    final hasViewer = currentUserId != null && currentUserId.trim().isNotEmpty;

    final entries = <AthleteDiscoverEntry>[];
    for (final profile in profiles) {
      final ranking = _rankingFromGeneralRow(generalByAthleteId, profile.id);
      _rankingCache[profile.id] = ranking;
      final athleteFollowerIds =
          followerIdsByAthlete[profile.id] ?? const <String>{};
      final isCurrentUser = hasViewer && profile.id == currentUserId;
      entries.add(
        buildDiscoverEntry(
          profile: profile,
          ranking: ranking,
          isFollowing: followingIds.contains(profile.id),
          isCurrentUser: isCurrentUser,
          followersCount: athleteFollowerIds.length,
          mutualFollowersCount: hasViewer && !isCurrentUser
              ? _followService.countMutualFollowers(
                  viewerFollowingIds: followingIds,
                  athleteFollowerIds: athleteFollowerIds,
                )
              : null,
        ),
      );
    }
    return entries;
  }

  void clearRankingCache() => _rankingCache.clear();
}

final athleteDiscoverRepositoryProvider = Provider<AthleteDiscoverRepository>(
  (ref) {
    return AthleteDiscoverRepository(
      firestore: ref.watch(firestoreProvider),
      rankingRepository: ref.watch(rankingRepositoryProvider),
      usersRepository: ref.watch(usersRepositoryProvider),
      followService: ref.watch(athleteFollowServiceProvider),
    );
  },
);
