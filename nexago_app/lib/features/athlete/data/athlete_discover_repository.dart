import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../arenas/domain/arenas_providers.dart';
import '../../ranking/data/ranking_repository.dart';
import '../../tournaments/data/users_repository.dart';
import '../domain/athlete_discover_logic.dart';
import '../domain/athlete_discover_models.dart';
import '../domain/athlete_profile.dart';
import '../domain/athlete_public_profile_models.dart';

class AthleteDiscoverRepository {
  AthleteDiscoverRepository({
    required FirebaseFirestore firestore,
    required RankingRepository rankingRepository,
    required UsersRepository usersRepository,
  })  : _users = firestore.collection('users'),
        _rankingRepository = rankingRepository,
        _usersRepository = usersRepository;

  final CollectionReference<Map<String, dynamic>> _users;
  final RankingRepository _rankingRepository;
  final UsersRepository _usersRepository;

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

    final entry = await _rankingRepository.getAthleteRankingEntry(athleteId);
    final snapshot = entry == null
        ? const AthletePublicRankingSnapshot()
        : AthletePublicRankingSnapshot(
            points: entry.totalPoints,
            tournamentsCount: entry.tournamentsCount,
          );

    var rank = 0;
    if (entry != null && entry.totalPoints > 0) {
      final general = await _rankingRepository.loadAthleteRankingGeneral();
      final idx = general.indexWhere((r) => r.athleteId == athleteId);
      if (idx >= 0) rank = idx + 1;
    }

    final withRank = AthletePublicRankingSnapshot(
      rank: rank > 0 ? rank : null,
      points: snapshot.points,
      tournamentsCount: snapshot.tournamentsCount,
      seasonYear: DateTime.now().year,
    );
    _rankingCache[athleteId] = withRank;
    return withRank;
  }

  Future<List<AthleteDiscoverEntry>> enrichEntries({
    required List<AthleteProfile> profiles,
    required String? currentUserId,
    Set<String> followingIds = const {},
  }) async {
    final entries = <AthleteDiscoverEntry>[];
    for (final profile in profiles) {
      final ranking = await rankingFor(profile.id);
      entries.add(
        buildDiscoverEntry(
          profile: profile,
          ranking: ranking,
          isFollowing: followingIds.contains(profile.id),
          isCurrentUser: currentUserId != null && profile.id == currentUserId,
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
    );
  },
);
