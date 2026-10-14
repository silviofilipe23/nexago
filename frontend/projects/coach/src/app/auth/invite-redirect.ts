/** Destino pós-login só se for caminho interno (`/x`, nunca `//host`). */
export function validRedirect(redirect: string | null): string | null {
  return redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : null;
}

/** O destino é um convite da comissão técnica? Quem chega por ele entra só como membro,
 *  sem ganhar um painel de treinador próprio (vazio). */
export function isInviteRedirect(redirect: string | null): boolean {
  return validRedirect(redirect)?.startsWith('/convite-equipe/') ?? false;
}
