/**
 * Cancelamento do plano de aula pelo aluno (canvas "Cancelar plano de aula · aviso prévio e multa") —
 * parte pura: regras do plano e a conta do aviso prévio e da multa.
 *
 *   classPlans.cancellation          regras da arena (aviso prévio + multa por quebra de fidelidade)
 *   enrollment.cancellationPolicy    cópia congelada na matrícula: vale o que estava no contrato
 *
 * - Aviso prévio: as aulas e as mensalidades seguem até o fim do aviso (`endsOn`).
 * - Multa só quando sai antes do fim da fidelidade (trimestral/semestral): % × valor mensal ×
 *   mensalidades que faltariam depois do aviso até o fim da fidelidade (ou um valor fixo).
 * - Mensal: sem multa. Anual à vista: encerra no fim do período pago, sem reembolso e sem multa.
 */
import {HttpsError} from "firebase-functions/v2/https";

type Data = Record<string, unknown>;

export const NOTICE_DAYS = [0, 15, 30] as const;
export const PENALTY_KINDS = ["none", "percent", "fixed"] as const;
export type PenaltyKind = typeof PENALTY_KINDS[number];
export const PENALTY_PERCENTS = [30, 50, 100] as const;
export const PENALTY_DUE_DAYS = 3;
export const CANCEL_REASONS = ["routine", "price", "health", "moved", "other"] as const;
export type CancelReason = typeof CANCEL_REASONS[number];

export const CANCEL_REASON_LABEL: Record<CancelReason, string> = {
  routine: "Mudança de rotina ou horário",
  price: "Valor do plano",
  health: "Lesão ou saúde",
  moved: "Mudei de cidade",
  other: "Outro motivo",
};

export interface CancellationPolicy {
  noticeDays: number;
  penalty: {kind: PenaltyKind; percent: number | null; amountReais: number | null};
}

/** Padrão (plano sem regra gravada): 30 dias de aviso e multa de 50% das mensalidades que faltam. */
export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = {
  noticeDays: 30,
  penalty: {kind: "percent", percent: 50, amountReais: null},
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function parseCancellationPolicy(raw: unknown): CancellationPolicy {
  const d = raw != null && typeof raw === "object" && !Array.isArray(raw) ? raw as Data : null;
  if (!d) return {...DEFAULT_CANCELLATION_POLICY, penalty: {...DEFAULT_CANCELLATION_POLICY.penalty}};
  const notice = Number(d["noticeDays"]);
  const p = (d["penalty"] ?? {}) as Data;
  const kind = (PENALTY_KINDS as readonly string[]).includes(String(p["kind"])) ? p["kind"] as PenaltyKind : "none";
  const percent = Number(p["percent"]);
  const amount = Number(p["amountReais"]);
  return {
    noticeDays: Number.isInteger(notice) && notice >= 0 && notice <= 90 ? notice : DEFAULT_CANCELLATION_POLICY.noticeDays,
    penalty: {
      kind,
      percent: kind === "percent" && Number.isFinite(percent) && percent > 0 && percent <= 100 ? Math.round(percent) : null,
      amountReais: kind === "fixed" && Number.isFinite(amount) && amount > 0 ? round2(amount) : null,
    },
  };
}

/** `cancellation` vindo do portal. Ausente = não mexe. Lança `invalid-argument`. */
export function validateCancellationPolicy(input: Data): {cancellation?: CancellationPolicy} {
  if (input["cancellation"] === undefined) return {};
  const raw = input["cancellation"];
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new HttpsError("invalid-argument", "Regras de cancelamento inválidas.");
  }
  const d = raw as Data;
  const notice = Number(d["noticeDays"]);
  if (!Number.isInteger(notice) || notice < 0 || notice > 90) {
    throw new HttpsError("invalid-argument", "Aviso prévio: de 0 a 90 dias.");
  }
  const p = (d["penalty"] ?? {}) as Data;
  const kind = String(p["kind"] ?? "none");
  if (!(PENALTY_KINDS as readonly string[]).includes(kind)) throw new HttpsError("invalid-argument", "Tipo de multa inválido.");
  if (kind === "percent") {
    const pct = Number(p["percent"]);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) throw new HttpsError("invalid-argument", "Multa: de 1% a 100%.");
  }
  if (kind === "fixed") {
    const v = Number(p["amountReais"]);
    if (!Number.isFinite(v) || v <= 0 || v > 100000) throw new HttpsError("invalid-argument", "Valor da multa inválido.");
  }
  return {cancellation: parseCancellationPolicy(raw)};
}

// ── datas ──────────────────────────────────────────────────────────────

function parseKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y ?? 2000, (m ?? 1) - 1, d ?? 1));
}

function toKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysKey(key: string, days: number): string {
  const d = parseKey(key);
  d.setUTCDate(d.getUTCDate() + days);
  return toKey(d);
}

