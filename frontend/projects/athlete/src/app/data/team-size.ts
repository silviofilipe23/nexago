/** `teamSize` dos docs no portal do atleta (multiesporte fase 4c): 1 = individual, 3–5 = equipe
 *  nomeada, resto = dupla (`null`). Tratar "não nulo" como "equipe" faria a individual cair no
 *  fluxo de elenco. */
export function parseTeamSizeField(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isInteger(n)) return null;
  return n === 1 || (n >= 3 && n <= 5) ? n : null;
}
