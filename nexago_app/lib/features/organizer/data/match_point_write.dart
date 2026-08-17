import 'package:cloud_firestore/cloud_firestore.dart';

import '../../tournaments/domain/tournament_match.dart';
import '../../tournaments/domain/tournament_match_set.dart';
import '../../tournaments/domain/tournament_match_status.dart';
import '../domain/match_ops/match_scoring_logic.dart';

/// O que o motor devolve ao mexer no placar — mesmo formato de [MatchScoringLogic.applyPoint].
typedef MatchPointResult = ({
  List<TournamentMatchSet> sets,
  int currentSetIndex,
  String? winnerId,
  String servingTeamId,
});

/// O que uma marcação escreve: os campos do doc da partida e o evento da timeline, mais o
/// resultado do motor pra tela reagir (encerrou a partida? virou o set?).
class MatchPointWrite {
  const MatchPointWrite({
    required this.matchUpdate,
    required this.pointEvent,
    required this.result,
    required this.setIndex,
  });

  final Map<String, dynamic> matchUpdate;
  final Map<String, dynamic> pointEvent;
  final MatchPointResult result;

  /// Set em que a marcação caiu — é o `setIndex` gravado no evento.
  final int setIndex;
}

/// `currentSetIndex` do doc preso ao formato — partida antiga pode trazer índice fora da faixa.
int _clampedSetIndex(TournamentMatch match) {
  return (match.currentSetIndex ?? 0).clamp(0, match.bestOf - 1);
}

/// Monta a escrita de UM ponto a partir do doc — espelha `buildPointWrite` de
/// `live-match-repository.ts`, então as três mesas (app, organizador e portal do atleta) gravam
/// exatamente estes campos. Recebe o doc em vez de calcular na tela porque quem chama é a
/// transação, com a versão fresca em mãos (ver `recordPointTransaction`).
///
/// Devolve `null` quando a partida já está encerrada no doc: nesse caso a outra mesa (ou o ponto
/// anterior) fechou a partida enquanto esta tela ainda mostrava "ao vivo", e somar ponto em
/// partida encerrada reabriria uma chave que o servidor já avançou.
MatchPointWrite? buildPointWrite(TournamentMatch match, String side) {
  if (match.isCompleted) return null;

  final setIndex = _clampedSetIndex(match);
  final result = MatchScoringLogic.applyPoint(
    sets: match.sets,
    currentSetIndex: match.currentSetIndex ?? 0,
    side: side,
    teamAId: match.teamAId,
    teamBId: match.teamBId,
    bestOf: match.bestOf,
  );
  final wins = MatchScoringLogic.setsWon(result.sets, bestOf: match.bestOf);
  final current = result.sets.length > setIndex ? result.sets[setIndex] : null;

  return MatchPointWrite(
    matchUpdate: {
      'sets': result.sets.map((s) => s.toMap()).toList(),
      'currentSetIndex': result.currentSetIndex,
      'status': result.winnerId != null
          ? TournamentMatchStatus.completed
          : TournamentMatchStatus.inProgress,
      'servingTeamId': result.servingTeamId,
      if (result.winnerId != null) 'winnerId': result.winnerId,
      if (result.winnerId != null) 'matchEndedAt': FieldValue.serverTimestamp(),
      if (match.matchStartedAt == null)
        'matchStartedAt': FieldValue.serverTimestamp(),
      'resultA': '${wins.a}',
      'resultB': '${wins.b}',
    },
    pointEvent: {
      'type': 'point',
      'side': side,
      'setIndex': setIndex,
      'scoreA': current?.a ?? 0,
      'scoreB': current?.b ?? 0,
    },
    result: result,
    setIndex: setIndex,
  );
}

/// Escrita do "desfazer": tira o ponto do lado que o marcou, no set do evento desfeito.
/// [setIndex] vem da timeline (identifica QUAL ponto sai); o placar sai do doc recebido.
MatchPointWrite buildUndoWrite(
  TournamentMatch match,
  String side,
  int setIndex,
) {
  final result = MatchScoringLogic.undoPoint(
    sets: match.sets,
    currentSetIndex: setIndex,
    side: side,
    teamAId: match.teamAId,
    teamBId: match.teamBId,
    bestOf: match.bestOf,
  );
  final wins = MatchScoringLogic.setsWon(result.sets, bestOf: match.bestOf);
  final idx = result.currentSetIndex;
  final current = result.sets.length > idx ? result.sets[idx] : null;

  return MatchPointWrite(
    matchUpdate: {
      'sets': result.sets.map((s) => s.toMap()).toList(),
      'currentSetIndex': idx,
      'status': TournamentMatchStatus.inProgress,
      'servingTeamId': result.servingTeamId,
      'winnerId': FieldValue.delete(),
      'matchEndedAt': FieldValue.delete(),
      'resultA': '${wins.a}',
      'resultB': '${wins.b}',
    },
    pointEvent: {
      'type': 'undo-point',
      'side': side,
      'setIndex': idx,
      'scoreA': current?.a ?? 0,
      'scoreB': current?.b ?? 0,
    },
    result: (
      sets: result.sets,
      currentSetIndex: idx,
      winnerId: null,
      servingTeamId: result.servingTeamId,
    ),
    setIndex: idx,
  );
}
