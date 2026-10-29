/**
 * Cancelamento por chuva — regras puras, sem Firestore.
 *
 * Choveu: o atleta remarca sem custo ou guarda o valor pago como crédito
 * naquela arena. O dinheiro não sai do caixa: nada aqui mexe em carteira.
 * Spec: docs/superpowers/specs/2026-10-29-cancelamento-por-chuva-design.md
 */
import {roundMoney} from "./mercadopago-arena-helpers";

export type WeatherTrigger = "arena" | "request" | "auto";
export type WeatherRequestDeadline = "before_2h" | "start" | "after_30m";
export type WeatherMidGame = "proportional" | "none";

export interface WeatherPolicy {
  enabled: boolean;
  allowReschedule: boolean;
  rescheduleDays: number;
  /** `null` = crédito sem validade. */
  creditValidityDays: number | null;
  trigger: WeatherTrigger;
  requestDeadline: WeatherRequestDeadline;
  midGame: WeatherMidGame;
  /** `null` = todas as quadras da arena. */
  courtIds: string[] | null;
}

export const RESCHEDULE_DAY_OPTIONS = [15, 30, 60] as const;
export const CREDIT_VALIDITY_OPTIONS = [60, 90, 180] as const;

export const DEFAULT_WEATHER_POLICY: WeatherPolicy = {
  enabled: false,
  allowReschedule: true,
  rescheduleDays: 30,
  creditValidityDays: 90,
  trigger: "arena",
  requestDeadline: "start",
  midGame: "proportional",
  courtIds: null,
};

/** Quem não escolhe em 24h recebe o crédito automaticamente. */
export const WEATHER_DECISION_WINDOW_MS = 24 * 60 * 60 * 1000;
/** O pedido do atleta abre 24h antes do início do jogo. */
export const WEATHER_REQUEST_OPENS_BEFORE_MS = 24 * 60 * 60 * 1000;
/** Aviso de crédito vencendo. */
export const WEATHER_CREDIT_REMINDER_MS = 7 * 24 * 60 * 60 * 1000;
/** Modo automático: aprova sozinho a partir desta chance e deste volume por hora. */
export const AUTO_APPROVE_MIN_PROBABILITY = 70;
export const AUTO_APPROVE_MIN_MM = 2;

function pick<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw) ? raw as T : fallback;
}

function pickNumber(raw: unknown, allowed: readonly number[], fallback: number): number {
  return typeof raw === "number" && allowed.includes(raw) ? raw : fallback;
}

/** Política gravada (ou enviada pelo portal) com tudo que for inválido trocado pelo padrão. */
export function normalizeWeatherPolicy(raw: unknown): WeatherPolicy {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const validity = d["creditValidityDays"];
  const courtIds = Array.isArray(d["courtIds"]) ?
    [...new Set(d["courtIds"].filter((c): c is string => typeof c === "string" && c.trim() !== "")
      .map((c) => c.trim()))] :
    null;
  return {
    enabled: d["enabled"] === true,
    allowReschedule: d["allowReschedule"] !== false,
    rescheduleDays: pickNumber(d["rescheduleDays"], RESCHEDULE_DAY_OPTIONS, DEFAULT_WEATHER_POLICY.rescheduleDays),
    creditValidityDays: validity === null ?
      null :
      pickNumber(validity, CREDIT_VALIDITY_OPTIONS, DEFAULT_WEATHER_POLICY.creditValidityDays as number),
    trigger: pick(d["trigger"], ["arena", "request", "auto"], DEFAULT_WEATHER_POLICY.trigger),
    requestDeadline: pick(d["requestDeadline"], ["before_2h", "start", "after_30m"],
      DEFAULT_WEATHER_POLICY.requestDeadline),
    midGame: pick(d["midGame"], ["proportional", "none"], DEFAULT_WEATHER_POLICY.midGame),
    courtIds,
  };
}

export function policyCoversCourt(policy: WeatherPolicy, courtId: string): boolean {
  return policy.courtIds == null || policy.courtIds.includes(courtId);
}

// ── Horário ──────────────────────────────────────────────────────────────

