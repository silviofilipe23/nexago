import 'package:cloud_firestore/cloud_firestore.dart';

import '../../tournaments/domain/tournament_match.dart';
import '../../tournaments/domain/tournament_match_medical_timeout.dart';
import '../../tournaments/domain/tournament_match_serving_players.dart';
import '../../tournaments/domain/tournament_match_set.dart';
import '../../tournaments/domain/tournament_match_status.dart';
import '../domain/match_ops/match_medical_timeout_logic.dart';
import '../domain/match_ops/match_scoring_logic.dart';
import '../domain/match_ops/match_serving_player_logic.dart';
import 'games_point_write.dart';

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
///
/// [rosterSizes] é o elenco de cada lado, que o doc da partida não conhece: a mesa passa o que
/// carregou dos docs de `teams`, e é o que faz a individual (1) e a equipe (3–5) não caírem na
/// alternância da dupla.
MatchPointWrite? buildPointWrite(
  TournamentMatch match,
  String side, {
  MatchRosterSizes rosterSizes = MatchRosterSizes.dupla,
}) {
  if (match.isCompleted) return null;
  final games = gamesProfileOf(match);
  if (games != null) {
    return buildGamesPointWrite(match, side, games, rosterSizes: rosterSizes);
  }

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
  final slots = MatchServingPlayerLogic.withIndividualSlots(
    MatchServingPlayerLogic.slotsAfterScore(
      slots: match.servingPlayers,
      previousServingTeamId: match.servingTeamId,
      nextServingTeamId: result.servingTeamId,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      rosterSizes: rosterSizes,
    ),
    rosterSizes,
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
        rosterSizes: rosterSizes,
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
///
/// Partida de games repõe o [prev] gravado no evento (spec multiesporte, 2b2);
/// sem [prev] devolve `null` e o desfazer não faz nada. [landed] é o placar
/// que o ponto desfeito deixou: se o doc já não está nele (outra mesa marcou
/// depois e a timeline desta está atrasada), também devolve `null` — repor o
/// [prev] apagaria o ponto da outra mesa sem `undo-point`.
MatchPointWrite? buildUndoWrite(
  TournamentMatch match,
  String side,
  int setIndex, {
  Map<String, dynamic>? prev,
  ({int scoreA, int scoreB, int gameA, int gameB})? landed,
  MatchRosterSizes rosterSizes = MatchRosterSizes.dupla,
}) {
  final games = gamesProfileOf(match);
  if (games != null) {
    if (prev == null) return null;
    if (landed != null) {
      final set = setIndex < match.sets.length
          ? match.sets[setIndex]
          : const TournamentMatchSet(a: 0, b: 0);
      final game = match.currentGame;
      if (set.a != landed.scoreA ||
          set.b != landed.scoreB ||
          game.a != landed.gameA ||
          game.b != landed.gameB) {
        return null;
      }
    }
    return buildGamesUndoWrite(match, side, prev, games);
  }
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
  final slots = MatchServingPlayerLogic.withIndividualSlots(
    MatchServingPlayerLogic.slotsAfterUndo(
      slots: match.servingPlayers,
      nextServingTeamId: result.servingTeamId,
    ),
    rosterSizes,
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
        rosterSizes: rosterSizes,
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
Map<String, dynamic> servingTeamFields(
  TournamentMatch match,
  String teamId, {
  MatchRosterSizes rosterSizes = MatchRosterSizes.dupla,
}) {
  // Individual: grava o titular na ordem do lado, para as mesas que não sabem o elenco.
  final slots = MatchServingPlayerLogic.withIndividualSlots(
    match.servingPlayers,
    rosterSizes,
  );
  return {
    if (slots != match.servingPlayers) 'servingPlayerSlots': slots.toMap(),
    'servingTeamId': teamId,
    'servingPlayerSlot': MatchServingPlayerLogic.servingPlayerSlot(
      slots: slots,
      servingTeamId: teamId,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      rosterSizes: rosterSizes,
    ),
  };
}

/// Campos de "quem saca pela dupla X" — a faixa que aparece quando
/// [MatchServingPlayerLogic.needsServingPlayer], e também o "Trocar sacador".
Map<String, dynamic> servingPlayerFields(
  TournamentMatch match,
  String side,
  int slot, {
  MatchRosterSizes rosterSizes = MatchRosterSizes.dupla,
}) {
  final slots = match.servingPlayers.withSide(side, slot);
  return {
    'servingPlayerSlots': slots.toMap(),
    'servingPlayerSlot': MatchServingPlayerLogic.servingPlayerSlot(
      slots: slots,
      servingTeamId: match.servingTeamId,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      rosterSizes: rosterSizes,
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

/// Duração do tempo técnico (1 minuto) publicada no doc — o overlay de transmissão conta a
/// partir do `startedAt` do servidor.
const technicalTimeoutSeconds = 60;

/// Publica o tempo técnico no doc da partida pro overlay de transmissão enxergar. O placar do
/// set corrente vai junto: o overlay esconde a tela quando qualquer ponto é marcado depois.
/// `null` quando a partida já encerrou/cancelou.
MatchPointWrite? buildTechnicalTimeoutStartWrite(
  TournamentMatch match, {
  required String side,
}) {
  if (match.isCompleted || match.isCanceled) return null;

  final upperSide = side.toUpperCase();
  final setIndex = _clampedSetIndex(match);
  final current = match.sets.length > setIndex ? match.sets[setIndex] : null;
  final teamId = upperSide == 'A' ? match.teamAId : match.teamBId;

  return MatchPointWrite(
    matchUpdate: {
      'technicalTimeout': {
        'side': upperSide,
        'teamId': teamId,
        'startedAt': FieldValue.serverTimestamp(),
        'durationSec': technicalTimeoutSeconds,
        'setIndex': setIndex,
        'scoreA': current?.a ?? 0,
        'scoreB': current?.b ?? 0,
      },
    },
    pointEvent: {
      'type': 'technical-timeout',
      'side': upperSide,
      'setIndex': setIndex,
      'scoreA': current?.a ?? 0,
      'scoreB': current?.b ?? 0,
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

/// Tira o tempo técnico do doc. Sempre devolve o write (deletar campo ausente é inofensivo);
/// o evento de fim registra o placar do set corrente.
MatchPointWrite buildTechnicalTimeoutEndWrite(TournamentMatch match) {
  final setIndex = _clampedSetIndex(match);
  final current = match.sets.length > setIndex ? match.sets[setIndex] : null;

  return MatchPointWrite(
    matchUpdate: {'technicalTimeout': FieldValue.delete()},
    pointEvent: {
      'type': 'technical-timeout-end',
      'setIndex': setIndex,
      'scoreA': current?.a ?? 0,
      'scoreB': current?.b ?? 0,
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
