/**
 * "A chave desta categoria já saiu?" — leitura única de `categoryOps[categoria].bracketStatus`.
 *
 * Nasceu dentro de `substitutionBlockReason` e saiu de lá quando o passe de vaga
 * ([[tournament-spot-pass]]) passou a fazer a MESMA pergunta: as duas features precisam
 * concordar sobre o instante em que a competição deixa de aceitar mexida no elenco, e duas
 * cópias da leitura acabariam divergindo no primeiro torneio legado.
 *
 * Puro de propósito (sem Firestore): é o formato do documento que é delicado, não o acesso.
 */

/** `bracketStatus` que significam "a chave existe e vale" — `draft` NÃO entra. */
const PUBLISHED_BRACKET_STATUSES = ["published", "completed"] as const;

/**
 * `true` quando a chave da categoria já foi publicada (ou concluída).
 *
 * `categoryKeys` são as chaves equivalentes da categoria (`resolveCategoryMatchKeys`): o painel
 * grava `categoryOps` pela chave que ele usa, e torneio legado referencia a categoria pelo
 * próprio nome — checar todas é o que evita ler "sem chave" numa categoria que já tem chave.
 *
 * `draft` fica de fora porque a chave em rascunho referencia `teamId`, que não muda quando o
 * elenco muda.
 */
export function categoryBracketPublished(
  tournament: Record<string, unknown> | null | undefined,
  categoryKeys: Iterable<string>,
): boolean {
  const ops = tournament?.categoryOps;
  if (!ops || typeof ops !== "object") return false;

  for (const key of categoryKeys) {
    const entry = (ops as Record<string, unknown>)[key];
    if (!entry || typeof entry !== "object") continue;
    const status = String(
      (entry as Record<string, unknown>).bracketStatus ?? "",
    ).trim();
    if ((PUBLISHED_BRACKET_STATUSES as readonly string[]).includes(status)) {
      return true;
    }
  }
  return false;
}
