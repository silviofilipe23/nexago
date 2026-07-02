import 'package:cloud_functions/cloud_functions.dart';

import '../domain/match_ops/schedule_logic.dart';

class OrganizerMatchScheduleService {
  OrganizerMatchScheduleService({FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFunctions _functions;

  Future<Map<String, dynamic>> scheduleMatch({
    required String matchId,
    required String courtId,
    required DateTime scheduleTime,
    required DateTime scheduleEndTime,
    required String dayKey,
  }) async {
    final callable = _functions.httpsCallable('scheduleMatch');
    final result = await callable.call({
      'matchId': matchId.trim(),
      'courtId': courtId.trim(),
      'scheduleTime': scheduleTime.toIso8601String(),
      'scheduleEndTime': scheduleEndTime.toIso8601String(),
      'dayKey': dayKey.trim().isNotEmpty
          ? dayKey.trim()
          : ScheduleLogic.dayKeyFromDate(scheduleTime),
    });
    return Map<String, dynamic>.from(result.data as Map? ?? {});
  }

  Future<Map<String, dynamic>> rescheduleMatch({
    required String matchId,
    required String courtId,
    required DateTime scheduleTime,
    required DateTime scheduleEndTime,
    String dayKey = '',
  }) async {
    final callable = _functions.httpsCallable('rescheduleMatch');
    final result = await callable.call({
      'matchId': matchId.trim(),
      'courtId': courtId.trim(),
      'scheduleTime': scheduleTime.toIso8601String(),
      'scheduleEndTime': scheduleEndTime.toIso8601String(),
      if (dayKey.isNotEmpty) 'dayKey': dayKey,
    });
    return Map<String, dynamic>.from(result.data as Map? ?? {});
  }

  Future<void> unscheduleMatch({required String matchId}) async {
    final callable = _functions.httpsCallable('unscheduleMatch');
    await callable.call({'matchId': matchId.trim()});
  }

  Future<Map<String, dynamic>> autoScheduleTournamentDay({
    required String tournamentId,
    required String dayKey,
    bool preview = true,
    bool avoidAthleteConflict = true,
    bool respectBracketDeps = true,
    String? dayStart,
  }) async {
    final callable = _functions.httpsCallable('autoScheduleTournamentDay');
    final result = await callable.call({
      'tournamentId': tournamentId.trim(),
      'dayKey': dayKey.trim(),
      'preview': preview,
      'avoidAthleteConflict': avoidAthleteConflict,
      'respectBracketDeps': respectBracketDeps,
      if (dayStart != null && dayStart.trim().isNotEmpty)
        'dayStart': dayStart.trim(),
    });
    return _normalizeCallableMap(result.data);
  }

  static Map<String, dynamic> _normalizeCallableMap(dynamic raw) {
    if (raw is! Map) return {};
    final map = Map<String, dynamic>.from(raw);
    final slots = map['slots'];
    if (slots is List) {
      map['slots'] = slots
          .whereType<Map>()
          .map((slot) => Map<String, dynamic>.from(slot))
          .toList();
    }
    final skipped = map['skipped'];
    if (skipped is List) {
      map['skipped'] = skipped
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    }
    return map;
  }

  Future<void> callMatchToCourt({
    required String matchId,
    required String courtId,
  }) async {
    final callable = _functions.httpsCallable('callMatchToCourt');
    await callable.call({
      'matchId': matchId.trim(),
      'courtId': courtId.trim(),
    });
  }

  Future<void> releaseMatchAfterCheckIn({required String matchId}) async {
    final callable = _functions.httpsCallable('releaseMatchAfterCheckIn');
    await callable.call({'matchId': matchId.trim()});
  }

  Future<void> declareMatchWalkover({
    required String matchId,
    required String winnerTeamId,
    String loserStatus = 'wo',
  }) async {
    final callable = _functions.httpsCallable('declareMatchWalkover');
    await callable.call({
      'matchId': matchId.trim(),
      'winnerTeamId': winnerTeamId.trim(),
      'loserStatus': loserStatus,
    });
  }

  /// Grava o placar com validação autoritativa no servidor.
  /// Retorna `{ok, completed, winnerId}`.
  Future<Map<String, dynamic>> submitMatchResult({
    required String matchId,
    required List<Map<String, int>> sets,
    int? bestOf,
  }) async {
    final callable = _functions.httpsCallable('submitMatchResult');
    final result = await callable.call({
      'matchId': matchId.trim(),
      'sets': sets,
      if (bestOf != null) 'bestOf': bestOf,
    });
    return Map<String, dynamic>.from(result.data as Map? ?? {});
  }

  Future<void> validateMatchResult({required String matchId}) async {
    final callable = _functions.httpsCallable('validateMatchResult');
    await callable.call({'matchId': matchId.trim()});
  }

  Future<void> advanceBracketWinner({required String matchId}) async {
    final callable = _functions.httpsCallable('advanceBracketWinner');
    await callable.call({'matchId': matchId.trim()});
  }

  Future<void> applyLeagueRankingForMatch({required String matchId}) async {
    final callable = _functions.httpsCallable('applyLeagueRankingForMatch');
    await callable.call({'matchId': matchId.trim()});
  }
}
