import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/tournament_match.dart';
import '../domain/tournament_match_point_action.dart';
import '../domain/tournament_match_set.dart';
import '../domain/tournament_match_status.dart';

abstract final class TournamentMatchMapper {
  TournamentMatchMapper._();

  static TournamentMatch? fromSnapshot(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    if (!doc.exists) return null;
    final data = doc.data();
    if (data == null) return null;
    return fromMap(doc.id, data);
  }

  static TournamentMatch fromMap(String id, Map<String, dynamic> data) {
    return TournamentMatch(
      id: id,
      tournamentId: _str(data['tournamentId']) ?? '',
      categoryId: _str(data['categoryId']) ?? '',
      round: _int(data['round']) ?? 0,
      matchType: _str(data['matchType']) ?? '',
      poolId: _str(data['poolId']) ?? '',
      teamAId: _str(data['teamAId']) ?? '',
      teamBId: _str(data['teamBId']) ?? '',
      status: _str(data['status']) ?? TournamentMatchStatus.scheduled,
      resultA: _str(data['resultA']) ?? '',
      resultB: _str(data['resultB']) ?? '',
      isGroupMatch: data['isGroupMatch'] == true,
      matchNumber: _int(data['matchNumber']) ?? 0,
      sets: _sets(data['sets']),
      lastActions: _mergePointActions(
        _lastActions(data['pointHistory']),
        _lastActions(data['lastActions']),
      ),
      currentSetIndex: _int(data['currentSetIndex']),
      winnerId: _str(data['winnerId']),
      scheduleTime: _timestamp(data['scheduleTime']),
      matchStartedAt: _timestamp(data['matchStartedAt']),
      matchEndedAt: _timestamp(data['matchEndedAt']),
      teamADescription: _str(data['teamADescription']),
      teamBDescription: _str(data['teamBDescription']),
      courtName: _str(data['courtName']),
      description: _str(data['description']),
      courtId: _str(data['courtId']) ?? '',
      scheduleEndTime: _timestamp(data['scheduleEndTime']),
      dayKey: _str(data['dayKey']) ?? '',
      queueOrder: _int(data['queueOrder']) ?? 0,
      queueStatus: _str(data['queueStatus']) ?? '',
      checkInTeamAStatus: _checkInStatus(data['checkIn'], 'teamA'),
      checkInTeamBStatus: _checkInStatus(data['checkIn'], 'teamB'),
      servingTeamId: _str(data['servingTeamId']) ?? '',
      liveElapsedSec: _int(data['liveElapsedSec']) ?? 0,
      pointEventSeq: _int(data['pointEventSeq']) ?? 0,
      reportStatus: _reportStatus(data['report']),
      reportedByUid: _reportField(data['report'], 'reportedByUid') ?? '',
      teamAConfirmed: _reportBool(data['report'], 'teamAConfirmed'),
      teamBConfirmed: _reportBool(data['report'], 'teamBConfirmed'),
      bestOf: _bestOf(data['bestOf']),
      winnerAdvanceMatchNumber: _advanceMatchNumber(data['winnerAdvance']),
      winnerAdvanceSlot: _advanceSlot(data['winnerAdvance']),
    );
  }

  static int? _advanceMatchNumber(dynamic raw) {
    if (raw is! Map) return null;
    return _int(raw['matchNumber']);
  }

  static String? _advanceSlot(dynamic raw) {
    if (raw is! Map) return null;
    final slot = raw['teamSlot'];
    if (slot == 'teamAId') return 'A';
    if (slot == 'teamBId') return 'B';
    return null;
  }

  /// Formato da partida: aceita apenas 1 (set único) ou 3 (melhor de 3);
  /// qualquer outro valor (ou ausente) cai em 3.
  static int _bestOf(dynamic raw) {
    final value = _int(raw);
    return value == 1 ? 1 : 3;
  }

  static String _checkInStatus(dynamic raw, String teamKey) {
    if (raw is! Map) return '';
    final team = raw[teamKey];
    if (team is! Map) return '';
    return (team['status'] as String?)?.trim() ?? '';
  }

  static String _reportStatus(dynamic raw) {
    if (raw is! Map) return '';
    return (raw['status'] as String?)?.trim() ?? '';
  }

  static String? _reportField(dynamic raw, String key) {
    if (raw is! Map) return null;
    final v = raw[key];
    if (v is String && v.trim().isNotEmpty) return v.trim();
    return null;
  }

  static bool _reportBool(dynamic raw, String key) {
    if (raw is! Map) return false;
    return raw[key] == true;
  }

  static List<TournamentMatchPointAction> _mergePointActions(
    List<TournamentMatchPointAction> primary,
    List<TournamentMatchPointAction> secondary,
  ) {
    if (primary.isEmpty) return secondary;
    if (secondary.isEmpty) return primary;

    final merged = <TournamentMatchPointAction>[...primary, ...secondary];
    merged.sort((a, b) => a.ts.compareTo(b.ts));
    return merged;
  }

  static List<TournamentMatchPointAction> _lastActions(dynamic raw) {
    if (raw is! List) return const [];

    final actions = <TournamentMatchPointAction>[];
    for (final entry in raw) {
      if (entry is! Map) continue;
      final map = Map<String, dynamic>.from(entry);
      final type = _str(map['type']);
      final side = _str(map['side']);
      final setIndex = _int(map['setIndex']);
      final delta = _int(map['delta']) ?? 1;
      final ts = _timestamp(map['ts']);
      if (type == null ||
          side == null ||
          setIndex == null ||
          ts == null ||
          type.toLowerCase() != 'point') {
        continue;
      }
      final normalizedSide = side.toUpperCase();
      if (normalizedSide != 'A' && normalizedSide != 'B') continue;

      actions.add(
        TournamentMatchPointAction(
          type: type,
          side: normalizedSide,
          setIndex: setIndex,
          delta: delta,
          ts: ts,
        ),
      );
    }

    actions.sort((a, b) => a.ts.compareTo(b.ts));
    return actions;
  }

  static List<TournamentMatchSet> _sets(dynamic raw) {
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((e) => TournamentMatchSet.fromMap(Map<String, dynamic>.from(e)))
        .toList();
  }

  static String? _str(dynamic v) {
    if (v is String && v.trim().isNotEmpty) return v.trim();
    return null;
  }

  static int? _int(dynamic v) {
    if (v is int) return v;
    if (v is num) return v.toInt();
    return null;
  }

  static DateTime? _timestamp(dynamic value) {
    if (value == null) return null;
    if (value is Timestamp) return value.toDate().toUtc();
    if (value is DateTime) return value.toUtc();
    return null;
  }
}
