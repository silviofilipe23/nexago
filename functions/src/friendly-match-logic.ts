import type {FriendlyMatchConfig} from "./friendly-match-config";
import {levelRank} from "./category-level-eligibility";

/**
 * Lógica pura do Bora Jogar: máquina de estados, score de compatibilidade,
 * janelas de check-in/cancelamento e agenda de lembretes.
 *
 * Tudo aqui é determinístico e sem I/O — as callables e sweepers importam
 * daqui para que as regras de negócio fiquem testáveis isoladamente.
 */

export type FriendlyMatchStatus =
  | "filling"
  | "confirmed"
  | "unfilled"
  | "cancelled"
  | "no_show"
  | "completed"
  | "reviewed";

export type SlotStatus = "invited" | "accepted" | "declined" | "expired" | "countered";

export type FriendlyMatchObjective = "training" | "friendly" | "partner";

export type CompatibilityProfile = {
  levelsBySport?: Record<string, unknown>;
  city?: string;
  state?: string;
  lookingForPartner?: boolean;
  reputationScore?: number;
};

export type CompatibilityBreakdown = {
  levelProximity: number;
  location: number;
  objective: number;
  reputation: number;
};

export type ConfirmationSchedule = {
  checkInOpenAtMs: number;
  checkInCloseAtMs: number;
  reminder24hAtMs: number | null;
  reminder2hAtMs: number | null;
};

export type CheckInWindowState = "not_open" | "open" | "closed";

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/**
 * Transições válidas do JOGO. `filling` substitui `sent`/`countered` de
 * antes — pelo menos uma vaga ainda não foi aceita. `unfilled` é novo:
 * `scheduledAt` chegou com o jogo ainda em `filling`.
 */
export const VALID_TRANSITIONS: Record<FriendlyMatchStatus, readonly FriendlyMatchStatus[]> = {
  filling: ["confirmed", "cancelled", "unfilled"],
  confirmed: ["cancelled", "no_show", "completed"],
  completed: ["reviewed"],
  unfilled: [],
  cancelled: [],
  no_show: [],
  reviewed: [],
};

export function canTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from as FriendlyMatchStatus];
  return allowed != null && allowed.includes(to as FriendlyMatchStatus);
}

/**
 * Transições válidas da VAGA dentro de um jogo em `filling`. `countered` só
 * é alcançável quando o jogo tem uma única vaga (`slotsTotal === 1`) — quem
 * chama garante isso antes de transicionar, esta função só valida a forma.
 * `declined`/`expired` voltam pra `invited` quando o organizador repõe a
 * vaga com outro atleta.
 */
export const VALID_SLOT_TRANSITIONS: Record<SlotStatus, readonly SlotStatus[]> = {
  invited: ["accepted", "declined", "expired", "countered"],
  countered: ["accepted", "declined", "expired"],
  accepted: [],
  declined: ["invited"],
  expired: ["invited"],
};

export function canTransitionSlot(from: string, to: string): boolean {
  const allowed = VALID_SLOT_TRANSITIONS[from as SlotStatus];
  return allowed != null && allowed.includes(to as SlotStatus);
}

/** Normaliza cidade/UF para comparação (caixa, acentos, espaços). */
function normalizePlace(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Pesos (máximos) do score v1: nível 40, localização 25, objetivo 15,
 * reputação 20 — total 100. Dado ausente vale neutro, nunca zero, para não
 * afundar novato (cold start, spec §9.3).
 */
function levelProximityPoints(input: {
  sport: string;
  sender: CompatibilityProfile;
  recipient: CompatibilityProfile;
}): number {
  const senderRank = levelRank(input.sender.levelsBySport?.[input.sport]);
  const recipientRank = levelRank(input.recipient.levelsBySport?.[input.sport]);
  if (senderRank == null || recipientRank == null) return 20;
  const diff = Math.abs(senderRank - recipientRank);
  if (diff === 0) return 40;
  if (diff === 1) return 30;
  if (diff === 2) return 15;
  return 5;
}

function locationPoints(sender: CompatibilityProfile, recipient: CompatibilityProfile): number {
  const cityA = normalizePlace(sender.city);
  const cityB = normalizePlace(recipient.city);
  const stateA = normalizePlace(sender.state);
  const stateB = normalizePlace(recipient.state);
  if ((!cityA && !stateA) || (!cityB && !stateB)) return 8;
  if (stateA && stateB && stateA !== stateB) return 0;
  if (cityA && cityB && cityA === cityB) return 25;
  if (stateA && stateB && stateA === stateB) return 12;
  return 8;
}

function objectivePoints(
  objective: FriendlyMatchObjective,
  recipient: CompatibilityProfile,
): number {
  if (objective === "partner") return recipient.lookingForPartner === true ? 15 : 5;
  return 10;
}

function reputationPoints(recipient: CompatibilityProfile): number {
  const score = recipient.reputationScore;
  if (typeof score !== "number" || !Number.isFinite(score)) return 14;
  const clamped = Math.min(100, Math.max(0, score));
  return Math.round((clamped / 100) * 20);
}

export function computeCompatibilityScore(input: {
  sport: string;
  objective: FriendlyMatchObjective;
  sender: CompatibilityProfile;
  recipient: CompatibilityProfile;
}): {score: number; breakdown: CompatibilityBreakdown} {
  const breakdown: CompatibilityBreakdown = {
    levelProximity: levelProximityPoints(input),
    location: locationPoints(input.sender, input.recipient),
    objective: objectivePoints(input.objective, input.recipient),
    reputation: reputationPoints(input.recipient),
  };
  const total =
    breakdown.levelProximity + breakdown.location + breakdown.objective + breakdown.reputation;
  return {score: Math.min(100, Math.max(0, Math.round(total))), breakdown};
}

/**
 * Deriva janela de check-in e horários de lembrete do horário confirmado.
 * Lembrete que já ficou no passado (confirmação em cima da hora) sai como
 * null — o sweeper não deve disparar lembrete atrasado.
 */
export function computeConfirmationSchedule(
  chosenTimeMs: number,
  config: FriendlyMatchConfig,
  nowMs: number,
): ConfirmationSchedule {
  const reminder24h = chosenTimeMs - 24 * HOUR_MS;
  const reminder2h = chosenTimeMs - 2 * HOUR_MS;
  return {
    checkInOpenAtMs: chosenTimeMs - config.checkInWindow.beforeMinutes * MINUTE_MS,
    checkInCloseAtMs: chosenTimeMs + config.checkInWindow.afterHours * HOUR_MS,
    reminder24hAtMs: reminder24h > nowMs ? reminder24h : null,
    reminder2hAtMs: reminder2h > nowMs ? reminder2h : null,
  };
}

export function resolveCheckInWindowState(
  openAtMs: number,
  closeAtMs: number,
  nowMs: number,
): CheckInWindowState {
  if (nowMs < openAtMs) return "not_open";
  if (nowMs > closeAtMs) return "closed";
  return "open";
}

/** Penaliza quando falta menos que a janela de antecedência (ou já passou). */
export function isCancellationPenalized(
  scheduledAtMs: number,
  nowMs: number,
  config: FriendlyMatchConfig,
): boolean {
  return scheduledAtMs - nowMs < config.cancellationPenaltyWindowHours * HOUR_MS;
}

export function isInviteExpired(expiresAtMs: number, nowMs: number): boolean {
  return nowMs > expiresAtMs;
}
