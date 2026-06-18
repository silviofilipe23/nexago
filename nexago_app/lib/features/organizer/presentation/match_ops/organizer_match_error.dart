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
