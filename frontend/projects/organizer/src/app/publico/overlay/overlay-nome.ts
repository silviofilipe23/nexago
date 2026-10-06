/** Nome de atleta como o overlay mostra: no máximo os DOIS primeiros nomes; se o segundo for uma
 *  partícula (do, da, dos, das, de), leva o terceiro também.
 *  "Maria Eduarda Albuquerque" → "Maria Eduarda"; "João da Silva Santos" → "João da Silva". */
const PARTICULAS = new Set(['do', 'da', 'dos', 'das', 'de']);

export function nomeCurtoDe(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter((p) => p !== '');
  if (palavras.length <= 2) return palavras.join(' ');
  const segundoEParticula = PARTICULAS.has(palavras[1]!.toLowerCase());
  return palavras.slice(0, segundoEParticula ? 3 : 2).join(' ');
}

/** Dupla/equipe vem como "A / B": cada atleta é encurtado, o separador fica. */
export function nomesCurtosDe(nomes: string): string {
  return nomes
    .split(/\s*\/\s*/)
    .map(nomeCurtoDe)
    .filter((n) => n !== '')
    .join(' / ');
}
