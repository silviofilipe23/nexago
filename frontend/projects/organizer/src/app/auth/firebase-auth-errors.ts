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
    case 'auth/invalid-credential':
      return 'E-mail ou senha incorretos. Verifique e tente de novo.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas. Tente de novo em alguns minutos.';
    case 'auth/network-request-failed':
      return 'Sem conexão. Verifique a internet.';
    case 'auth/email-already-in-use':
      return 'Já existe uma conta com este e-mail. Tente entrar.';
    case 'auth/weak-password':
      return 'Senha fraca. Use no mínimo 8 caracteres, com maiúscula e número.';
    case 'auth/expired-action-code':
      return 'Este link expirou. Peça um novo link de redefinição.';
    case 'auth/invalid-action-code':
      return 'Link inválido ou já usado. Peça um novo link de redefinição.';
    case 'auth/operation-not-allowed':
      return 'Este método de login não está habilitado no projeto.';
    // Erros do popup de login social. Sem casos próprios eles caem no genérico
    // abaixo, que esconde problemas de configuração (domínio não autorizado).
    case 'auth/popup-blocked':
      return 'Seu navegador bloqueou a janela do Google. Libere pop-ups para este site e tente de novo.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'A janela do Google foi fechada antes de concluir. Tente de novo.';
    case 'auth/unauthorized-domain':
      return 'Este domínio não está liberado para login com Google no Firebase. Avise o suporte.';
    case 'auth/account-exists-with-different-credential':
      return 'Já existe uma conta com este e-mail criada por outro método de login. Entre pelo método original.';
    default:
      if (code.startsWith('auth/')) {
        return 'Não foi possível concluir. Tente novamente.';
      }
      return error instanceof Error ? error.message : 'Erro inesperado.';
  }
}