/** Último dia do mês `AAAA-MM`. */
export function lastDayOfMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return toKey(new Date(Date.UTC(y ?? 2000, m ?? 1, 0)));
}

/** Mensalidades (meses de calendário) entre duas datas, mês começado conta inteiro: 20/12 → 19/02 = 2. */
export function monthsBetweenCeil(fromKey: string, toKey2: string): number {
  if (toKey2 <= fromKey) return 0;
  const [y1, m1, d1] = fromKey.split("-").map(Number);
  const [y2, m2, d2] = toKey2.split("-").map(Number);
  const months = ((y2 ?? 0) - (y1 ?? 0)) * 12 + ((m2 ?? 1) - (m1 ?? 1)) + ((d2 ?? 1) > (d1 ?? 1) ? 1 : 0);
  return Math.max(1, months);
}

// ── a conta ────────────────────────────────────────────────────────────

export type CancellationKind = "monthly" | "commitment" | "prepaid" | "package";

export interface CancellationQuote {
  kind: CancellationKind;
  requestedOn: string;
  /** Última aula (fim do aviso ou do período pago). */
  endsOn: string;
  noticeDays: number;
  commitmentEndsOn: string | null;
  /** Mensalidades que faltariam depois do aviso até o fim da fidelidade. */
  remainingMonths: number;
  monthlyPriceReais: number;
  penalty: {kind: PenaltyKind; percent: number | null; amountReais: number};
  penaltyDueDate: string | null;
}

export interface QuoteInput {
  policy: CancellationPolicy;
  planKind: string;
  prepaidMonths: number;
  commitmentEndsOn: string | null;
  billedThrough: string | null;
  /** Pacote: fim da validade. */
  expiresOn: string | null;
  monthlyPriceReais: number;
  todayKey: string;
}

export function cancellationQuote(input: QuoteInput): CancellationQuote {
  const {policy, todayKey} = input;
  const base = {
    requestedOn: todayKey,
    noticeDays: policy.noticeDays,
    commitmentEndsOn: input.commitmentEndsOn,
    monthlyPriceReais: input.monthlyPriceReais,
  };
  const noPenalty = {kind: "none" as PenaltyKind, percent: null, amountReais: 0};
  if (input.planKind === "package") {
    return {...base, kind: "package", endsOn: todayKey, remainingMonths: 0, penalty: noPenalty, penaltyDueDate: null};
  }
  if (input.prepaidMonths > 1) {
    // Anual à vista: encerra no fim do que já foi pago, sem reembolso e sem multa.
    const paidEnd = input.billedThrough ? lastDayOfMonthKey(input.billedThrough) : addDaysKey(todayKey, policy.noticeDays);
    return {...base, kind: "prepaid", endsOn: paidEnd < todayKey ? todayKey : paidEnd, remainingMonths: 0, penalty: noPenalty, penaltyDueDate: null};
  }
  const endsOn = addDaysKey(todayKey, policy.noticeDays);
  if (!input.commitmentEndsOn || input.commitmentEndsOn <= endsOn) {
    return {...base, kind: input.commitmentEndsOn ? "commitment" : "monthly", endsOn, remainingMonths: 0, penalty: noPenalty, penaltyDueDate: null};
  }
  const remainingMonths = monthsBetweenCeil(endsOn, input.commitmentEndsOn);
  const p = policy.penalty;
  const amountReais = p.kind === "percent" ? round2(input.monthlyPriceReais * remainingMonths * (p.percent ?? 0) / 100) :
    p.kind === "fixed" ? round2(p.amountReais ?? 0) : 0;
  return {
    ...base,
    kind: "commitment",
    endsOn,
    remainingMonths,
    penalty: amountReais > 0 ? {kind: p.kind, percent: p.percent, amountReais} : noPenalty,
    penaltyDueDate: amountReais > 0 ? addDaysKey(todayKey, PENALTY_DUE_DAYS) : null,
  };
}

/** Texto para o contrato (`{{cancelamento.aviso}}` e `{{cancelamento.multa}}`). */
export function noticeClause(policy: CancellationPolicy): string {
  return policy.noticeDays > 0 ? `${policy.noticeDays} dias de aviso prévio` : "sem aviso prévio";
}

export function penaltyClause(policy: CancellationPolicy): string {
  const p = policy.penalty;
  if (p.kind === "percent" && p.percent) return `${p.percent}% das mensalidades que faltariam até o fim da fidelidade`;
  if (p.kind === "fixed" && p.amountReais) {
    const [int, dec] = p.amountReais.toFixed(2).split(".");
    return `multa fixa de R$ ${int!.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
  }
  return "sem multa";
}

export function parseCancelReason(raw: unknown): CancelReason {
  return (CANCEL_REASONS as readonly string[]).includes(String(raw)) ? raw as CancelReason : "other";
}

export function penaltyChargeId(enrollmentId: string): string {
  return `${enrollmentId}_penalty`;
}
