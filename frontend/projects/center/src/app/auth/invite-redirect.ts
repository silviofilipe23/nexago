/** Destino pós-login só se for caminho interno (`/x`, nunca `//host`). */
export function validRedirect(redirect: string | null): string | null {
  return redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : null;
}
