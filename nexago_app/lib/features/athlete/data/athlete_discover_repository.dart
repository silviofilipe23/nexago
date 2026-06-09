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
  static const maxDiscoverProfiles = 2000;

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

  /// Carrega todos os perfis discoverable paginando até esgotar ou [maxProfiles].
  Future<List<AthleteProfile>> fetchAllDiscoverableProfiles({
    int limit = pageSize,
    int maxProfiles = maxDiscoverProfiles,
  }) async {
    final all = <AthleteProfile>[];
    String? cursor;

    while (all.length < maxProfiles) {
      final page = await fetchPage(
        startAfterDocumentId: cursor,
        limit: limit,
      );
      all.addAll(page.profiles);
      if (!page.hasMore || page.lastDocumentId == null) break;
      cursor = page.lastDocumentId;
    }

    return all;
  }

  /// Pré-filtra no Firestore (gênero, esporte, procura dupla) e aplica o restante
  /// no cliente. Sem constraints de servidor, carrega o catálogo completo.
  Future<List<AthleteProfile>> fetchProfilesForDiscover(
    AthleteDiscoverFilters filters, {
    int maxProfiles = maxDiscoverProfiles,
  }) async {
    final constraints = discoverFirestoreConstraints(filters);
    if (constraints.isEmpty) {
      return fetchAllDiscoverableProfiles(maxProfiles: maxProfiles);
    }

    try {
      final profiles = await _fetchWithDiscoverConstraints(
        constraints,
        maxProfiles: maxProfiles,
      );
      if (profiles.isNotEmpty) return profiles;
    } catch (e, stackTrace) {
      if (kDebugMode) {
        debugPrint(
          'AthleteDiscoverRepository.fetchProfilesForDiscover failed: $e',
        );
        debugPrint('$stackTrace');
      }
    }

    return fetchAllDiscoverableProfiles(maxProfiles: maxProfiles);
  }

  Future<List<AthleteProfile>> _fetchWithDiscoverConstraints(
    DiscoverFirestoreConstraints constraints, {
    required int maxProfiles,
  }) async {
    if (constraints.sportFirestoreId != null) {
      return _fetchProfilesMatchingSport(constraints, maxProfiles: maxProfiles);
    }

    return _paginateDiscoverQuery(
      _buildDiscoverQuery(constraints),
      maxProfiles: maxProfiles,
    );
  }

  Future<List<AthleteProfile>> _fetchProfilesMatchingSport(
    DiscoverFirestoreConstraints constraints, {
    required int maxProfiles,
  }) async {
    final sportId = constraints.sportFirestoreId!;
    final byId = <String, AthleteProfile>{};

    Future<void> mergeFromQuery(Query<Map<String, dynamic>> query) async {
      if (byId.length >= maxProfiles) return;
      final batch = await _paginateDiscoverQuery(
        query,
        maxProfiles: maxProfiles - byId.length,
      );
      for (final profile in batch) {
        byId[profile.id] = profile;
        if (byId.length >= maxProfiles) break;
      }
    }

    await mergeFromQuery(_buildDiscoverQuery(constraints));
    if (byId.length < maxProfiles) {
      await mergeFromQuery(
        _buildDiscoverQuery(
          constraints,
          sportField: 'sportOnboarding.primarySportId',
          sportId: sportId,
        ),
      );
    }
    if (byId.length < maxProfiles) {
      await mergeFromQuery(
        _buildDiscoverQuery(
          constraints,
          sportField: 'sportOnboarding.secondarySportIds',
          sportId: sportId,
          sportIsArray: true,
        ),
      );
    }

    return byId.values.toList();
  }

  Query<Map<String, dynamic>> _buildDiscoverQuery(
    DiscoverFirestoreConstraints constraints, {
    String sportField = 'discoverSportIds',
    String? sportId,
    bool sportIsArray = true,
  }) {
    final resolvedSportId = sportId ?? constraints.sportFirestoreId;
    Query<Map<String, dynamic>> query =
        _users.where('role', isEqualTo: 'athlete');

    if (constraints.gender != null) {
      query = query.where('gender', isEqualTo: constraints.gender);
    }
    if (constraints.lookingForPartnerOnly) {
      query = query.where('lookingForPartner', isEqualTo: true);
    }
    if (resolvedSportId != null && resolvedSportId.isNotEmpty) {
      query = sportIsArray
          ? query.where(sportField, arrayContains: resolvedSportId)
          : query.where(sportField, isEqualTo: resolvedSportId);
    }

    return query.orderBy(FieldPath.documentId);
  }

  Future<List<AthleteProfile>> _paginateDiscoverQuery(
    Query<Map<String, dynamic>> baseQuery, {
    required int maxProfiles,
    int limit = pageSize,
  }) async {
    final profiles = <AthleteProfile>[];
    Query<Map<String, dynamic>> query = baseQuery.limit(limit);
    DocumentSnapshot<Map<String, dynamic>>? lastDoc;

    while (profiles.length < maxProfiles) {
      final snap = await query.get();
      if (snap.docs.isEmpty) break;

      for (final doc in snap.docs) {
        final profile = AthleteProfile.fromFirestore(doc);
        if (isDiscoverableProfile(profile)) {
          profiles.add(profile);
          if (profiles.length >= maxProfiles) break;
        }
      }

      if (profiles.length >= maxProfiles || snap.docs.length < limit) break;

      lastDoc = snap.docs.last;
      query = baseQuery.startAfterDocument(lastDoc).limit(limit);
    }

    return profiles;
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
