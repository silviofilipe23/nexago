/**
 * NexaSquad: lógica pura das telas 02 · Embaixadores e 04 · Candidaturas & convites.
 *
 * Status derivado do contrato, nível sugerido da candidatura, código pessoal, ciclo/vagas e o
 * relógio dos convites (lembretes e expiração). Sem Firestore: quem lê e grava é
 * `squad-applications.ts` / `squad-contracts.ts`.
 *
 * Espelhado à mão em `frontend/projects/backoffice/src/app/painel/squad/embaixadores/data/squad-program.ts`:
 * mudou aqui, muda lá.
 */
import type {SquadTier} from "./squad-rules";

export const DAY_MS = 24 * 60 * 60 * 1000;

// ── código pessoal ──────────────────────────────────────────────────────────

export const CODE_MIN = 4;
export const CODE_MAX = 12;
const CODE_RE = /^[A-Z0-9]{4,12}$/;

/** Maiúsculas, sem acento e sem espaço: "joão10 " → "JOAO10". Não valida. */
export function normalizeCode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "").toUpperCase();
}

export function isValidCode(code: string): boolean {
  return CODE_RE.test(code);
}

/** `PRIMEIRONOME10`, cortado para caber em 12. Nome sem letras vira `ATLETA10`. */
export function suggestedCodeFor(name: string): string {
  const first = normalizeCode(name.trim().split(/\s+/)[0] ?? "").replace(/[^A-Z]/g, "");
  const base = first.length >= 2 ? first : "ATLETA";
  return `${base.slice(0, CODE_MAX - 2)}10`;
}

// ── nível sugerido da candidatura ───────────────────────────────────────────

export const LEADS_GROUPS = ["no", "lt10", "10to30", "gt30"] as const;
export type LeadsGroup = (typeof LEADS_GROUPS)[number];

export interface TierSignals {
  leadsGroup: LeadsGroup | null;
  referredCount: number | null;
  /** Posição no ranking (1 = primeiro). */
  rankingPosition: number | null;
  followers: number | null;
  engagementPct: number | null;
  tournaments: number | null;
}

/** Na ordem da spec: Captain → Pro → Ambassador → Athlete. Sinal ausente não conta. */
export function suggestTier(s: TierSignals): SquadTier {
  const n = (v: number | null) => v ?? 0;
  if (s.leadsGroup === "10to30" || s.leadsGroup === "gt30" || n(s.referredCount) >= 15) return "cap";
  if ((s.rankingPosition !== null && s.rankingPosition <= 10) || n(s.followers) >= 40_000) return "pro";
  if (n(s.tournaments) >= 8 && (n(s.followers) >= 10_000 || n(s.engagementPct) >= 4)) return "amb";
  return "ath";
}

/** Borda laranja: Captain com ≥ 20 indicados, ou score de candidatura ≥ 80. */
export function isHotCandidate(input: {
  suggestedTier: SquadTier;
  referredCount: number | null;
  applicationScore: number | null;
}): boolean {
  return (input.suggestedTier === "cap" && (input.referredCount ?? 0) >= 20) ||
    (input.applicationScore ?? 0) >= 80;
}

// ── ciclo e vagas ───────────────────────────────────────────────────────────

export interface Cycle {
  id: string;
  /** Datas civis de São Paulo, inclusivas. */
  start: string;
  end: string;
  seats: number;
}

/** Sem `squadConfig/cycle`: o piloto de 90 dias com 20 vagas (o próximo começa em 07/12). */
export const DEFAULT_CYCLE: Cycle = {id: "piloto", start: "2026-09-08", end: "2026-12-06", seats: 20};

export function addDaysToKey(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function nextCycleStart(cycle: Cycle): string {
  return addDaysToKey(cycle.end, 1);
}

/** Contratos não encerrados e convites em aberto (enviado/aberto) seguram vaga. */
export function freeSeats(cycle: Cycle, liveContracts: number, outstandingInvites: number): number {
  return Math.max(0, cycle.seats - liveContracts - outstandingInvites);
}

// ── status derivado do contrato (tela 02) ──────────────────────────────────

export type ContractState = "active" | "paused" | "ended";
export type DerivedStatus = "ended" | "paused" | "at_risk" | "eligible" | "below_goal" | "active" | "active_start";

export const STATUS_LABELS: Record<DerivedStatus, string> = {
  ended: "Encerrado",
  paused: "Pausado",
  at_risk: "Em risco",
  eligible: "Elegível · promoção",
  below_goal: "Abaixo da meta",
  active: "Ativo",
  active_start: "Ativo · início",
};

export const START_DAYS = 30;
export const GOAL_DAY = 90;

export interface StatusRules {
  promotion: Array<{from: SquadTier; minConversions: number; minRoi: number | null}>;
  termination: {maxRoi: number};
}

/** Dias inteiros de contrato (0 no dia do aceite). */
export function contractDays(start: Date | null, now: Date): number {
  if (!start) return 0;
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / DAY_MS));
}

/** Ritmo projetado para o dia 90: conversões ÷ dias de contrato × 90 (dia 0 conta como 1). */
export function projectedConversions(conversions: number, days: number): number {
  return (conversions / Math.max(1, days)) * GOAL_DAY;
}

/** Receita ÷ custo; custo 0 não tem ROI. */
export function roiOf(revenueCents: number, costCents: number): number | null {
  return costCents > 0 ? revenueCents / costCents : null;
}

/**
 * Ordem de prioridade: Encerrado → Pausado → Em risco → Elegível → Abaixo da meta → Ativo.
 * Nos primeiros 30 dias não há "Em risco" nem "Abaixo da meta" (o ritmo ainda não diz nada):
 * mostra "Ativo · início", salvo quem já bate o critério de promoção.
 */
