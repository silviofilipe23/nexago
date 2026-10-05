import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/sports/sport_catalog.dart'
    show
        GamesLiveState,
        LiveGames,
        ScoreSetValue,
        ScoringRules,
        SetsGamesProfile;
import '../../tournaments/domain/tournament_match.dart';
import '../../tournaments/domain/tournament_match_serving_players.dart';
import '../../tournaments/domain/tournament_match_set.dart';
import '../../tournaments/domain/tournament_match_status.dart';
import '../domain/match_ops/match_serving_player_logic.dart';
import 'match_point_write.dart';

/// Caminho de games da mesa do app (spec multiesporte, 2b2). Espelho de
/// `buildGamesPointWrite`/`buildGamesUndoWrite` de `live-match-repository.ts`.

/// Perfil de games da partida, ou `null` (partida de pontos segue o motor de
/// sempre). Nº de sets vem de `match.bestOf`, o resto do carimbo.
SetsGamesProfile? gamesProfileOf(TournamentMatch match) {
  final stamped = match.scoringProfile;
  if (stamped == null) return null;
  final p = ScoringRules.withBestOf(stamped, match.bestOf);
  return p is SetsGamesProfile ? p : null;
}

ScoreSetValue _value(TournamentMatchSet s) => ScoreSetValue(
  s.a,
  s.b,
  tb: s.tb == null ? null : ScoreSetValue(s.tb!.a, s.tb!.b),
);

/// Estado da mesa antes do lance — gravado no evento para o desfazer repor.
Map<String, dynamic> gamesSnapshotOf(TournamentMatch match) => {
  'sets': match.sets.map((s) => s.toMap()).toList(),
  'currentSetIndex': match.currentSetIndex ?? 0,
  'currentGame': {'a': match.currentGame.a, 'b': match.currentGame.b},
  'servingTeamId': match.servingTeamId,
  'servingPlayerSlots': match.servingPlayers.toMap(),
  'servingPlayerSlot': match.servingPlayerSlot,
};

/// Estado da mesa de games lido do doc da partida.
GamesLiveState gamesLiveStateOf(TournamentMatch match) => (
  sets: [for (final s in match.sets) _value(s)],
  currentSetIndex: match.currentSetIndex ?? 0,
  currentGame: match.currentGame,
  servingTeamId: match.servingTeamId,
);

MatchPointWrite buildGamesPointWrite(
  TournamentMatch match,
  String side,
  SetsGamesProfile profile, {
  MatchRosterSizes rosterSizes = MatchRosterSizes.dupla,
}) {
  final setIndex = (match.currentSetIndex ?? 0).clamp(0, profile.bestOf - 1);
  final r = LiveGames.apply(
    gamesLiveStateOf(match),
    side,
    profile,
    teamAId: match.teamAId,
    teamBId: match.teamBId,
  );
  final st = r.state;
  final now = DateTime.now();
  final sets = <TournamentMatchSet>[
    for (var i = 0; i < st.sets.length; i++)
      TournamentMatchSet(
        a: st.sets[i].a,
        b: st.sets[i].b,
        tb: st.sets[i].tb == null
            ? null
            : (a: st.sets[i].tb!.a, b: st.sets[i].tb!.b),
        // Mesmo carimbo do motor de pontos: o 1º lance do set marca o início.
        startedAt:
            (i < match.sets.length ? match.sets[i].startedAt : null) ??
            (i == setIndex ? now : null),
        endedAt: i < match.sets.length ? match.sets[i].endedAt : null,
      ),
  ];
  final winnerId = r.winnerSide == 'A'
      ? match.teamAId
      : r.winnerSide == 'B'
      ? match.teamBId
      : null;
  final wins = ScoringRules.setsWon(st.sets, profile);
  final landed = st.sets.length > setIndex
      ? st.sets[setIndex]
      : const ScoreSetValue(0, 0);
  final slots = MatchServingPlayerLogic.withIndividualSlots(
    MatchServingPlayerLogic.slotsAfterScore(
      slots: match.servingPlayers,
      previousServingTeamId: match.servingTeamId,
      nextServingTeamId: st.servingTeamId,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      rosterSizes: rosterSizes,
    ),
    rosterSizes,
  );
  return MatchPointWrite(
    matchUpdate: {
      'sets': sets.map((s) => s.toMap()).toList(),
      'currentSetIndex': st.currentSetIndex,
      'currentGame': {'a': st.currentGame.a, 'b': st.currentGame.b},
      'status': winnerId != null
          ? TournamentMatchStatus.completed
          : TournamentMatchStatus.inProgress,
      'servingTeamId': st.servingTeamId,
      'servingPlayerSlots': slots.toMap(),
      'servingPlayerSlot': MatchServingPlayerLogic.servingPlayerSlot(
        slots: slots,
        servingTeamId: st.servingTeamId,
        teamAId: match.teamAId,
        teamBId: match.teamBId,
        rosterSizes: rosterSizes,
      ),
      if (winnerId != null) 'winnerId': winnerId,
      if (winnerId != null) 'matchEndedAt': FieldValue.serverTimestamp(),
      if (match.matchStartedAt == null)
        'matchStartedAt': FieldValue.serverTimestamp(),
      'resultA': '${wins.a}',
      'resultB': '${wins.b}',
    },
    pointEvent: {
      'type': 'point',
      'side': side,
      'setIndex': setIndex,
      'scoreA': landed.a,
      'scoreB': landed.b,
      'gameA': st.currentGame.a,
      'gameB': st.currentGame.b,
      'prev': gamesSnapshotOf(match),
    },
    result: (
      sets: sets,
      currentSetIndex: st.currentSetIndex,
      winnerId: winnerId,
      servingTeamId: st.servingTeamId,
    ),
    setIndex: setIndex,
  );
}

