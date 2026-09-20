import 'package:cloud_functions/cloud_functions.dart';

import '../../../core/firebase/functions_region.dart';

/// Mesa da rodada King of the Court.
///
/// Todas as mutações passam por callable: as rules de `matches` só liberam
/// campos de placar de duelo, e a rodada não tem placar de duelo. O cliente
/// nunca escreve estado da rodada direto.
///
/// O `FirebaseFunctionsException` sai CRU de propósito — a tela inspeciona
/// `details['reason']` (`koc_unresolved_tie`, `koc_seq_mismatch`,
/// `koc_round_already_started`) para decidir se abre um diálogo ou recarrega.
/// Embrulhar num Exception de mensagem mataria essas decisões.
class OrganizerKocOpsService {
  OrganizerKocOpsService({FirebaseFunctions? functions})
      : _functions = functions ?? nexagoFunctions;

  final FirebaseFunctions _functions;

  Future<void> startRound({
    required String matchId,
    bool restart = false,
  }) async {
    await _functions.httpsCallable('kocStartRound').call({
      'matchId': matchId.trim(),
      if (restart) 'restart': true,
    });
  }

  /// [expectedSeq] é o número do rally que a mesa acredita estar registrando.
  /// Num ritmo alto e com rede ruim, o duplo toque reenviaria o mesmo rally;
  /// com o seq, o servidor recusa em vez de criar um ponto fantasma.
  Future<void> registerRally({
    required String matchId,
    required bool kingWon,
    int? expectedSeq,
  }) async {
    await _functions.httpsCallable('kocRegisterRally').call({
      'matchId': matchId.trim(),
      'winner': kingWon ? 'king' : 'challenger',
      if (expectedSeq != null) 'expectedSeq': expectedSeq,
    });
  }

  Future<void> undoRally({required String matchId}) async {
    await _functions.httpsCallable('kocUndoRally').call({
      'matchId': matchId.trim(),
    });
  }

  Future<void> pauseClock({required String matchId}) =>
      _setClock(matchId: matchId, action: 'pause');

  Future<void> resumeClock({required String matchId}) =>
      _setClock(matchId: matchId, action: 'resume');

  Future<void> setRoundDuration({
    required String matchId,
    required int durationSec,
  }) => _setClock(
    matchId: matchId,
    action: 'setDuration',
    extra: {'durationSec': durationSec},
  );

  /// Ajuste fino de ±1 min. Com uma quadra e rodadas em sequência, é o que
  /// recupera horário depois de um estouro sem cortar rodada.
  Future<void> nudgeClock({
    required String matchId,
    required int deltaSec,
  }) => _setClock(
    matchId: matchId,
    action: 'nudge',
    extra: {'deltaSec': deltaSec},
  );

  Future<void> _setClock({
    required String matchId,
    required String action,
    Map<String, dynamic> extra = const {},
  }) async {
    await _functions.httpsCallable('kocSetClock').call({
      'matchId': matchId.trim(),
      'action': action,
      ...extra,
    });
  }

  /// [acceptTiebreak] confirma o desempate automático quando há empate
  /// decidindo vaga. Sem ele o servidor RECUSA encerrar, para a bola de ouro
  /// ser jogada na areia em vez de a vaga sair de um critério silencioso.
  Future<void> finishRound({
    required String matchId,
    bool acceptTiebreak = false,
  }) async {
    await _functions.httpsCallable('kocFinishRound').call({
      'matchId': matchId.trim(),
      if (acceptTiebreak) 'acceptTiebreak': true,
    });
  }
}