export function deriveStatus(input: {
  state: ContractState;
  tier: SquadTier;
  start: Date | null;
  conversions: number;
  roi: number | null;
  rules: StatusRules;
  now: Date;
}): DerivedStatus {
  if (input.state === "ended") return "ended";
  if (input.state === "paused") return "paused";
  const days = contractDays(input.start, input.now);
  const promo = input.rules.promotion.find((p) => p.from === input.tier) ?? null;
  const eligible = promo !== null && input.conversions >= promo.minConversions &&
    (promo.minRoi === null || (input.roi !== null && input.roi >= promo.minRoi));
  if (days < START_DAYS) return eligible ? "eligible" : "active_start";
  if (input.roi !== null && input.roi < input.rules.termination.maxRoi) return "at_risk";
  if (eligible) return "eligible";
  if (promo !== null && projectedConversions(input.conversions, days) < promo.minConversions / 2) {
    return "below_goal";
  }
  return "active";
}

export type Tone = "green" | "neutral" | "red" | "none";

/** ROI: verde ≥ 4x · neutro de 2,5 a 4x · vermelho abaixo de 2,5x · sem custo = "—". */
export function roiTone(roi: number | null): Tone {
  if (roi === null) return "none";
  if (roi >= 4) return "green";
  if (roi >= 2.5) return "neutral";
  return "red";
}

export type ScoreTone = "hot" | "warm" | "red" | "none";

/** Score: laranja ≥ 75 · laranja claro 55–74 · vermelho < 55 · sem Score = "—". */
export function scoreTone(score: number | null): ScoreTone {
  if (score === null) return "none";
  if (score >= 75) return "hot";
  if (score >= 55) return "warm";
  return "red";
}

// ── kanban (tela 04) ────────────────────────────────────────────────────────

export const STAGES = ["new", "review", "invited", "contract"] as const;
export type Stage = (typeof STAGES)[number] | "archived";
export type ArchivedReason = "rejected" | "waitlist" | "expired" | "canceled" | "accepted";

/**
 * Arrastar entre colunas vizinhas = a ação do card. O time só avança Novas → Em análise
 * ("Analisar") e Em análise → Convidados (abre o modal de convite); Contrato enviado é o
 * atleta abrindo o convite no app, e voltar coluna não existe na spec.
 */
export function dropAction(from: Stage, to: Stage): "review" | "invite" | null {
  if (from === "new" && to === "review") return "review";
  if (from === "review" && to === "invited") return "invite";
  return null;
}

// ── relógio do convite ──────────────────────────────────────────────────────

export type InviteStatus = "scheduled" | "sent" | "opened" | "accepted" | "expired" | "canceled";

export const INVITE_TTL_DAYS = 7;

export interface InviteClock {
  status: InviteStatus;
  sentAt: Date | null;
  openedAt: Date | null;
  expiresAt: Date | null;
  scheduledFor: string | null;
  reminders: string[];
}

export type SweepAction =
  | {kind: "send"}
  | {kind: "expire"}
  | {kind: "remind"; key: "sent_d3" | "opened_d1" | "opened_d3"};

/**
 * O que a varredura faz com um convite agora. Convidado que não abriu: lembrete D+3, expira D+7
 * (do envio). Abriu e não assinou: lembretes D+1 e D+3, expira D+7 (da abertura). Agendado:
 * envia no dia do início do ciclo (`todayKey` = data civil de SP).
 */
export function sweepAction(invite: InviteClock, now: Date, todayKey: string): SweepAction | null {
  const since = (d: Date | null) => (d ? (now.getTime() - d.getTime()) / DAY_MS : 0);
  const has = (key: string) => invite.reminders.includes(key);
  switch (invite.status) {
  case "scheduled":
    return invite.scheduledFor !== null && invite.scheduledFor <= todayKey ? {kind: "send"} : null;
  case "sent":
    if (invite.expiresAt && now >= invite.expiresAt) return {kind: "expire"};
    if (since(invite.sentAt) >= 3 && !has("sent_d3")) return {kind: "remind", key: "sent_d3"};
    return null;
  case "opened":
    if (invite.expiresAt && now >= invite.expiresAt) return {kind: "expire"};
    if (since(invite.openedAt) >= 3 && !has("opened_d3")) return {kind: "remind", key: "opened_d3"};
    if (since(invite.openedAt) >= 1 && !has("opened_d1")) return {kind: "remind", key: "opened_d1"};
    return null;
  default:
    return null;
  }
}

/** Nota automática do card ("Convite enviado há 3 dias · ainda não abriu"). */
export function inviteNote(invite: InviteClock, now: Date): string | null {
  const days = (d: Date | null) => (d ? Math.floor((now.getTime() - d.getTime()) / DAY_MS) : 0);
  const ago = (n: number) => (n <= 0 ? "hoje" : n === 1 ? "há 1 dia" : `há ${n} dias`);
  switch (invite.status) {
  case "scheduled": {
    const key = invite.scheduledFor;
    return key ? `Convite agendado para ${key.slice(8, 10)}/${key.slice(5, 7)} · próximo ciclo` : "Convite agendado";
  }
  case "sent":
    return `Convite enviado ${ago(days(invite.sentAt))} · ainda não abriu`;
  case "opened": {
    const d = days(invite.openedAt);
    const next = d < 1 ? "amanhã" : d < 3 ? (d === 2 ? "amanhã" : `em ${3 - d} dias`) : null;
    return next ? `Aguardando assinatura · lembrete automático ${next}` : "Aguardando assinatura · expira em breve";
  }
  default:
    return null;
  }
}
