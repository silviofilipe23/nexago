/**
 * Erro do Firestore/Storage em português para a tela. A mensagem crua ("Missing or insufficient
 * permissions.") nunca chega ao usuário.
 */
export function clubErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'PartnerExistsError') return error.message;
  const code = String((error as { code?: unknown })?.code ?? '');
  if (code.includes('unauthenticated') || code === 'storage/unauthenticated') {
    return 'Sua sessão expirou. Entre de novo para continuar.';
  }
  if (code.includes('permission-denied') || code === 'storage/unauthorized') {
    return 'Sem permissão para gravar. O clube é editado só por admin, e o dado precisa estar dentro das regras.';
  }
  if (code.includes('not-found') || code === 'storage/object-not-found') {
    return 'Não encontrado: pode ter sido excluído por outra pessoa. Recarregue a página.';
  }
  if (code.includes('failed-precondition')) {
    return 'Falta um índice no Firestore para esta consulta. Avise o time de produto.';
  }
  if (code.includes('unavailable') || code.includes('deadline-exceeded') || code === 'storage/retry-limit-exceeded') {
    return 'Sem resposta do servidor. Verifique a conexão e tente de novo.';
  }
  if (code === 'storage/canceled') return 'Envio cancelado.';
  return 'Não foi possível concluir. Tente de novo.';
}

/**
 * Erro das callables do clube (`notifyBenefitPartner`, `importBenefitRedemptions`). O servidor manda
 * frase pronta em `permission-denied`, `invalid-argument` e `failed-precondition`; "NOT FOUND" cru é
 * a função que ainda não foi publicada neste ambiente.
 */
export function clubCallableErrorMessage(error: unknown): string {
  const code = String((error as { code?: unknown })?.code ?? '').replace(/^functions\//, '');
  const raw = (error as { message?: unknown })?.message;
  const message = typeof raw === 'string' ? raw.trim() : '';
  const sentence = message.length > 8 && /\s/.test(message) && message !== message.toUpperCase() ? message : '';
  if (code === 'unauthenticated') return 'Sua sessão expirou. Entre de novo para continuar.';
  if (code === 'not-found' && !sentence) return 'A função ainda não foi publicada neste ambiente. Avise o time de produto.';
  if (['permission-denied', 'invalid-argument', 'failed-precondition', 'already-exists', 'not-found'].includes(code) && sentence) {
    return sentence;
  }
  if (code === 'permission-denied') return 'Sua conta não tem permissão de administrador da plataforma.';
  if (code === 'unavailable' || code === 'deadline-exceeded') return 'Sem resposta do servidor. Verifique a conexão e tente de novo.';
  return 'Não foi possível concluir. Tente de novo.';
}