/// Desfazer de games: repõe o estado gravado no evento desfeito (decrementar
/// é ambíguo com games).
MatchPointWrite buildGamesUndoWrite(
  TournamentMatch match,
  String side,
  Map<String, dynamic> prev,
  SetsGamesProfile profile,
) {
  final rawSets = prev['sets'];
  final sets = <TournamentMatchSet>[
    if (rawSets is List)
      for (final s in rawSets)
        if (s is Map) TournamentMatchSet.fromMap(Map<String, dynamic>.from(s)),
  ];
  final idx = (prev['currentSetIndex'] as num?)?.toInt() ?? 0;
  final rawGame = prev['currentGame'];
  final gameA = rawGame is Map ? (rawGame['a'] as num?)?.toInt() ?? 0 : 0;
  final gameB = rawGame is Map ? (rawGame['b'] as num?)?.toInt() ?? 0 : 0;
  final rawServing = prev['servingTeamId'];
  final serving = rawServing is String ? rawServing : '';
  final rawSlots = prev['servingPlayerSlots'];
  final slots = rawSlots is Map
      ? MatchServingPlayers.fromMap(Map<String, dynamic>.from(rawSlots))
      : MatchServingPlayers.none;
  final rawSlot = prev['servingPlayerSlot'];
  final slot = rawSlot is int && rawSlot >= 1 && rawSlot <= 5 ? rawSlot : 0;
  final wins = ScoringRules.setsWon([for (final s in sets) _value(s)], profile);
  final cur = sets.length > idx
      ? sets[idx]
      : const TournamentMatchSet(a: 0, b: 0);
  return MatchPointWrite(
    matchUpdate: {
      'sets': sets.map((s) => s.toMap()).toList(),
      'currentSetIndex': idx,
      'currentGame': {'a': gameA, 'b': gameB},
      'status': TournamentMatchStatus.inProgress,
      'servingTeamId': serving,
      'servingPlayerSlots': slots.toMap(),
      'servingPlayerSlot': slot,
      'winnerId': FieldValue.delete(),
      'matchEndedAt': FieldValue.delete(),
      'resultA': '${wins.a}',
      'resultB': '${wins.b}',
    },
    pointEvent: {
      'type': 'undo-point',
      'side': side,
      'setIndex': idx,
      'scoreA': cur.a,
      'scoreB': cur.b,
      'gameA': gameA,
      'gameB': gameB,
    },
    result: (
      sets: sets,
      currentSetIndex: idx,
      winnerId: null,
      servingTeamId: serving,
    ),
    setIndex: idx,
  );
}
