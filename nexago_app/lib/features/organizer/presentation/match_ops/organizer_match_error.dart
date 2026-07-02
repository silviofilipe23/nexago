import 'package:firebase_core/firebase_core.dart';

import '../../domain/match_ops/match_ops_logic.dart';

/// Traduz uma exceção lançada ao salvar/lançar placar em mensagem PT amigável.
/// Cobre tanto `FirebaseFunctionsException` (callables) quanto
/// `FirebaseException` (escritas diretas no Firestore) — ambas são
/// subclasses de [FirebaseException] e expõem `code`/`message`.
String friendlyMatchScoreError(Object error) {
  if (error is FirebaseException) {
    return MatchOpsLogic.friendlyScoreError(
      code: error.code,
      message: error.message,
    );
  }
  return MatchOpsLogic.friendlyScoreError(code: null, message: null);
}

/// Mensagem amigável para falhas de agendamento (H1–H3).
/// As callables já devolvem mensagens em PT (ex. "Quadra ocupada neste
/// horário."); aqui só evitamos vazar o dump cru da exceção na UI.
String friendlyScheduleError(Object error) {
  if (error is FirebaseException) {
    // internal/unknown vêm com mensagem técnica em inglês — não exibir.
    const opaqueCodes = {'internal', 'unknown', 'unavailable'};
    final message = error.message?.trim() ?? '';
    if (message.isNotEmpty &&
        !opaqueCodes.contains(error.code.toLowerCase()) &&
        message.toUpperCase() != message) {
      return message;
    }
  }
  return 'Não foi possível agendar a partida. Tente novamente.';
}
