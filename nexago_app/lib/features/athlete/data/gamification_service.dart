import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/gamification_models.dart';

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
    return _badgesCol(userId)
        .orderBy('unlockedAt', descending: true)
        .snapshots()
        .map((snap) {
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
      final items = GamificationMission.values.map((mission) {
        return DailyMissionStatus(
          mission: mission,
          completed: missionMap[mission.id] == true,
        );
      }).toList(growable: false);
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
      tx.set(
        ref,
        <String, dynamic>{
          'xp': nextXp,
          'level': nextXp ~/ 100,
          'streak': current.streak,
          'lastGameDate': current.lastGameDate != null
              ? Timestamp.fromDate(current.lastGameDate!)
              : null,
          'totalGames': current.totalGames,
          'updatedAt': FieldValue.serverTimestamp(),
          'lastXpReason': reason,
        },
        SetOptions(merge: true),
      );
    });
  }

  Future<void> onArenaFavorited({
    required String userId,
    required String arenaId,
  }) async {
    if (userId.trim().isEmpty || arenaId.trim().isEmpty) return;
    await addXp(
      userId: userId,
      amount: xpFavoriteArena,
      reason: 'FAVORITE_ARENA',
    );
  }

  Future<void> onPlayerInvited({
    required String userId,
    required String inviteId,
  }) async {
    if (userId.trim().isEmpty || inviteId.trim().isEmpty) return;
    final eventId = 'invite_$inviteId';
    final event = await _eventRef(userId, eventId).get();
    if (event.exists) return;
    await addXp(
      userId: userId,
      amount: xpInvitePlayer,
      reason: 'INVITE_PLAYER',
    );
    await _eventRef(userId, eventId).set(
      <String, dynamic>{
        'type': 'INVITE_PLAYER',
        'createdAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
    await _setMissionCompleted(
      userId: userId,
      mission: GamificationMission.inviteOnePlayer,
    );
  }

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

    final feedback = await _firestore.runTransaction<GamificationFeedback>(
      (tx) async {
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
                summarySnap.data() ?? <String, dynamic>{})
            : GamificationSummary.initial();

        final nextStreak = updateStreak(
          currentStreak: current.streak,
          lastGameDate: current.lastGameDate,
          now: now,
        );
        final streakIncreased = nextStreak > current.streak;
        final nextTotalGames = current.totalGames + 1;
        final nextXp = current.xp + xpGameCompleted;
        final nextLevel = nextXp ~/ 100;

        final unlocked = await _checkAndUnlockBadgesTx(
          tx: tx,
          userId: uid,
          totalGames: nextTotalGames,
          streak: nextStreak,
        );

        tx.set(
          summaryRef,
          <String, dynamic>{
            'xp': nextXp,
            'level': nextLevel,
            'streak': nextStreak,
            'lastGameDate': Timestamp.fromDate(now),
            'totalGames': nextTotalGames,
            'updatedAt': FieldValue.serverTimestamp(),
            'lastXpReason': 'GAME_COMPLETED',
          },
          SetOptions(merge: true),
        );

        tx.set(
          eventRef,
          <String, dynamic>{
            'type': 'GAME_COMPLETED',
            'bookingId': bid,
            'createdAt': FieldValue.serverTimestamp(),
          },
          SetOptions(merge: true),
        );

        final missionRef = _dailyMissionsRef(uid, _dayKey(now));
        tx.set(
          missionRef,
          <String, dynamic>{
            'date': _dayKey(now),
            'updatedAt': FieldValue.serverTimestamp(),
            'missions': <String, dynamic>{
              GamificationMission.playToday.id: true,
            },
          },
          SetOptions(merge: true),
        );

        return GamificationFeedback(
          xpGained: xpGameCompleted,
          streakIncreased: streakIncreased,
          newStreak: nextStreak,
          unlockedBadges: unlocked,
        );
      },
    );

    if (feedback.xpGained <= 0) return null;
    return feedback;
  }

  Future<void> _setMissionCompleted({
    required String userId,
    required GamificationMission mission,
  }) async {
    final now = DateTime.now();
    await _dailyMissionsRef(userId, _dayKey(now)).set(
      <String, dynamic>{
        'date': _dayKey(now),
        'updatedAt': FieldValue.serverTimestamp(),
        'missions': <String, dynamic>{mission.id: true},
      },
      SetOptions(merge: true),
    );
  }

  Future<List<GamificationBadge>> checkAndUnlockBadges({
    required String userId,
  }) async {
    final uid = userId.trim();
    if (uid.isEmpty) return const [];
    return _firestore.runTransaction<List<GamificationBadge>>((tx) async {
      final summarySnap = await tx.get(_summaryRef(uid));
      final summary = summarySnap.exists
          ? GamificationSummary.fromMap(
              summarySnap.data() ?? <String, dynamic>{})
          : GamificationSummary.initial();
      return _checkAndUnlockBadgesTx(
        tx: tx,
        userId: uid,
        totalGames: summary.totalGames,
        streak: summary.streak,
      );
    });
  }

  Future<List<GamificationBadge>> _checkAndUnlockBadgesTx({
    required Transaction tx,
    required String userId,
    required int totalGames,
    required int streak,
  }) async {
    final unlocked = <GamificationBadge>[];
    final toUnlock = <GamificationBadge>{
      if (totalGames >= 1) GamificationBadge.firstGame,
      if (totalGames >= 5) GamificationBadge.fiveGames,
      if (streak >= 3) GamificationBadge.streak3,
      if (streak >= 7) GamificationBadge.streak7,
    };
    final refs = <GamificationBadge, DocumentReference<Map<String, dynamic>>>{};
    final existsMap = <GamificationBadge, bool>{};

    for (final badge in toUnlock) {
      final ref = _badgesCol(userId).doc(badge.id);
      refs[badge] = ref;
      final snap = await tx.get(ref);
      existsMap[badge] = snap.exists;
    }

    for (final badge in toUnlock) {
      if (existsMap[badge] == true) continue;
      final ref = refs[badge];
      if (ref == null) continue;
      tx.set(
        ref,
        <String, dynamic>{
          'badgeId': badge.id,
          'title': badge.title,
          'description': badge.description,
          'icon': badge.icon,
          'unlockedAt': FieldValue.serverTimestamp(),
        },
        SetOptions(merge: true),
      );
      unlocked.add(badge);
    }
    return unlocked;
  }

  static int updateStreak({
    required int currentStreak,
    required DateTime? lastGameDate,
    required DateTime now,
  }) {
    if (lastGameDate == null) return 1;
    final last =
        DateTime(lastGameDate.year, lastGameDate.month, lastGameDate.day);
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
    return updateStreak(
      currentStreak: 0,
      lastGameDate: lastGameDate,
      now: now,
    );
  }

  static String _dayKey(DateTime date) {
    final y = date.year.toString().padLeft(4, '0');
    final m = date.month.toString().padLeft(2, '0');
    final d = date.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }
}
