import 'package:cloud_firestore/cloud_firestore.dart';

import '../../tournaments/domain/tournament_match.dart';
import '../../tournaments/domain/tournament_match_medical_timeout.dart';
import '../../tournaments/domain/tournament_match_set.dart';
import '../../tournaments/domain/tournament_match_status.dart';
import '../domain/match_ops/match_medical_timeout_logic.dart';
import '../domain/match_ops/match_scoring_logic.dart';
import '../domain/match_ops/match_serving_player_logic.dart';

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
  final slots = MatchServingPlayerLogic.slotsAfterScore(
    slots: match.servingPlayers,
    previousServingTeamId: match.servingTeamId,
    nextServingTeamId: result.servingTeamId,
    teamAId: match.teamAId,
    teamBId: match.teamBId,
  );

  return MatchPointWrite(
    matchUpdate: {
      'sets': result.sets.map((s) => s.toMap()).toList(),
      'currentSetIndex': result.currentSetIndex,
      'status': result.winnerId != null
          ? TournamentMatchStatus.completed
          : TournamentMatchStatus.inProgress,
      'servingTeamId': result.servingTeamId,
      'servingPlayerSlots': slots.toMap(),
      'servingPlayerSlot': MatchServingPlayerLogic.servingPlayerSlot(
        slots: slots,
        servingTeamId: result.servingTeamId,
        teamAId: match.teamAId,
        teamBId: match.teamBId,
      ),
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
  final slots = MatchServingPlayerLogic.slotsAfterUndo(
    slots: match.servingPlayers,
    nextServingTeamId: result.servingTeamId,
  );

  return MatchPointWrite(
    matchUpdate: {
      'sets': result.sets.map((s) => s.toMap()).toList(),
      'currentSetIndex': idx,
      'status': TournamentMatchStatus.inProgress,
      'servingTeamId': result.servingTeamId,
      'servingPlayerSlots': slots.toMap(),
      'servingPlayerSlot': MatchServingPlayerLogic.servingPlayerSlot(
        slots: slots,
        servingTeamId: result.servingTeamId,
        teamAId: match.teamAId,
        teamBId: match.teamBId,
      ),
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

/// Campos de uma troca MANUAL da dupla no saque ("Quem começa sacando?" e "Trocar saque"). Não
/// mexe na ordem declarada de cada dupla — só reaponta quem está sacando agora, que é o atleta
/// que aquela dupla já tinha na vez. Espelha `servingTeamFields` de `live-match-repository.ts`.
Map<String, dynamic> servingTeamFields(TournamentMatch match, String teamId) {
  return {
    'servingTeamId': teamId,
    'servingPlayerSlot': MatchServingPlayerLogic.servingPlayerSlot(
      slots: match.servingPlayers,
      servingTeamId: teamId,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
    ),
  };
}

/// Campos de "quem saca pela dupla X" — a faixa que aparece quando
/// [MatchServingPlayerLogic.needsServingPlayer], e também o "Trocar sacador".
Map<String, dynamic> servingPlayerFields(
  TournamentMatch match,
  String side,
  int slot,
) {
  final slots = match.servingPlayers.withSide(side, slot);
  return {
    'servingPlayerSlots': slots.toMap(),
    'servingPlayerSlot': MatchServingPlayerLogic.servingPlayerSlot(
      slots: slots,
      servingTeamId: match.servingTeamId,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
    ),
  };
}

/// Abre o tempo médico de um atleta: grava o atendimento em andamento, marca a cota do atleta
/// como usada e registra o chamado na timeline — é o que sobra de auditoria depois que o
/// atendimento termina e o campo some do doc.
///
/// Devolve `null` quando o atleta já usou o dele, quando outro atendimento está rolando ou
/// quando a partida já encerrou: a mesma guarda do ponto, avaliada sobre o doc FRESCO da
/// transação. Espelha `buildMedicalTimeoutStartWrite` de `live-match-repository.ts`.
MatchPointWrite? buildMedicalTimeoutStartWrite(
  TournamentMatch match, {
  required String side,
  required int playerSlot,
  required String playerName,
}) {
  if (match.isCompleted || match.isCanceled) return null;
  if (!MatchMedicalTimeoutLogic.canRequest(
    usedKeys: match.medicalTimeoutPlayers,
    active: match.medicalTimeout,
    side: side,
    slot: playerSlot,
  )) {
    return null;
  }

  final setIndex = _clampedSetIndex(match);
  final current = match.sets.length > setIndex ? match.sets[setIndex] : null;
  final teamId = side.toUpperCase() == 'A' ? match.teamAId : match.teamBId;

  return MatchPointWrite(
    matchUpdate: {
      'medicalTimeout': {
        'side': side.toUpperCase(),
        'teamId': teamId,
        'playerSlot': playerSlot,
        'playerName': playerName,
        // Carimbo do SERVIDOR: é ele que faz app, mesas web e telão mostrarem a mesma
        // contagem sem nenhuma escrita durante os 5 minutos.
        'startedAt': FieldValue.serverTimestamp(),
        'durationSec': medicalTimeoutSeconds,
        'setIndex': setIndex,
      },
      'medicalTimeoutPlayers': [
        ...match.medicalTimeoutPlayers,
        MatchMedicalTimeoutLogic.playerKey(side, playerSlot),
      ],
    },
    pointEvent: {
      'type': 'medical-timeout',
      'side': side.toUpperCase(),
      'setIndex': setIndex,
      'scoreA': current?.a ?? 0,
      'scoreB': current?.b ?? 0,
      'playerSlot': playerSlot,
    },
    result: (
      sets: match.sets,
      currentSetIndex: match.currentSetIndex ?? 0,
      winnerId: null,
      servingTeamId: match.servingTeamId,
    ),
    setIndex: setIndex,
  );
}

/// Encerra o atendimento (com ou sem os 5 minutos cheios) — o campo sai do doc e a mesa volta a
/// marcar ponto. A cota do atleta NÃO volta: chamado é chamado.
MatchPointWrite? buildMedicalTimeoutEndWrite(TournamentMatch match) {
  final active = match.medicalTimeout;
  if (active == null) return null;

  final setIndex = _clampedSetIndex(match);
  final current = match.sets.length > setIndex ? match.sets[setIndex] : null;

  return MatchPointWrite(
    matchUpdate: {'medicalTimeout': FieldValue.delete()},
    pointEvent: {
      'type': 'medical-timeout-end',
      'side': active.side,
      'setIndex': setIndex,
      'scoreA': current?.a ?? 0,
      'scoreB': current?.b ?? 0,
      'playerSlot': active.playerSlot,
    },
    result: (
      sets: match.sets,
      currentSetIndex: match.currentSetIndex ?? 0,
      winnerId: null,
      servingTeamId: match.servingTeamId,
    ),
    setIndex: setIndex,
  );
}
