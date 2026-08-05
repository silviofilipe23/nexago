/// Regras puras do fluxo de verificação de telefone por SMS.
///
/// Espelham `phone-verification.util.ts` do portal web — os dois clientes
/// precisam concordar sobre o que é um número válido e sobre quando vincular
/// (`link`) em vez de trocar (`update`) a credencial de telefone.
library;

/// Converte um telefone BR em qualquer formatação aceita por
/// `ProfileCompletionValidators.isValidWhatsApp` para E.164
/// (`+55DDD9XXXXXXXX`), exigido pelo Firebase Phone Auth.
///
/// Devolve `null` quando o número não bate com nenhum formato conhecido —
/// chamar `verifyPhoneNumber` com lixo só rende `invalid-phone-number`.
String? toE164Br(String raw) {
  final digits = raw.replaceAll(RegExp(r'\D'), '');
  if (digits.length >= 10 && digits.length <= 11) {
    return '+55$digits';
  }
  if (digits.length >= 12 && digits.length <= 13 && digits.startsWith('55')) {
    return '+$digits';
  }
  return null;
}

/// Como vincular a credencial de telefone à conta já logada.
enum PhoneLinkMethod {
  /// Primeira verificação: `User.linkWithCredential`.
  link,

  /// Conta já tem telefone vinculado: `User.updatePhoneNumber`.
  update,
}

/// O Firebase rejeita `linkWithCredential` com `provider-already-linked`
/// quando a conta já tem uma credencial de telefone — nesse caso o caminho
/// certo para trocar de número é `updatePhoneNumber`.
PhoneLinkMethod phoneLinkMethod(Iterable<String> providerIds) {
  return providerIds.contains('phone')
      ? PhoneLinkMethod.update
      : PhoneLinkMethod.link;
}
