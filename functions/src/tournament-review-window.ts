import {Timestamp} from "firebase-admin/firestore";
import {registrationAthleteUids} from "./tournament-registration-pix-helpers";
import {
  DAY_MS,
  HOUR_MS,
  REVIEW_END_GRACE_HOURS,
  REVIEW_LOOKBACK_DAYS,
  REVIEW_REMINDER_AFTER_DAYS,
} from "./tournament-review-constants";

function millis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

const NEVER_REVIEWED = new Set(["draft", "cancelled", "canceled", "cancelado"]);
const COMPLETED = new Set(["completed", "concluido", "concluído"]);

export type ReviewCandidateReason = "completed" | "ended";

/**
 * Por que o torneio entra na abertura de janela de hoje. Revalida as duas consultas do job
 * (o mesmo torneio pode vir pelas duas) e protege contra data legada fora de Timestamp.
 */
export function reviewCandidateReason(
  tournament: Record<string, unknown>,
  nowMs: number,
): ReviewCandidateReason | null {
  const status = String(tournament.listingStatus ?? tournament.status ?? "").trim().toLowerCase();
  if (NEVER_REVIEWED.has(status)) return null;
  const lookbackStart = nowMs - REVIEW_LOOKBACK_DAYS * DAY_MS;

  const completedAt = millis(tournament.completedAt);
  if (COMPLETED.has(status) && completedAt != null && completedAt >= lookbackStart && completedAt <= nowMs) {
    return "completed";
  }
  const endAt = millis(tournament.endAt);
  if (endAt != null && endAt >= lookbackStart && endAt <= nowMs - REVIEW_END_GRACE_HOURS * HOUR_MS) {
    return "ended";
  }
  return null;
}

/** "Confirmada" = entrou na chave: o mesmo filtro de `paidTeamIds` em organizer-category-ops.ts. */
export function isConfirmedInscription(inscription: Record<string, unknown>): boolean {
  const teamId = typeof inscription.teamId === "string" ? inscription.teamId.trim() : "";
  return teamId.length > 0 &&
    inscription.isPaid === true &&
    inscription.waitlist !== true &&
    inscription.partnerPending !== true;
}

/**
 * Quem recebe convite: atletas das inscrições confirmadas, um por pessoa mesmo jogando em duas
 * categorias, sem quem gerencia o torneio. Equipe sumida cai nos uids da própria inscrição
 * (`registrationAthleteUids`).
 */
export function reviewEligibleUids(
  inscriptions: ReadonlyArray<Record<string, unknown>>,
  teamsById: ReadonlyMap<string, Record<string, unknown>>,
  excludeUids: Iterable<string>,
): string[] {
  const excluded = new Set(excludeUids);
  const out = new Set<string>();
  for (const inscription of inscriptions) {
    if (!isConfirmedInscription(inscription)) continue;
    const teamId = (inscription.teamId as string).trim();
    for (const uid of registrationAthleteUids(inscription, teamsById.get(teamId) ?? null)) {
      if (!excluded.has(uid)) out.add(uid);
    }
  }
  return [...out].sort();
}

export type ReviewWindowAction = "close" | "remind" | "none";

/** O que o job de hoje faz com um resumo. Fechar ganha de lembrar: no 14º dia ninguém recebe
 *  "ainda dá tempo". */
export function reviewWindowAction(summary: Record<string, unknown>, nowMs: number): ReviewWindowAction {
  if (summary.status !== "open") return "none";
  const closesAt = millis(summary.closesAt);
  if (closesAt != null && closesAt <= nowMs) return "close";
  const opensAt = millis(summary.opensAt);
  if (summary.reminderSentAt == null && opensAt != null &&
    opensAt + REVIEW_REMINDER_AFTER_DAYS * DAY_MS <= nowMs) {
    return "remind";
  }
  return "none";
}
