import {isMatchCompleted, normalizeMatchType} from "./match-status";

export interface CompletionMatch {
  categoryId: string;
  matchType: string;
  status: unknown;
}

/**
 * Verdadeiro para a decisão do título da categoria.
 *
 * `koc_final` entra aqui porque a rodada final do King of the Court É a decisão
 * — a tabela dela é o pódio, não existe "jogo da final". Sem esta linha a
 * categoria termina e o TORNEIO nunca fecha.
 *
 * `normalizeMatchType` troca `_` por espaço, daí a grafia com espaço.
 */
export function isFinalMatchType(matchType: string): boolean {
  const normalized = normalizeMatchType(matchType);
  return normalized === "final" || normalized === "koc final";
}

/**
 * O torneio está concluído quando TODAS as categorias têm uma grande final
 * já concluída. Categorias sem final concluída (inclusive sem chave gerada)
 * bloqueiam a conclusão — evita encerrar o torneio cedo demais.
 */
export function allCategoryFinalsComplete(
  categoryIds: string[],
  matches: CompletionMatch[],
): boolean {
  const ids = categoryIds.map((c) => c.trim()).filter((c) => c.length > 0);
  if (ids.length === 0) return false;
  return ids.every((catId) =>
    matches.some(
      (m) =>
        m.categoryId === catId &&
        isFinalMatchType(m.matchType) &&
        isMatchCompleted(m.status),
    ),
  );
}

/** Status que já são terminais — não devem ser sobrescritos por "completed". */
export function isTerminalListingStatus(status: unknown): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  return s === "completed" || s === "concluido" || s === "concluído" ||
    s === "cancelled" || s === "canceled" || s === "cancelado";
}
