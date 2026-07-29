/** Mensagens amigáveis para códigos comuns do Firebase Auth. */
export function mapFirebaseAuthError(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: string }).code)
      : '';

  switch (code) {
    case 'auth/invalid-email':
      return 'E-mail inválido.';
    case 'auth/user-disabled':
      return 'Esta conta foi desativada.';
    case 'auth/user-not-found':
      return 'Não encontramos uma conta com este e-mail.';
    case 'auth/wrong-password':
      return 'Senha incorreta.';
    case 'auth/invalid-credential':
      return 'E-mail ou senha incorretos. Verifique e tente de novo.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas. Tente de novo em alguns minutos.';
    case 'auth/network-request-failed':
      return 'Sem conexão. Verifique a internet.';
    case 'auth/email-already-in-use':
      return 'Já existe uma conta com este e-mail.';
    case 'auth/weak-password':
      return 'Senha muito fraca. Use ao menos 8 caracteres, com maiúscula e número.';
    case 'auth/expired-action-code':
      return 'Este link expirou. Peça um novo.';
    case 'auth/invalid-action-code':
      return 'Este link já foi usado ou é inválido. Peça um novo.';
    // Erros de login social (popup Google/Apple). Sem casos próprios eles caíam no
    // genérico abaixo, escondendo problemas de configuração do Firebase.
    case 'auth/unauthorized-domain':
      return 'Este domínio não está liberado para login social no Firebase. Avise o suporte.';
    case 'auth/popup-blocked':
      return 'Seu navegador bloqueou a janela de login. Libere pop-ups para este site e tente de novo.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'A janela de login foi fechada antes de concluir. Tente de novo.';
    case 'auth/operation-not-allowed':
      return 'Este método de login está indisponível no momento.';
    case 'auth/account-exists-with-different-credential':
      return 'Já existe uma conta com este e-mail criada por outro método de login. Entre pelo método original.';
    case 'auth/invalid-verification-code':
      return 'Código incorreto. Confira os 6 dígitos e tente de novo.';
    case 'auth/invalid-verification-id':
      return 'Essa verificação expirou. Peça um novo código.';
    case 'auth/quota-exceeded':
      return 'Limite de envios de SMS atingido. Tente novamente mais tarde.';
    case 'auth/invalid-phone-number':
      return 'Número de telefone inválido.';
    case 'auth/credential-already-in-use':
      return 'Este número já está vinculado a outra conta.';
    case 'auth/captcha-check-failed':
      return 'Não foi possível confirmar que você não é um robô. Tente novamente.';
    case 'auth/provider-already-linked':
      return 'Esta conta já tem um telefone vinculado.';
    default:
      if (code.startsWith('auth/')) {
        return 'Não foi possível entrar. Tente novamente.';
      }
      return error instanceof Error ? error.message : 'Erro inesperado.';
  }
}
