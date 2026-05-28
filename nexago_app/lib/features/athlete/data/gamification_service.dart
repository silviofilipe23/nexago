import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/achievements/achievement_catalog.dart';
import '../domain/achievements/achievement_metrics.dart';
import '../domain/achievements/achievement_state_resolver.dart';
import '../domain/athlete_profile.dart';
import '../domain/daily_mission_catalog.dart';
import '../domain/gamification_models.dart';
import '../domain/profile_completion_models.dart';
import '../domain/profile_completion_sync_result.dart';

class GamificationService {
  GamificationService(this._firestore);

  final FirebaseFirestore _firestore;

  static const int xpGameCompleted = 50;
  static const int xpInvitePlayer = 20;
  static const int xpFavoriteArena = 10;

  DocumentReference<Map<String, dynamic>> _summaryRef(String userId) {
    return _firestore
        .collection('users')
        .doc(userId)
        .collection('gamification')
        .doc('summary');
  }

  CollectionReference<Map<String, dynamic>> _badgesCol(String userId) {
    return _firestore
        .collection('users')
        .doc(userId)
        .collection('gamification_badges');
  }

  DocumentReference<Map<String, dynamic>> _dailyMissionsRef(
    String userId,
    String dayKey,
  ) {
    return _firestore
        .collection('users')
        .doc(userId)
        .collection('gamification_daily_missions')
        .doc(dayKey);
  }

  DocumentReference<Map<String, dynamic>> _eventRef(
    String userId,
    String eventId,
  ) {
    return _firestore
        .collection('users')
        .doc(userId)
        .collection('gamification_events')
        .doc(eventId);
  }

  Stream<GamificationSummary> watchSummary(String userId) {
    return _summaryRef(userId).snapshots().map((doc) {
      final map = doc.data();
      if (map == null) return GamificationSummary.initial();
      return GamificationSummary.fromMap(map);
    });
  }

  Stream<List<UserBadgeProgress>> watchBadges(String userId) {
    return _badgesCol(
      userId,
    ).orderBy('unlockedAt', descending: true).snapshots().map((snap) {
      return snap.docs
          .map((d) => UserBadgeProgress.fromMap(d.data()))
          .toList(growable: false);
    });
  }

  Stream<DailyMissionBundle> watchDailyMissions(String userId, DateTime now) {
    final dayKey = _dayKey(now);
    return _dailyMissionsRef(userId, dayKey).snapshots().map((doc) {
      final data = doc.data() ?? <String, dynamic>{};
      final missionMap =
          (data['missions'] as Map<String, dynamic>?) ?? <String, dynamic>{};
      final items = GamificationMission.values
          .map((mission) {
            return DailyMissionStatus(
              mission: mission,
              completed: missionMap[mission.id] == true,
            );
          })
          .toList(growable: false);
      return DailyMissionBundle(dayKey: dayKey, missions: items);
    });
  }

  Future<void> addXp({
    required String userId,
    required int amount,
    String reason = 'GENERIC',
  }) async {
    if (userId.trim().isEmpty || amount <= 0) return;
    await _firestore.runTransaction((tx) async {
      final ref = _summaryRef(userId);
      final snap = await tx.get(ref);
      final current = snap.exists
          ? GamificationSummary.fromMap(snap.data() ?? <String, dynamic>{})
          : GamificationSummary.initial();
      final nextXp = current.xp + amount;
      tx.set(ref, <String, dynamic>{
        'xp': nextXp,
        'level': nextXp ~/ 100,
        'streak': current.streak,
        'lastGameDate': current.lastGameDate != null
            ? Timestamp.fromDate(current.lastGameDate!)
            : null,
        'totalGames': current.totalGames,
        'updatedAt': FieldValue.serverTimestamp(),
        'lastXpReason': reason,
      }, SetOptions(merge: true));
    });
  }

