import 'package:firebase_core/firebase_core.dart';

/// Traduz uma exceção de `deleteOwnAccount` em mensagem PT amigável,
/// preservando a distinção que o servidor já faz entre "nada foi apagado
/// ainda" e "dados já apagados, só a conta de acesso não pôde ser removida"
/// (ver `functions/src/account-deletion.ts`) — sem isso, o usuário pode
/// tentar excluir de novo achando que nada ocorreu quando os dados já
/// sumiram.
String friendlyAccountDeletionError(Object error) {
  if (error is FirebaseException) {
    return friendlyAccountDeletionErrorFromCode(
      code: error.code,
      message: error.message,
    );
  }
  return friendlyAccountDeletionErrorFromCode(code: null, message: null);
}

/// Mapeamento puro (testável sem construir uma exceção real).
String friendlyAccountDeletionErrorFromCode({String? code, String? message}) {
  final msg = message?.trim() ?? '';
  switch (code) {
    case 'unauthenticated':
      return 'Sua sessão expirou. Entre novamente para excluir a conta.';
    case 'unavailable':
    case 'deadline-exceeded':
      return 'Sem conexão. Verifique a internet e tente de novo.';
    case 'internal':
      // O servidor já devolve mensagem em PT específica para os dois casos
      // (falha ao apagar dados vs. dados apagados mas auth não removida).
      return msg.isNotEmpty
          ? msg
          : 'Não foi possível excluir a conta agora. Tente novamente.';
  }
  return 'Não foi possível excluir a conta agora. Tente novamente.';
}