/** "17:30" → 1050; "24:00" → 1440. `null` quando não é HH:mm. */
export function hmToMinutes(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const h = parseInt(m[1] ?? "", 10);
  const min = parseInt(m[2] ?? "", 10);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

export function minutesToHm(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/** Janela da reserva em minutos do dia; fim 00:00 = meia-noite (1440). */
export function bookingWindow(startTime: unknown, endTime: unknown): {start: number; end: number} | null {
  const start = hmToMinutes(startTime);
  let end = hmToMinutes(endTime);
  if (start == null || end == null) return null;
  if (end === 0 && start > 0) end = 24 * 60;
  return end > start ? {start, end} : null;
}

/**
 * Instante (epoch ms) de um horário de parede em São Paulo. Sem horário de
 * verão desde 2019: UTC−3 fixo, o mesmo que o resto do backend assume.
 */
export function spWallTimeToEpochMs(dateKey: string, minutes: number): number {
  const [y, m, d] = dateKey.split("-").map((v) => parseInt(v, 10));
  return Date.UTC(y ?? 2020, (m ?? 1) - 1, d ?? 1, 3, 0) + minutes * 60_000;
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map((v) => parseInt(v, 10));
  const date = new Date(Date.UTC(y ?? 2020, (m ?? 1) - 1, (d ?? 1) + days));
  return date.toISOString().substring(0, 10);
}

// ── Classificação das reservas no Modo chuva ─────────────────────────────

export type RainTreatment = "release" | "partial" | "cancel" | "manual";
export type RainManualReason =
  | "class"
  | "club"
  | "recurring"
  | "manual"
  | "pending_payment"
  | "split"
  | "already_released";

export interface RainClassification {
  treatment: RainTreatment;
  manualReason: RainManualReason | null;
  paidReais: number;
  /** Fração do valor pago que vira crédito (1 = integral). */
  fraction: number;
  creditableReais: number;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * O que o atleta pagou de fato: online (Pix/cartão, inclusive cashback e
 * desconto de embaixador, que a nexaGO cobre) mais o crédito de chuva usado.
 * Pagamento no local não é registrado — reserva "na arena" conta como não paga.
 */
export function bookingPaidReais(booking: Record<string, unknown>): number {
  return roundMoney(Math.max(0, num(booking["amountPaidOnlineReais"])) +
    Math.max(0, num(booking["weatherCreditReais"])));
}

function manualReasonOf(bookingId: string, booking: Record<string, unknown>): RainManualReason | null {
  if (booking["weatherRelease"] && typeof booking["weatherRelease"] === "object") return "already_released";
  if (str(booking["classSessionId"]) || str(booking["source"]) === "class") return "class";
  if (booking["isClubSession"] === true || str(booking["clubId"]) || str(booking["source"]) === "club" ||
    bookingId.startsWith("club_")) {
    return "club";
  }
  if (booking["isRecurring"] === true || str(booking["recurringBookingId"])) return "recurring";
  if (str(booking["source"]) === "manual" || !str(booking["athleteId"])) return "manual";
  if (str(booking["status"]).toLowerCase() === "pending_payment") return "pending_payment";
  if (str(booking["paymentStatus"]).toLowerCase() === "split_pending") return "split";
  return null;
}

const RAIN_ELIGIBLE_STATUSES = new Set(["active", "confirmed", "pending_payment"]);

/**
 * Como o Modo chuva trata uma reserva do período, ou `null` se ela não é afetada.
 *
 * - começa dentro do período → `release` (atleta escolhe) ou `cancel` (nada pago);
 * - já tinha começado quando a chuva veio → `partial`: crédito proporcional ao
 *   que faltava, sem remarcar (`midGame: 'none'` tira a reserva da conta);
 * - aula, clubinho, horário fixo, manual, Pix em andamento, divisão → `manual`.
 */
export function classifyBookingForRain(
  bookingId: string,
  booking: Record<string, unknown>,
  period: {start: number; end: number},
  policy: Pick<WeatherPolicy, "midGame">,
): RainClassification | null {
  const status = str(booking["status"]).toLowerCase();
  if (!RAIN_ELIGIBLE_STATUSES.has(status)) return null;
  const win = bookingWindow(booking["startTime"], booking["endTime"]);
  if (!win) return null;
  if (win.start >= period.end || win.end <= period.start) return null;

  const midGame = win.start < period.start;
  if (midGame && policy.midGame === "none") return null;

  const paidReais = bookingPaidReais(booking);
  const manualReason = manualReasonOf(bookingId, booking);
  if (manualReason) {
    return {treatment: "manual", manualReason, paidReais, fraction: 0, creditableReais: 0};
  }

  if (midGame) {
    if (paidReais <= 0) return null;
    const fraction = remainingFraction(win, period.start);
    return {
      treatment: "partial",
      manualReason: null,
      paidReais,
      fraction,
      creditableReais: roundMoney(paidReais * fraction),
    };
  }

  if (paidReais <= 0) {
    return {treatment: "cancel", manualReason: null, paidReais: 0, fraction: 1, creditableReais: 0};
  }
  return {treatment: "release", manualReason: null, paidReais, fraction: 1, creditableReais: paidReais};
}

/** Fração do jogo que faltava quando a chuva chegou (`atMinutes`), entre 0 e 1. */
export function remainingFraction(win: {start: number; end: number}, atMinutes: number): number {
  const total = win.end - win.start;
  if (total <= 0) return 0;
  const left = Math.min(total, Math.max(0, win.end - atMinutes));
  return Math.round((left / total) * 10_000) / 10_000;
}

export function paymentLabelOf(booking: Record<string, unknown>): string {
  const channel = str(booking["paymentChannel"]).toLowerCase();
  if (channel === "weather_credit") return "Crédito de chuva";
  if (channel === "card") return "Cartão";
  if (channel === "pix") return num(booking["paymentFraction"]) === 0.5 ? "Pix (sinal)" : "Pix";
  if (channel === "onsite") return "Na arena";
  return "—";
}

// ── Pedido do atleta ─────────────────────────────────────────────────────

export type WeatherRequestWindow =
  | {open: true; afterStart: boolean}
  | {open: false; reason: "too_early" | "too_late"};

/**
 * Janela do pedido: abre 24h antes do início e fecha conforme o prazo da
 * política. Depois do início é chuva no meio do jogo — só com `midGame` proporcional.
 */
export function weatherRequestWindow(
  policy: Pick<WeatherPolicy, "requestDeadline" | "midGame">,
  startMs: number,
  nowMs: number,
): WeatherRequestWindow {
  if (nowMs < startMs - WEATHER_REQUEST_OPENS_BEFORE_MS) return {open: false, reason: "too_early"};
  const closesAt = policy.requestDeadline === "before_2h" ?
    startMs - 2 * 60 * 60 * 1000 :
    policy.requestDeadline === "after_30m" ? startMs + 30 * 60 * 1000 : startMs;
  if (nowMs > closesAt) return {open: false, reason: "too_late"};
  const afterStart = nowMs > startMs;
  if (afterStart && policy.midGame === "none") return {open: false, reason: "too_late"};
  return {open: true, afterStart};
}

// ── Crédito ──────────────────────────────────────────────────────────────

export function weatherCreditExpiresAtMs(policy: Pick<WeatherPolicy, "creditValidityDays">, nowMs: number):
  number | null {
  return policy.creditValidityDays == null ? null : nowMs + policy.creditValidityDays * 86_400_000;
}

export interface OpenWeatherCredit {
  id: string;
  balanceReais: number;
  expiresAtMs: number | null;
}

export interface WeatherCreditUse {
  creditId: string;
  amountReais: number;
}

/** Créditos ainda utilizáveis, os que vencem primeiro na frente (sem validade por último). */
export function usableWeatherCredits(credits: OpenWeatherCredit[], nowMs: number): OpenWeatherCredit[] {
  return credits
    .filter((c) => c.balanceReais > 0.004 && (c.expiresAtMs == null || c.expiresAtMs > nowMs))
    .sort((a, b) => {
      const ea = a.expiresAtMs ?? Number.POSITIVE_INFINITY;
      const eb = b.expiresAtMs ?? Number.POSITIVE_INFINITY;
      return ea !== eb ? ea - eb : a.id.localeCompare(b.id);
    });
}

/** Desconta até `amountReais` dos créditos, os que vencem antes primeiro. Conta em centavos. */
export function allocateWeatherCredit(
  credits: OpenWeatherCredit[],
  amountReais: number,
  nowMs: number,
): {appliedReais: number; uses: WeatherCreditUse[]} {
  let leftCents = Math.max(0, Math.round(amountReais * 100));
  const uses: WeatherCreditUse[] = [];
  for (const c of usableWeatherCredits(credits, nowMs)) {
    if (leftCents <= 0) break;
    const takeCents = Math.min(leftCents, Math.round(c.balanceReais * 100));
    if (takeCents <= 0) continue;
    uses.push({creditId: c.id, amountReais: takeCents / 100});
    leftCents -= takeCents;
  }
  const appliedCents = uses.reduce((s, u) => s + Math.round(u.amountReais * 100), 0);
  return {appliedReais: appliedCents / 100, uses};
}

/** O Asaas não cobra Pix abaixo de R$ 5. */
export const MIN_PIX_CHARGE_REAIS = 5;

/**
 * Quanto do crédito usar numa reserva nova. Cobre tudo quando dá; senão, no
 * Pix, deixa a parte em dinheiro com pelo menos R$ 5 (abaixo disso o Asaas
 * recusa a cobrança). Reserva com crédito paga o resto integral, sem sinal
 * (ver `resolveArenaBookingChargeAmounts`). Na arena não há piso.
 */
export function weatherCreditToApply(params: {
  amountReais: number;
  availableReais: number;
  paymentMode: "pix" | "onsite";
}): number {
  const {amountReais, availableReais, paymentMode} = params;
  if (availableReais <= 0 || amountReais <= 0) return 0;
  if (availableReais >= amountReais) return roundMoney(amountReais);
  if (paymentMode === "onsite") return roundMoney(availableReais);
  const cap = roundMoney(amountReais - MIN_PIX_CHARGE_REAIS);
  return roundMoney(Math.max(0, Math.min(availableReais, cap)));
}

/**
 * Remarcação: o valor pago cobre o horário novo; mais caro, a diferença fica
 * para pagar na arena; mais barato, a sobra vira crédito.
 */
export function rescheduleSettlement(creditableReais: number, newPriceReais: number): {
  coveredReais: number;
  dueOnsiteReais: number;
  leftoverReais: number;
} {
  const covered = roundMoney(Math.min(creditableReais, newPriceReais));
  return {
    coveredReais: covered,
    dueOnsiteReais: roundMoney(Math.max(0, newPriceReais - covered)),
    leftoverReais: roundMoney(Math.max(0, creditableReais - covered)),
  };
}

/** Status de um crédito depois de mexer no saldo. */
export function weatherCreditStatusFor(balanceReais: number, expiresAtMs: number | null, nowMs: number):
  "open" | "used" | "expired" {
  if (balanceReais <= 0.004) return "used";
  if (expiresAtMs != null && expiresAtMs <= nowMs) return "expired";
  return "open";
}

// ── Previsão (Open-Meteo) ────────────────────────────────────────────────

export interface WeatherHour {
  /** "HH:00" no fuso de São Paulo. */
  time: string;
  probability: number | null;
  precipitationMm: number | null;
}

function nullableNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Horas do dia `dateKey` na resposta do Open-Meteo pedida com
 * `hourly=precipitation_probability,precipitation&timezone=America/Sao_Paulo`.
 */
export function parseOpenMeteoHourly(json: unknown, dateKey: string): WeatherHour[] {
  const hourly = (json as {hourly?: Record<string, unknown>} | null)?.hourly;
  const times = Array.isArray(hourly?.["time"]) ? hourly["time"] as unknown[] : [];
  const probs = Array.isArray(hourly?.["precipitation_probability"]) ?
    hourly["precipitation_probability"] as unknown[] : [];
  const mms = Array.isArray(hourly?.["precipitation"]) ? hourly["precipitation"] as unknown[] : [];
  const hours: WeatherHour[] = [];
  times.forEach((t, i) => {
    if (typeof t !== "string" || !t.startsWith(`${dateKey}T`)) return;
    const mm = nullableNumber(mms[i]);
    hours.push({
      time: t.substring(11, 16),
      probability: nullableNumber(probs[i]),
      precipitationMm: mm == null ? null : Math.round(mm * 10) / 10,
    });
  });
  return hours;
}

/** Horas da previsão que cruzam a janela [start, end) em minutos. */
export function weatherHoursInWindow(hours: WeatherHour[], start: number, end: number): WeatherHour[] {
  return hours.filter((h) => {
    const m = hmToMinutes(h.time);
    return m != null && m < end && m + 60 > start;
  });
}

/** Pior hora da janela: maior chance e maior volume. */
export function summarizeWeather(hours: WeatherHour[]): {probability: number | null; precipitationMm: number | null} {
  let probability: number | null = null;
  let precipitationMm: number | null = null;
  for (const h of hours) {
    if (h.probability != null) probability = Math.max(probability ?? 0, h.probability);
    if (h.precipitationMm != null) precipitationMm = Math.max(precipitationMm ?? 0, h.precipitationMm);
  }
  return {probability, precipitationMm};
}

export function weatherMeetsAutoThreshold(summary: {probability: number | null; precipitationMm: number | null}):
  boolean {
  return (summary.probability ?? 0) >= AUTO_APPROVE_MIN_PROBABILITY &&
    (summary.precipitationMm ?? 0) >= AUTO_APPROVE_MIN_MM;
}
