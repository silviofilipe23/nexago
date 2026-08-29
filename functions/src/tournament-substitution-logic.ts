/**
 * Substituição de atleta em inscrição de torneio — lógica pura.
 *
 * Regra de negócio: a troca é permitida ATÉ a publicação das chaves da
 * categoria (`categoryOps[categoryId].bracketStatus`). Dupla: qualquer membro
 * troca qualquer vaga; equipe (trio+): só o capitão, e nunca a própria vaga.
 * Efeitos (Firestore, Asaas, notificações) ficam em tournament-substitution.ts.
 */
import {MIN_TEAM_CATEGORY_SIZE} from "./tournament-team-category";

export type SubstitutionBlockReason =
  | "bracket_published"
  | "tournament_cancelled"
  | "category_completed";

export const SUBSTITUTION_BLOCK_MESSAGES: Record<SubstitutionBlockReason, string> = {
  bracket_published:
    "As chaves desta categoria já foram publicadas — substituições não são " +
    "mais possíveis. Fale com o organizador.",
  tournament_cancelled: "Este torneio foi cancelado.",
  category_completed: "Categoria já concluída.",
};

export const SUBSTITUTION_MEMBER_LEFT_MESSAGE = "Este atleta já saiu da equipe.";

/**
 * Motivo do bloqueio da substituição, ou `null` quando permitida.
 *
 * `categoryKeys` são as chaves equivalentes da categoria
 * (`resolveCategoryMatchKeys`): o organizador grava `categoryOps` pela chave
 * que o painel usa, e inscrições legadas podem usar o nome — checar todas.
 * `draft` NÃO trava: a chave em rascunho referencia `teamId`, que não muda.
 */
export function substitutionBlockReason(
  tournament: Record<string, unknown>,
  category: Record<string, unknown> | null,
  categoryKeys: Set<string>,
): SubstitutionBlockReason | null {
  const statusNorm = String(tournament.listingStatus ?? tournament.status ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ");
  if (["cancelled", "canceled", "cancelado", "cancelada"].includes(statusNorm)) {
    return "tournament_cancelled";
  }
  if (category?.isCompleted === true) return "category_completed";

  const ops = tournament.categoryOps;
  if (ops && typeof ops === "object") {
    for (const key of categoryKeys) {
      const entry = (ops as Record<string, unknown>)[key];
      if (!entry || typeof entry !== "object") continue;
      const bracketStatus = String(
        (entry as Record<string, unknown>).bracketStatus ?? "",
      ).trim();
      if (bracketStatus === "published" || bracketStatus === "completed") {
        return "bracket_published";
      }
    }
  }
  return null;
}

/** Erro de permissão de vaga, ou `null` quando o iniciador pode trocar. */
export function substitutionPermissionError(params: {
  initiatorUid: string;
  replacedUid: string;
  inviteeUid: string;
  participantUids: string[];
  /** `registrationTeamSize(registration, category)` — 2 = dupla. */
  teamSize: number;
  /** `""` quando dupla (sem capitão). */
  captainUid: string;
}): string | null {
  const {initiatorUid, replacedUid, inviteeUid, participantUids, teamSize, captainUid} = params;
  if (!participantUids.includes(initiatorUid)) {
    return "Você não é um dos atletas desta inscrição.";
  }
  if (!participantUids.includes(replacedUid)) {
    return "Este atleta não está nesta inscrição.";
  }
  if (participantUids.includes(inviteeUid)) {
    return "Este atleta já está nesta inscrição.";
  }
  if (inviteeUid === initiatorUid) {
    return "Você não pode se convidar como substituto.";
  }
  if (teamSize >= MIN_TEAM_CATEGORY_SIZE) {
    if (initiatorUid !== captainUid) {
      return "Apenas o capitão pode substituir atletas da equipe.";
    }
    if (replacedUid === captainUid) {
      return "O capitão não pode ser substituído.";
    }
  }
  return null;
}

/**
 * Troca [outUid] por [inUid] preservando a POSIÇÃO — os slots de uniforme da
 * dupla dependem do índice em `participantUids` (0 = Player1, 1 = Player2).
 */
export function replaceUidInList(list: string[], outUid: string, inUid: string): string[] {
  return list.map((id) => (id === outUid ? inUid : id));
}
