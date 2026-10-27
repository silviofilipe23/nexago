import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/athlete_rating_repository.dart';

/// Uma partida no histórico de pontos de nível do atleta — lida do ledger
/// `ratingEvents` da engine (`pre`/`post` por atleta).
class LevelPointsEntry {
  const LevelPointsEntry({
    required this.endedAt,
    required this.before,
    required this.after,
    required this.win,
  });

  final DateTime endedAt;
  final int before;
  final int after;
  final bool win;

  int get delta => after - before;
}

/// Entrada do atleta num doc de `ratingEvents`; `null` para W.O. (a engine
/// não rateia), correção pendente ou atleta fora do evento.
LevelPointsEntry? levelPointsEntryFromEvent(
  Map<String, dynamic> data,
  String athleteId,
) {
  if (data['status'] == 'skipped' || data['walkover'] == true) return null;
  final pre = data['pre'];
  final post = data['post'];
  final endedAt = data['endedAt'];
  if (pre is! Map || post is! Map || endedAt is! Timestamp) return null;
  final before = pre[athleteId];
  final after = post[athleteId];
  if (before is! Map || after is! Map) return null;
  final r0 = before['r'];
  final r1 = after['r'];
  if (r0 is! num || r1 is! num) return null;

  bool onTeam(Object? team) {
    if (team is! Map) return false;
    final ids = team['athleteIds'];
    return ids is List && ids.contains(athleteId);
  }

  final teamA = data['teamA'];
  final myTeam = onTeam(teamA) ? teamA : data['teamB'];
  final myTeamId = myTeam is Map ? myTeam['teamId'] : null;
  return LevelPointsEntry(
    endedAt: endedAt.toDate(),
    before: r0.round(),
    after: r1.round(),
    win: myTeamId != null && data['winnerTeamId'] == myTeamId,
  );
}

class LevelPointsSummary {
  const LevelPointsSummary({
    required this.start,
    required this.current,
    required this.peak,
    required this.wins,
    required this.losses,
  });

  final int start;
  final int current;
  final int peak;
  final int wins;
  final int losses;

  int get delta => current - start;
  int get matches => wins + losses;
}

/// Resumo do histórico já ordenado; `null` sem partidas.
LevelPointsSummary? summarizeLevelPoints(List<LevelPointsEntry> history) {
  if (history.isEmpty) return null;
  var peak = history.first.before;
  var wins = 0;
  for (final entry in history) {
    if (entry.after > peak) peak = entry.after;
    if (entry.win) wins++;
  }
  return LevelPointsSummary(
    start: history.first.before,
    current: history.last.after,
    peak: peak,
    wins: wins,
    losses: history.length - wins,
  );
}

/// Histórico de pontos de nível do atleta logado no esporte, da partida mais
/// antiga à mais recente.
final levelPointsHistoryProvider = FutureProvider.autoDispose
    .family<List<LevelPointsEntry>, String>((ref, sportCode) {
  return ref
      .watch(athleteRatingRepositoryProvider)
      .loadOwnLevelPointsHistory(sportCode);
});