  Future<void> onArenaFavorited({
    required String userId,
    required String arenaId,
  }) async {
    final uid = userId.trim();
    final aid = arenaId.trim();
    if (uid.isEmpty || aid.isEmpty) return;

    final eventId = 'favorite_arena_$aid';
    final event = await _eventRef(uid, eventId).get();
    if (event.exists) return;

    await _firestore.runTransaction((tx) async {
      final ev = await tx.get(_eventRef(uid, eventId));
      if (ev.exists) return;

      final summaryRef = _summaryRef(uid);
      final summarySnap = await tx.get(summaryRef);
      final data = summarySnap.data() ?? <String, dynamic>{};
      final favorites = (data['favoriteArenasCount'] as num?)?.toInt() ?? 0;
      final xp = (data['xp'] as num?)?.toInt() ?? 0;
      final nextXp = xp + xpFavoriteArena;

      tx.set(summaryRef, <String, dynamic>{
        'favoriteArenasCount': favorites + 1,
        'xp': nextXp,
        'level': nextXp ~/ 100,
        'updatedAt': FieldValue.serverTimestamp(),
        'lastXpReason': 'FAVORITE_ARENA',
      }, SetOptions(merge: true));
      tx.set(_eventRef(uid, eventId), <String, dynamic>{
        'type': 'FAVORITE_ARENA',
        'arenaId': aid,
        'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    });

    await completeDailyMission(
      userId: uid,
      mission: GamificationMission.favoriteArena,
    );
    await syncAchievements(userId: uid);
  }

  Future<void> onProfileShared({required String userId}) async {
    final uid = userId.trim();
    if (uid.isEmpty) return;

    await _firestore.runTransaction((tx) async {
      final summaryRef = _summaryRef(uid);
      final summarySnap = await tx.get(summaryRef);
      final data = summarySnap.data() ?? <String, dynamic>{};
      final shares = (data['profileSharesCount'] as num?)?.toInt() ?? 0;
      tx.set(summaryRef, <String, dynamic>{
        'profileSharesCount': shares + 1,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    });

    await completeDailyMission(
      userId: uid,
      mission: GamificationMission.shareProfile,
    );
    await syncAchievements(userId: uid);
  }

  Future<void> onPlayerInvited({
    required String userId,
    required String inviteId,
  }) async {
    final uid = userId.trim();
    final iid = inviteId.trim();
    if (uid.isEmpty || iid.isEmpty) return;
    final eventId = 'invite_$iid';
    final event = await _eventRef(uid, eventId).get();
    if (event.exists) return;

    await _firestore.runTransaction((tx) async {
      final ev = await tx.get(_eventRef(uid, eventId));
      if (ev.exists) return;

      final summaryRef = _summaryRef(uid);
      final summarySnap = await tx.get(summaryRef);
      final data = summarySnap.data() ?? <String, dynamic>{};
      final invites = (data['invitesCount'] as num?)?.toInt() ?? 0;
      final xp = (data['xp'] as num?)?.toInt() ?? 0;
      final nextXp = xp + xpInvitePlayer;

      tx.set(summaryRef, <String, dynamic>{
        'invitesCount': invites + 1,
        'xp': nextXp,
        'level': nextXp ~/ 100,
        'updatedAt': FieldValue.serverTimestamp(),
        'lastXpReason': 'INVITE_PLAYER',
      }, SetOptions(merge: true));
      tx.set(_eventRef(uid, eventId), <String, dynamic>{
        'type': 'INVITE_PLAYER',
        'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    });

    // await completeDailyMission(
    //   userId: uid,
    //   mission: GamificationMission.inviteOnePlayer,
    // );
    await syncAchievements(userId: uid);
  }

  Future<GamificationFeedback?> onReserveToday({
    required String userId,
    DateTime? now,
  }) {
    return completeDailyMission(
      userId: userId,
      mission: GamificationMission.reserveToday,
      now: now,
    );
  }

  Future<GamificationFeedback?> onExploreTournament({
    required String userId,
    DateTime? now,
  }) {
    return completeDailyMission(
      userId: userId,
      mission: GamificationMission.exploreTournament,
      now: now,
    );
  }

  /// Marca missão diária e concede XP (idempotente por dia).
  Future<GamificationFeedback?> completeDailyMission({
    required String userId,
    required GamificationMission mission,
    DateTime? now,
  }) async {
    final uid = userId.trim();
    if (uid.isEmpty) return null;

    final def = DailyMissionCatalog.byId(mission.id);
    if (def == null || def.xpReward <= 0) return null;

    final at = now ?? DateTime.now();
    final dayKey = _dayKey(at);
    final eventId = _dailyMissionEventId(dayKey, mission.id);
    final eventRef = _eventRef(uid, eventId);
    final missionRef = _dailyMissionsRef(uid, dayKey);
    final summaryRef = _summaryRef(uid);

    final feedback = await _firestore.runTransaction<GamificationFeedback?>((
      tx,
    ) async {
      final missionSnap = await tx.get(missionRef);
      final missionData = missionSnap.data() ?? <String, dynamic>{};
      final missionMap =
          (missionData['missions'] as Map<String, dynamic>?) ??
          <String, dynamic>{};
      if (missionMap[mission.id] == true) return null;

      final eventSnap = await tx.get(eventRef);
      if (eventSnap.exists) {
        tx.set(missionRef, <String, dynamic>{
          'date': dayKey,
          'updatedAt': FieldValue.serverTimestamp(),
          'missions': <String, dynamic>{mission.id: true},
        }, SetOptions(merge: true));
        return null;
      }

      final summarySnap = await tx.get(summaryRef);
      final current = summarySnap.exists
          ? GamificationSummary.fromMap(
              summarySnap.data() ?? <String, dynamic>{},
            )
          : GamificationSummary.initial();
      final nextXp = current.xp + def.xpReward;
      final countsForStreak = _missionCountsForStreakActivity(mission.id);
      final streakFields = countsForStreak
          ? _streakActivityFields(current: current, now: at)
          : <String, dynamic>{};
      final nextStreak = countsForStreak
          ? streakFields['streak'] as int
          : current.streak;
      final streakIncreased = countsForStreak && nextStreak > current.streak;

      tx.set(missionRef, <String, dynamic>{
        'date': dayKey,
        'updatedAt': FieldValue.serverTimestamp(),
        'missions': <String, dynamic>{mission.id: true},
      }, SetOptions(merge: true));

      tx.set(eventRef, <String, dynamic>{
        'type': 'DAILY_MISSION',
        'missionId': mission.id,
        'xp': def.xpReward,
        'dayKey': dayKey,
        'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      tx.set(summaryRef, <String, dynamic>{
        'xp': nextXp,
        'level': nextXp ~/ 100,
        'totalGames': current.totalGames,
        'updatedAt': FieldValue.serverTimestamp(),
        'lastXpReason': 'DAILY_MISSION_${mission.id}',
        if (!countsForStreak) ...<String, dynamic>{
          'streak': current.streak,
          'lastGameDate': current.lastGameDate != null
              ? Timestamp.fromDate(current.lastGameDate!)
              : null,
        },
        if (countsForStreak) ...streakFields,
      }, SetOptions(merge: true));

      return GamificationFeedback(
        xpGained: def.xpReward,
        streakIncreased: streakIncreased,
        newStreak: nextStreak,
        unlockedBadges: const [],
        completedMissionIds: [mission.id],
        title: 'Missão concluída',
      );
    });

    if (feedback == null || feedback.xpGained <= 0) return null;

    final unlockedIds = await syncAchievements(userId: uid);
    return GamificationFeedback(
      xpGained: feedback.xpGained,
      streakIncreased: feedback.streakIncreased,
      newStreak: feedback.newStreak,
      unlockedBadges: _legacyBadgesFromIds(unlockedIds),
      unlockedAchievementIds: unlockedIds,
      completedMissionIds: feedback.completedMissionIds,
      title: feedback.title,
    );
  }

  static String _dailyMissionEventId(String dayKey, String missionId) =>
      'daily_${dayKey}_$missionId';

  Future<GamificationFeedback?> processCompletedGame({
    required String userId,
    required String bookingId,
    required DateTime now,
  }) async {
    final uid = userId.trim();
    final bid = bookingId.trim();
    if (uid.isEmpty || bid.isEmpty) return null;

    final eventId = 'completed_game_$bid';
    final eventRef = _eventRef(uid, eventId);
    final eventSnap = await eventRef.get();
    if (eventSnap.exists) return null;

    final feedback = await _firestore.runTransaction<GamificationFeedback>((
      tx,
    ) async {
      final eventInTx = await tx.get(eventRef);
      if (eventInTx.exists) {
        return const GamificationFeedback(
          xpGained: 0,
          streakIncreased: false,
          newStreak: 0,
          unlockedBadges: <GamificationBadge>[],
        );
      }

      final summaryRef = _summaryRef(uid);
      final summarySnap = await tx.get(summaryRef);
      final current = summarySnap.exists
          ? GamificationSummary.fromMap(
              summarySnap.data() ?? <String, dynamic>{},
            )
          : GamificationSummary.initial();

      final streakFields = _streakActivityFields(current: current, now: now);
      final nextStreak = streakFields['streak'] as int;
      final streakIncreased = nextStreak > current.streak;
      final nextTotalGames = current.totalGames + 1;
      final nextXp = current.xp + xpGameCompleted;
      final nextLevel = nextXp ~/ 100;

      tx.set(summaryRef, <String, dynamic>{
        'xp': nextXp,
        'level': nextLevel,
        'totalGames': nextTotalGames,
        'updatedAt': FieldValue.serverTimestamp(),
        'lastXpReason': 'GAME_COMPLETED',
        ...streakFields,
      }, SetOptions(merge: true));

      tx.set(eventRef, <String, dynamic>{
        'type': 'GAME_COMPLETED',
        'bookingId': bid,
        'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      return GamificationFeedback(
        xpGained: xpGameCompleted,
        streakIncreased: streakIncreased,
        newStreak: nextStreak,
        unlockedBadges: const [],
      );
    });

    if (feedback.xpGained <= 0) return null;

    final unlockedIds = await syncAchievements(userId: uid);
    return GamificationFeedback(
      xpGained: feedback.xpGained,
      streakIncreased: feedback.streakIncreased,
      newStreak: feedback.newStreak,
      unlockedBadges: _legacyBadgesFromIds(unlockedIds),
      unlockedAchievementIds: unlockedIds,
    );
  }

  Future<List<GamificationBadge>> checkAndUnlockBadges({
    required String userId,
  }) async {
    final ids = await syncAchievements(userId: userId);
    return _legacyBadgesFromIds(ids);
  }

  /// Sincroniza desbloqueios do catálogo (24) e XP de conquista (idempotente).
  Future<List<String>> syncAchievements({
    required String userId,
    AchievementMetrics? metrics,
    AthleteProfile? profile,
    int totalBookings = 0,
  }) async {
    final uid = userId.trim();
    if (uid.isEmpty) return const [];

    final m =
        metrics ??
        await loadAchievementMetrics(
          uid,
          profile: profile,
          totalBookings: totalBookings,
        );

    final eligible = AchievementCatalog.all
        .where((def) => AchievementStateResolver.isRuleMet(def.rule, m))
        .toList(growable: false);

    return _firestore.runTransaction<List<String>>((tx) async {
      // Firestore: todas as leituras antes de qualquer escrita.
      final summarySnap = await tx.get(_summaryRef(uid));
      final summaryData = summarySnap.data() ?? <String, dynamic>{};
      var xp = (summaryData['xp'] as num?)?.toInt() ?? 0;
      final initialXp = xp;

      final badgeSnaps = <String, DocumentSnapshot<Map<String, dynamic>>>{};
      final eventSnaps = <String, DocumentSnapshot<Map<String, dynamic>>>{};
      for (final def in eligible) {
        badgeSnaps[def.id] = await tx.get(_badgesCol(uid).doc(def.id));
        eventSnaps[def.id] = await tx.get(
          _eventRef(uid, _achievementEventId(def.id)),
        );
      }

      final unlockedNow = <String>[];
      for (final def in eligible) {
        final badgeSnap = badgeSnaps[def.id]!;
        if (badgeSnap.exists) continue;

        final eventId = _achievementEventId(def.id);
        final evRef = _eventRef(uid, eventId);
        final evSnap = eventSnaps[def.id]!;
        if (!evSnap.exists && def.xpReward > 0) {
          xp += def.xpReward;
          tx.set(evRef, <String, dynamic>{
            'type': 'ACHIEVEMENT_UNLOCK',
            'achievementId': def.id,
            'xp': def.xpReward,
            'createdAt': FieldValue.serverTimestamp(),
          }, SetOptions(merge: true));
        }

        tx.set(_badgesCol(uid).doc(def.id), <String, dynamic>{
          'badgeId': def.id,
          'title': def.title,
          'description': def.description,
          'xpReward': def.xpReward,
          'unlockedAt': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));
        unlockedNow.add(def.id);
      }

      if (xp != initialXp) {
        tx.set(_summaryRef(uid), <String, dynamic>{
          'xp': xp,
          'level': xp ~/ 100,
          'updatedAt': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));
      }

      return unlockedNow;
    });
  }

  Future<AchievementMetrics> loadAchievementMetrics(
    String userId, {
    AthleteProfile? profile,
    int totalBookings = 0,
  }) async {
    final uid = userId.trim();
    final summarySnap = await _summaryRef(uid).get();
    final summaryMap = summarySnap.data() ?? <String, dynamic>{};
    final athleteProfile = profile ?? await _loadAthleteProfile(uid);
    return AchievementMetricsBuilder.build(
      summaryMap: summaryMap,
      profile: athleteProfile,
      totalBookings: totalBookings,
    );
  }

  Future<AthleteProfile> _loadAthleteProfile(String userId) async {
    final snap = await _userRef(userId).get();
    if (!snap.exists) {
      return AthleteProfile(
        id: userId,
        name: '',
        sport: '',
        level: '',
        city: '',
      );
    }
    return AthleteProfile.fromFirestore(snap);
  }

  static String _achievementEventId(String achievementId) =>
      'achievement_$achievementId';

  static List<String> _parseGameDayKeys(dynamic raw) {
    if (raw is! List) return const [];
    return raw
        .map((e) => e?.toString().trim() ?? '')
        .where((s) => s.length >= 8)
        .toList(growable: false);
  }

  List<GamificationBadge> _legacyBadgesFromIds(List<String> ids) {
    return ids
        .map(GamificationBadge.fromId)
        .whereType<GamificationBadge>()
        .toList(growable: false);
  }

  static int updateStreak({
    required int currentStreak,
    required DateTime? lastGameDate,
    required DateTime now,
  }) {
    if (lastGameDate == null) return 1;
    final last = DateTime(
      lastGameDate.year,
      lastGameDate.month,
      lastGameDate.day,
    );
    final today = DateTime(now.year, now.month, now.day);
    final days = today.difference(last).inDays;
    if (days <= 0) return currentStreak.clamp(1, 100000);
    if (days == 1) {
      final base = currentStreak <= 0 ? 0 : currentStreak;
      return base + 1;
    }
    return 1;
  }

  static int updateStreakLegacy(DateTime? lastGameDate, DateTime now) {
    return updateStreak(currentStreak: 0, lastGameDate: lastGameDate, now: now);
  }

  static String _dayKey(DateTime date) {
    final y = date.year.toString().padLeft(4, '0');
    final m = date.month.toString().padLeft(2, '0');
    final d = date.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }

  static bool _missionCountsForStreakActivity(String missionId) {
    final id = missionId.trim().toUpperCase();
    return id == 'PLAY_TODAY' || id == 'RESERVE_TODAY';
  }

  /// Atualiza sequência e histórico de dias ao jogar ou manter a chama (reserva/jogo).
  Map<String, dynamic> _streakActivityFields({
    required GamificationSummary current,
    required DateTime now,
  }) {
    final nextStreak = updateStreak(
      currentStreak: current.streak,
      lastGameDate: current.lastGameDate,
      now: now,
    );
    final gameDays = AchievementMetrics.appendGameCompletionDay(
      current.gameCompletionDays,
      now,
    );
    final windowFields = AchievementMetrics.gameWindowFields(gameDays);
    return <String, dynamic>{
      'streak': nextStreak,
      'lastGameDate': Timestamp.fromDate(now),
      'gameCompletionDays': gameDays,
      ...windowFields,
    };
  }

  DocumentReference<Map<String, dynamic>> _userRef(String userId) {
    return _firestore.collection('users').doc(userId);
  }

  static String _profileStepEventId(ProfileCompletionStep step) {
    return 'profile_step_${step.id}';
  }

  /// Concede XP de um passo de perfil (idempotente via [gamification_events]).
  Future<GamificationFeedback?> awardProfileStepXp({
    required String userId,
    required ProfileCompletionStep step,
  }) async {
    final uid = userId.trim();
    if (uid.isEmpty) return null;

    final amount = step.xpReward;
    if (amount <= 0) return null;

    final eventId = _profileStepEventId(step);
    final eventRef = _eventRef(uid, eventId);
    final existing = await eventRef.get();
    if (existing.exists) return null;

    await _firestore.runTransaction((tx) async {
      final inTx = await tx.get(eventRef);
      if (inTx.exists) return;

      final summaryRef = _summaryRef(uid);
      final summarySnap = await tx.get(summaryRef);
      final current = summarySnap.exists
          ? GamificationSummary.fromMap(
              summarySnap.data() ?? <String, dynamic>{},
            )
          : GamificationSummary.initial();

      final nextXp = current.xp + amount;
      tx.set(summaryRef, <String, dynamic>{
        'xp': nextXp,
        'level': nextXp ~/ 100,
        'streak': current.streak,
        'lastGameDate': current.lastGameDate != null
            ? Timestamp.fromDate(current.lastGameDate!)
            : null,
        'totalGames': current.totalGames,
        'updatedAt': FieldValue.serverTimestamp(),
        'lastXpReason': step.xpReason,
      }, SetOptions(merge: true));

      tx.set(eventRef, <String, dynamic>{
        'type': step.xpReason,
        'stepId': step.id,
        'xp': amount,
        'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    });

    return GamificationFeedback(
      xpGained: amount,
      streakIncreased: false,
      newStreak: 0,
      unlockedBadges: const [],
    );
  }

  /// Sincroniza XP retroativo dos passos já concluídos e badge de perfil completo.
  Future<ProfileCompletionSyncResult> syncProfileCompletionRewards({
    required String userId,
    required AthleteProfile profile,
  }) async {
    final uid = userId.trim();
    if (uid.isEmpty) return ProfileCompletionSyncResult.empty;

    final state = ProfileCompletionState.fromProfile(profile);
    var totalXp = 0;
    final newlyAwarded = <String>[];

    for (final status in state.steps) {
      if (!status.isDone) continue;
      final feedback = await awardProfileStepXp(userId: uid, step: status.step);
      if (feedback != null && feedback.xpGained > 0) {
        totalXp += feedback.xpGained;
        newlyAwarded.add(status.step.id);
      }
    }

    var profileMarkedComplete = false;
    var unlockedProfileBadge = false;

    if (state.allComplete) {
      await _userRef(uid).set(<String, dynamic>{
        'isProfileComplete': true,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      profileMarkedComplete = true;

      final unlockedIds = await syncAchievements(userId: uid, profile: profile);
      unlockedProfileBadge =
          unlockedIds.contains('PROFILE_COMPLETE') ||
          unlockedIds.contains(GamificationBadge.profileComplete.id);
    } else {
      await syncAchievements(userId: uid, profile: profile);
    }

    return ProfileCompletionSyncResult(
      totalXpGained: totalXp,
      newlyAwardedStepIds: newlyAwarded,
      profileMarkedComplete: profileMarkedComplete,
      unlockedProfileBadge: unlockedProfileBadge,
    );
  }
}
