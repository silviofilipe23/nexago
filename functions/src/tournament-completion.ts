import {isMatchCompleted} from "./match-status";

export interface CompletionMatch {
  categoryId: string;
  matchType: string;
  status: unknown;
}

/** Verdadeiro para a partida que decide o título (grande final). */
export function isFinalMatchType(matchType: string): boolean {
  return String(matchType ?? "").trim().toLowerCase() === "final";
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
