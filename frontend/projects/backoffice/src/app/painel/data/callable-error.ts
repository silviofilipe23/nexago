/** Mensagem em português para erros de callable (`functions/<code>`). */
export function callableErrorMessage(error: unknown): string {
  const code = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : '';
  const message =
    typeof (error as { message?: unknown })?.message === 'string' ? (error as { message: string }).message : '';

  if (code.includes('unauthenticated')) {
    return 'Sua sessão expirou. Entre de novo para continuar.';
  }
  if (code.includes('permission-denied')) {
    return message || 'Sua conta não tem permissão de administrador da plataforma.';
  }
  if (code.includes('not-found')) {
    return 'Usuário não encontrado neste projeto do Firebase.';
  }
  if (code.includes('unavailable') || code.includes('deadline-exceeded')) {
    return 'Sem resposta do servidor. Verifique a conexão e tente de novo.';
  }
  return message || 'Não foi possível concluir a operação.';
}
