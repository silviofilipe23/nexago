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
