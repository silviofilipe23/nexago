import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../../../core/formatting/app_date_format.dart';
import '../domain/gamification_models.dart';
import '../domain/profile_completion_sync_result.dart';
import '../domain/athlete_profile.dart';
import '../domain/sand_rank/sand_rank_models.dart';

class GamificationService {
  GamificationService(
    this._firestore, {
    FirebaseFunctions? functions,
  }) : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  static const int xpGameCompleted = 50;

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

  CollectionReference<Map<String, dynamic>> _rankRewardsCol(String userId) {
    return _firestore
        .collection('users')
        .doc(userId)
        .collection('gamification_rewards');
  }

  /// Recompensas da trilha de elos (concedidas por `sand-rank-sync`).
  Stream<List<UserSandRankReward>> watchRankRewards(String userId) {
    final uid = userId.trim();
    if (uid.isEmpty) return Stream.value(const []);
    return _rankRewardsCol(uid).snapshots().map((snap) {
      return snap.docs
          .map((d) => UserSandRankReward.fromMap(d.data()))
          .where((r) => r.rewardId.isNotEmpty)
          .toList(growable: false);
    });
  }

  /// Marca recompensas como vistas (única escrita client permitida pelas
  /// rules em `gamification_rewards` — só o campo `seenAt`).
  Future<void> markRankRewardsSeen({
    required String userId,
    required List<String> rewardIds,
  }) async {
    final uid = userId.trim();
    if (uid.isEmpty || rewardIds.isEmpty) return;
    final batch = _firestore.batch();
    for (final rewardId in rewardIds) {
      final id = rewardId.trim();
      if (id.isEmpty) continue;
      batch.update(_rankRewardsCol(uid).doc(id), {
        'seenAt': FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }

  /// Equipa (ou desequipa, com `null`) a moldura de avatar da trilha.
  /// Server-side via Cloud Function `equipSandRankCosmetic` (valida posse).
  Future<void> equipSandRankFrame(String? frameId) async {
    await _functions
        .httpsCallable('equipSandRankCosmetic')
        .call<Map<String, dynamic>>(<String, dynamic>{'frameId': frameId});
  }

  /// Equipa (ou desequipa, com `null`) o título exibido no perfil.
  Future<void> equipSandRankTitle(String? titleId) async {
    await _functions
        .httpsCallable('equipSandRankCosmetic')
        .call<Map<String, dynamic>>(<String, dynamic>{'titleId': titleId});
  }

  static const String tournamentMatchWonEventType = 'TOURNAMENT_MATCH_WON';

  static String tournamentMatchXpEventId(String matchId) =>
      'tournament_match_${matchId.trim()}';

  /// XP concedido para vitória em partida de torneio, ou `null` se ainda não creditado.
  Stream<int?> watchTournamentMatchXpAwarded({
    required String userId,
    required String matchId,
  }) {
    final uid = userId.trim();
    final mid = matchId.trim();
    if (uid.isEmpty || mid.isEmpty) return Stream.value(null);

    return _eventRef(uid, tournamentMatchXpEventId(mid)).snapshots().map((snap) {
      if (!snap.exists) return null;
      final data = snap.data();
      if (data == null) return null;

      final xp = (data['xp'] as num?)?.toInt();
      if (xp != null && xp > 0) return xp;

      final type = data['type']?.toString() ?? '';
      if (type == tournamentMatchWonEventType) return xpGameCompleted;

      return null;
    });
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

  /// Constrói o [GamificationFeedback] a partir da resposta de uma Cloud Function
  /// de gamificação (todas retornam o mesmo formato de campos).
  GamificationFeedback _feedbackFromCallableData(
    Map<String, dynamic> data, {
    String? title,
  }) {
    final completedMissionIds = ((data['completedMissionIds'] as List?) ?? const [])
        .map((e) => e.toString())
        .toList(growable: false);
    final unlockedAchievementIds =
        ((data['unlockedAchievementIds'] as List?) ?? const [])
            .map((e) => e.toString())
            .toList(growable: false);
    return GamificationFeedback(
      xpGained: (data['xpGained'] as num?)?.toInt() ?? 0,
      streakIncreased: data['streakIncreased'] == true,
      newStreak: (data['newStreak'] as num?)?.toInt() ?? 0,
      unlockedBadges: _legacyBadgesFromIds(unlockedAchievementIds),
      unlockedAchievementIds: unlockedAchievementIds,
      completedMissionIds: completedMissionIds,
      title: title,
    );
  }

  /// Registra compartilhamento de perfil (contador + missão diária + conquistas).
  /// Server-side via Cloud Function `recordProfileShare` (rules bloqueiam escrita
  /// do client em `gamification*`).
  Future<GamificationFeedback?> onProfileShared({required String userId}) async {
    final uid = userId.trim();
    if (uid.isEmpty) return null;

    final result = await _functions
        .httpsCallable('recordProfileShare')
        .call<Map<String, dynamic>>(<String, dynamic>{});
    final data = result.data;
    final xpGained = (data['xpGained'] as num?)?.toInt() ?? 0;
    if (xpGained <= 0) return null;
    return _feedbackFromCallableData(data);
  }

  /// Credita XP de convidar jogador — server-side via trigger em `bookingInvites`
  /// (dispara automaticamente ao aceitar o convite; não requer chamada do client).

  Future<GamificationFeedback?> onReserveToday({required String userId}) {
    return completeDailyMission(
      userId: userId,
      mission: GamificationMission.reserveToday,
    );
  }

  Future<GamificationFeedback?> onExploreTournament({required String userId}) {
    return completeDailyMission(
      userId: userId,
      mission: GamificationMission.exploreTournament,
    );
  }

  /// Marca missão diária e concede XP (idempotente por dia).
  /// Server-side via Cloud Function `completeDailyMission` (rules bloqueiam escrita
  /// do client em `gamification*`).
  Future<GamificationFeedback?> completeDailyMission({
    required String userId,
    required GamificationMission mission,
  }) async {
    final uid = userId.trim();
    if (uid.isEmpty) return null;

    final result = await _functions
        .httpsCallable('completeDailyMission')
        .call<Map<String, dynamic>>(<String, dynamic>{'missionId': mission.id});
    final data = result.data;
    final xpGained = (data['xpGained'] as num?)?.toInt() ?? 0;
    if (xpGained <= 0) return null;
    return _feedbackFromCallableData(data, title: 'Missão concluída');
  }

  /// Credita XP de jogo concluído (idempotente por reserva). Server-side via
  /// Cloud Function `processCompletedGame`, que revalida a elegibilidade
  /// (horário/; dono da reserva) antes de creditar.
  Future<GamificationFeedback?> processCompletedGame({
    required String userId,
    required String bookingId,
  }) async {
    final uid = userId.trim();
    final bid = bookingId.trim();
    if (uid.isEmpty || bid.isEmpty) return null;

    final result = await _functions
        .httpsCallable('processCompletedGame')
        .call<Map<String, dynamic>>(<String, dynamic>{'bookingId': bid});
    final data = result.data;
    final xpGained = (data['xpGained'] as num?)?.toInt() ?? 0;
    if (xpGained <= 0) return null;
    return _feedbackFromCallableData(data);
  }

  Future<List<GamificationBadge>> checkAndUnlockBadges({
    required String userId,
  }) async {
    final ids = await syncAchievements(userId: userId);
    return _legacyBadgesFromIds(ids);
  }

  /// Sincroniza desbloqueios do catálogo (24) e XP de conquista (idempotente).
  /// Server-side via Cloud Function `syncAchievements` (rules bloqueiam escrita
  /// do client em `gamification_badges`/`gamification_events`).
  Future<List<String>> syncAchievements({required String userId}) async {
    final uid = userId.trim();
    if (uid.isEmpty) return const [];

    final result = await _functions
        .httpsCallable('syncAchievements')
        .call<Map<String, dynamic>>(<String, dynamic>{});
    final ids = result.data['unlockedAchievementIds'];
    return ids is List
        ? ids.map((e) => e.toString()).toList(growable: false)
        : const [];
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

  static String _dayKey(DateTime date) => calendarDateKey(date);

  /// Sincroniza XP retroativo dos passos já concluídos e badge de perfil completo.
  ///
  /// Escrita em `gamification_*` é feita via Cloud Function (regras do Firestore).
  Future<ProfileCompletionSyncResult> syncProfileCompletionRewards({
    required String userId,
    AthleteProfile? profile,
  }) async {
    final uid = userId.trim();
    if (uid.isEmpty) return ProfileCompletionSyncResult.empty;

    try {
      final result = await _functions
          .httpsCallable('syncProfileCompletionRewards')
          .call<Map<String, dynamic>>(<String, dynamic>{});
      final data = result.data;
      final stepIds = data['newlyAwardedStepIds'];
      return ProfileCompletionSyncResult(
        totalXpGained: (data['totalXpGained'] as num?)?.toInt() ?? 0,
        newlyAwardedStepIds: stepIds is List
            ? stepIds.map((e) => e.toString()).toList(growable: false)
            : const [],
        profileMarkedComplete: data['profileMarkedComplete'] == true,
        unlockedProfileBadge: data['unlockedProfileBadge'] == true,
      );
    } on FirebaseFunctionsException {
      rethrow;
    }
  }
}
