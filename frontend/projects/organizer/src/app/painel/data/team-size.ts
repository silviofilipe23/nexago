/** Tamanho da equipe nas telas do painel (multiesporte fase 4b1).
 *
 *  Convenção histórica: `teamSize` nulo = dupla, 3–5 = equipe nomeada. A categoria individual
 *  (`teamSize: 1`, só em esporte que aceita — tênis) entra como valor próprio: tratar "não
 *  nulo" como "equipe" faria a individual cair no fluxo de equipe nomeada. */

/** `teamSize` do doc: 1 (individual) ou 3–5 (equipe); qualquer outra coisa é dupla (`null`). */
export function parseTeamSizeField(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isInteger(n)) return null;
  return n === 1 || (n >= 3 && n <= 5) ? n : null;
}

/** Equipe nomeada (trio+): elenco por `uniformByUid`, capitão, nome da equipe. */
export function isNamedTeamSize(size: number | null | undefined): boolean {
  return size != null && size >= 3;
}

/** Quantos atletas a inscrição pede (dupla = 2). */
export function rosterSizeFromField(size: number | null | undefined): number {
  return size ?? 2;
}

/** "atleta" / "dupla" / "equipe" para rótulos de tela. */
export function participantUnit(
  size: number | null | undefined,
  opts: { plural?: boolean; capitalized?: boolean } = {},
): string {
  const base = size === 1 ? 'atleta' : isNamedTeamSize(size) ? 'equipe' : 'dupla';
  const word = opts.plural ? `${base}s` : base;
  return opts.capitalized ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}
