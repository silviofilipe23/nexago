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
    default:
      if (code.startsWith('auth/')) {
        return 'Não foi possível entrar. Tente novamente.';
      }
      return error instanceof Error ? error.message : 'Erro inesperado.';
  }
}
