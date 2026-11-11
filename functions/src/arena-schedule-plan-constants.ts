/**
 * Planos de horário da arena — horário fixo semanal vendido como plano mensal.
 * Spec: `docs/superpowers/specs/2026-11-03-arena-planos-de-horario-design.md`.
 *
 * Constantes, tipos, validação do plano/regras e a matemática pura (janelas,
 * horário nobre, escolha de quadra, rateio, datas). Sem Firestore: tudo aqui é
 * testável direto.
 */

import {HttpsError} from "firebase-functions/v2/https";
import {addDaysToDateKey, isValidDateKey, toMinutes} from "./arena-recurring-booking";
import {monthLabelPt} from "./arena-class-billing";

/** Subcoleções de `arenas/{arenaId}`. */
export const SCHEDULE_PLANS = "schedulePlans";
export const SCHEDULE_SETTINGS = "scheduleSettings";
export const SCHEDULE_RULES_DOC = "rules";

export const ARENA_SCHEDULE_SUBSCRIPTIONS = "arenaScheduleSubscriptions";
export const ARENA_SCHEDULE_CHARGES = "arenaScheduleCharges";
export const ARENA_SCHEDULE_CREDITS = "arenaScheduleCredits";
export const ARENA_SCHEDULE_WAITLIST = "arenaScheduleWaitlist";
/** Cobrança online: um doc por pagamento Asaas de mensalidade (só servidor; rules negam). */
export const ARENA_SCHEDULE_ASAAS_PAYMENTS = "arenaScheduleAsaasPayments";
/** `externalReference` do pagamento Asaas da mensalidade: `arenaSchedulePayment:{groupId}`. */
export const SCHEDULE_PAYMENT_REF_PREFIX = "arenaSchedulePayment:";

/** Rota do app do atleta ("Meu plano") usada nos pushes. */
export const ATHLETE_PLANS_URL = "/meus-planos-horario";

export const PLAN_STATUSES = ["draft", "active", "archived"] as const;
export type SchedulePlanStatus = typeof PLAN_STATUSES[number];
export const PLAN_DURATIONS = [60, 90, 120] as const;
export const CYCLES = ["monthly", "quarterly", "annual"] as const;
export type ScheduleCycle = typeof CYCLES[number];
export const BILLING_METHODS = ["pix_auto", "card", "onsite"] as const;
export type ScheduleBillingMethod = typeof BILLING_METHODS[number];
export const OVERDUE_RELEASE_DAYS = [1, 3, 7] as const;
export const WAITLIST_OFFER_HOURS = [12, 24, 48] as const;
/** Formas da baixa manual (iguais às das Aulas). */
export const SCHEDULE_PAYMENT_METHODS = ["pix", "cash", "card_machine", "transfer"] as const;

/** Assinatura "viva" (segura a vaga e a quadra). */
export const LIVE_SUBSCRIPTION_STATUSES = ["active", "paused", "suspended"] as const;

/**
 * Assinou com Pix/cartão numa arena que cobra online: segura o horário até pagar a 1ª mensalidade.
 * Não é "viva" (não fatura, não suspende, não pausa); paga → `active`; vence → `canceled`.
 */
export const PENDING_PAYMENT_STATUS = "pending_payment";

/** Prazo para pagar a 1ª mensalidade na assinatura pelo app. */
export const SIGNUP_PAYMENT_WINDOW_MS = 30 * 60_000;

/** Atleta com plano aguardando pagamento não assina outro (em nenhuma arena) até pagar ou desistir. */
export const PENDING_PAYMENT_BLOCK_MESSAGE =
  "Você tem um plano aguardando pagamento. Pague ou desista dele antes de assinar outro.";

/** Menor valor cobrado online (abaixo disso a mensalidade fica manual). */
export const MIN_ONLINE_CHARGE_REAIS = 5;

/** Chave de ambiente: `scheduleCardAutopay === true` liga o débito automático no cartão. */
export const APP_PAYMENTS_CONFIG_PATH = "appConfig/payments";

/** Estado do débito automático dentro da mensalidade (`autopay.state`). */
export type AutopayState = "scheduled" | "retry" | "charging" | "paid" | "failed" | "skipped";
/** Estados em que o débito ainda vai (ou está) acontecer: seguram o link de pagamento. */
export const AUTOPAY_WINDOW_STATES: ReadonlySet<AutopayState> = new Set<AutopayState>(["scheduled", "retry", "charging"]);

/** O mapa `autopay` da mensalidade, ou `{}`. */
export function autopayOf(charge: Record<string, unknown> | undefined): Record<string, unknown> {
  const raw = charge?.["autopay"];
  return raw != null && typeof raw === "object" ? raw as Record<string, unknown> : {};
}

export const CPF_REQUIRED_MESSAGE = "Informe seu CPF para pagar online.";

export interface PlanWindow {
  /** ISO 1 = segunda … 7 = domingo. */
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface SchedulePlanRules {
  makeup: {enabled: boolean; perMonth: number; validityDays: number; noticeHours: number};
  holiday: "makeup" | "play";
  pause: {enabled: boolean; maxDaysPerYear: number};
  split: {enabled: boolean; maxPlayers: number};
  weather: boolean;
}

export interface SchedulePlanData {
  name: string;
  description: string | null;
  status: SchedulePlanStatus;
  timesPerWeek: number;
  durationMinutes: number;
  windows: PlanWindow[];
  courtIds: string[];
  courtNames: string[];
  capacity: number;
  monthlyPriceReais: number;
  referenceHourlyReais: number | null;
  cycles: {
    monthly: {enabled: boolean};
    quarterly: {enabled: boolean; discountPercent: number};
    annual: {enabled: boolean; discountPercent: number};
  };
  billing: {methods: ScheduleBillingMethod[]; dueDay: number; overdueReleaseDays: number};
  rules: SchedulePlanRules;
}

export interface ParsedSchedulePlan extends SchedulePlanData {
  occupiedCount: number;
  waitingCount: number;
}

export const DEFAULT_PLAN_RULES: SchedulePlanRules = {
  makeup: {enabled: true, perMonth: 2, validityDays: 30, noticeHours: 24},
  holiday: "makeup",
  pause: {enabled: true, maxDaysPerYear: 30},
  split: {enabled: true, maxPlayers: 4},
  weather: true,
};

export interface ScheduleSettings {
  primeWindows: PlanWindow[];
  primeCapPercent: number;
  waitlistAutoOffer: boolean;
  waitlistOfferHours: number;
  appliedHolidays: string[];
  /** Cobrança online das mensalidades (link Asaas, Pix ou cartão). Padrão desligado. */
  onlineBillingEnabled: boolean;
}

export const DEFAULT_PRIME_WINDOWS: PlanWindow[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday, startTime: "18:00", endTime: "23:00",
}));

export const DEFAULT_SCHEDULE_SETTINGS: ScheduleSettings = {
  primeWindows: DEFAULT_PRIME_WINDOWS,
  primeCapPercent: 75,
  waitlistAutoOffer: true,
  waitlistOfferHours: 24,
  appliedHolidays: [],
  // Arena apta (pagamento online + chave PIX) cobra os planos online; o gestor desliga nas Regras.
  onlineBillingEnabled: true,
};

// ---------------------------------------------------------------------------
// Horários
// ---------------------------------------------------------------------------

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Minutos de um fim de intervalo: "00:00"/"24:00" = meia-noite (1440). */
export function endMinutes(hhmm: string): number {
  const m = toMinutes(hhmm);
  return m === 0 ? 24 * 60 : m;
}

/** "HH:MM" de minutos do dia; 1440 vira "00:00" (meia-noite, como no horário fixo). */
export function fmtMinutes(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function addMinutesToTime(hhmm: string, minutes: number): string {
  return fmtMinutes(toMinutes(hhmm) + minutes);
}

export function isClockTime(raw: string): boolean {
  return CLOCK.test(raw);
}

/** O horário cabe numa janela do plano naquele dia (início dentro, fim ≤ fim da janela)? */
export function startFitsWindows(
  windows: readonly PlanWindow[],
  weekday: number,
  startTime: string,
  durationMinutes: number,
): boolean {
  if (!isClockTime(startTime)) return false;
  const start = toMinutes(startTime);
  const end = start + durationMinutes;
  return windows.some((w) => w.weekday === weekday &&
    toMinutes(w.startTime) <= start && end <= endMinutes(w.endTime));
}

/** Inícios oferecidos no dia: de hora em hora (de 30 em 30 no plano de 90 min). */
export function candidateStartTimes(
  windows: readonly PlanWindow[],
  weekday: number,
  durationMinutes: number,
): string[] {
  const step = durationMinutes === 90 ? 30 : 60;
  const out = new Set<number>();
  for (const w of windows.filter((x) => x.weekday === weekday)) {
    const end = endMinutes(w.endTime);
    for (let t = toMinutes(w.startTime); t + durationMinutes <= end; t += step) out.add(t);
  }
  return [...out].sort((a, b) => a - b).map(fmtMinutes);
}

export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// ---------------------------------------------------------------------------
// Horário nobre
// ---------------------------------------------------------------------------

/** Minutos de [start, end) dentro das janelas nobres do dia da semana. */
export function primeOverlapMinutes(
  primeWindows: readonly PlanWindow[],
  weekday: number,
  startMin: number,
  endMin: number,
): number {
  let total = 0;
  for (const w of primeWindows) {
    if (w.weekday !== weekday) continue;
    const overlap = Math.min(endMin, endMinutes(w.endTime)) - Math.max(startMin, toMinutes(w.startTime));
    if (overlap > 0) total += overlap;
  }
  return total;
}

/** Minutos-quadra do nobre por semana (quadras ativas × horas das janelas). */
export function primeCapacityMinutes(primeWindows: readonly PlanWindow[], activeCourts: number): number {
  const perCourt = primeWindows.reduce((sum, w) => sum + Math.max(0, endMinutes(w.endTime) - toMinutes(w.startTime)), 0);
  return perCourt * Math.max(0, activeCourts);
}

export interface WeeklySlot {
  weekday: number;
  startTime: string;
  endTime: string;
}

export function primeMinutesOfSlots(primeWindows: readonly PlanWindow[], slots: readonly WeeklySlot[]): number {
  return slots.reduce((sum, s) =>
    sum + primeOverlapMinutes(primeWindows, s.weekday, toMinutes(s.startTime), endMinutes(s.endTime)), 0);
}

/**
 * Cabe no limite do nobre? Uso = minutos de plano no nobre ÷ capacidade do nobre. Assinatura que
 * não encosta no nobre sempre passa (mesmo com o nobre já estourado por uma regra mais apertada).
 */
export function fitsPrimeCap(input: {
  usedMinutes: number;
  addedMinutes: number;
  capacityMinutes: number;
  capPercent: number;
}): boolean {
  if (input.addedMinutes <= 0) return true;
  if (input.capacityMinutes <= 0) return true;
  return (input.usedMinutes + input.addedMinutes) * 100 <= input.capPercent * input.capacityMinutes;
}

export function primeUsagePercent(usedMinutes: number, capacityMinutes: number): number {
  if (capacityMinutes <= 0) return 0;
  return Math.round((usedMinutes * 1000) / capacityMinutes) / 10;
}

// ---------------------------------------------------------------------------
// Escolha de quadra
// ---------------------------------------------------------------------------

/** Ocupação semanal de uma quadra (série de horário fixo, turma de aula ou oferta da fila). */
export interface BusyBlock {
  courtId: string;
  weekday: number;
  startMin: number;
  endMin: number;
}

export function isCourtFree(
  busy: readonly BusyBlock[],
  courtId: string,
  weekdays: readonly number[],
  startMin: number,
  endMin: number,
): boolean {
  return !busy.some((b) => b.courtId === courtId && weekdays.includes(b.weekday) &&
    rangesOverlap(b.startMin, b.endMin, startMin, endMin));
}

/**
 * Primeira quadra do plano (na ordem do plano) livre em TODOS os dias escolhidos naquele horário.
 * `preferredCourtId` (gestor escolhendo, ou a quadra da oferta da fila) vai na frente se estiver livre.
 */
export function pickCourt(input: {
  courtIds: readonly string[];
  courtNames: readonly string[];
  weekdays: readonly number[];
  startMin: number;
  endMin: number;
  busy: readonly BusyBlock[];
  preferredCourtId?: string | null;
}): {courtId: string; courtName: string} | null {
  const order = input.preferredCourtId && input.courtIds.includes(input.preferredCourtId) ?
    [input.preferredCourtId, ...input.courtIds.filter((c) => c !== input.preferredCourtId)] :
    [...input.courtIds];
  for (const courtId of order) {
    if (isCourtFree(input.busy, courtId, input.weekdays, input.startMin, input.endMin)) {
      const idx = input.courtIds.indexOf(courtId);
      return {courtId, courtName: input.courtNames[idx] || "Quadra"};
    }
  }
  return null;
}

export function countFreeCourts(
  courtIds: readonly string[],
  busy: readonly BusyBlock[],
  weekday: number,
  startMin: number,
  endMin: number,
): number {
  return courtIds.filter((c) => isCourtFree(busy, c, [weekday], startMin, endMin)).length;
}

// ---------------------------------------------------------------------------
// Dinheiro e datas
// ---------------------------------------------------------------------------

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Divide o valor em centavos entre `n` pagadores; o resto fica no titular (índice 0). */
export function splitCents(amountReais: number, n: number): number[] {
  const count = Math.max(1, Math.floor(n));
  const cents = Math.round(amountReais * 100);
  const base = Math.floor(cents / count);
  const rest = cents - base * count;
  return Array.from({length: count}, (_, i) => (base + (i === 0 ? rest : 0)) / 100);
}

/** Mensal do ciclo (trimestral/anual = desconto sobre o mensal, pago mês a mês). */
export function cycleMonthlyPrice(plan: Pick<SchedulePlanData, "monthlyPriceReais" | "cycles">, cycle: ScheduleCycle): number {
  const pct = cycle === "quarterly" ? plan.cycles.quarterly.discountPercent :
    cycle === "annual" ? plan.cycles.annual.discountPercent : 0;
  return round2(plan.monthlyPriceReais * (1 - pct / 100));
}

/**
 * Mensalidades pagas de uma vez no ciclo: o anual cobra as 12 à vista (na assinatura e a cada
 * renovação); mensal e trimestral, mês a mês.
 */
export function prepaidMonthsOf(cycle: ScheduleCycle): number {
  return cycle === "annual" ? 12 : 1;
}

/** `prepaidMonths` da assinatura; ausente = 1 (as anuais antigas seguem mês a mês). */
export function subscriptionPrepaidMonths(sub: Record<string, unknown>): number {
  const n = Number(sub["prepaidMonths"] ?? 1);
  return Number.isInteger(n) && n > 1 ? n : 1;
}

/** `AAAA-MM` + `months`. */
export function addMonthsToMonthKey(monthKey: string, months: number): string {
  return addMonthsToDateKey(`${monthKey}-01`, months).slice(0, 7);
}

/** Último mês que a mensalidade cobre: `coversThrough` (anual à vista) ou o próprio período. */
export function chargeCoversThrough(charge: Record<string, unknown>): string {
  const period = str(charge["period"]);
  const through = str(charge["coversThrough"]);
  return through && through > period ? through : period;
}

/** "nov/2026" ou, no anual à vista, "nov/2026 a out/2027". */
export function chargePeriodLabel(charge: Record<string, unknown>): string {
  const period = str(charge["period"]);
  const through = chargeCoversThrough(charge);
  return through === period ? monthLabelPt(period) : `${monthLabelPt(period)} a ${monthLabelPt(through)}`;
}

export function isCycleEnabled(plan: Pick<SchedulePlanData, "cycles">, cycle: ScheduleCycle): boolean {
  return plan.cycles[cycle].enabled;
}

export function addMonthsToDateKey(dateKey: string, months: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const total = (y ?? 2000) * 12 + ((m ?? 1) - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d ?? 1, last)).padStart(2, "0")}`;
}

export function commitmentEndsOn(cycle: ScheduleCycle, startDate: string): string | null {
  if (cycle === "quarterly") return addMonthsToDateKey(startDate, 3);
  if (cycle === "annual") return addMonthsToDateKey(startDate, 12);
  return null;
}

/** `dueDay` 0 = dia da assinatura, limitado a 28. */
export function effectiveDueDay(dueDay: number, startDate: string): number {
  if (dueDay >= 1 && dueDay <= 28) return dueDay;
  return Math.min(28, Number(startDate.slice(8, 10)) || 1);
}

export function daysBetween(fromKey: string, toKey: string): number {
  const a = Date.parse(`${fromKey}T12:00:00Z`);
  const b = Date.parse(`${toKey}T12:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function firstDayOfMonth(monthKey: string): string {
  return `${monthKey}-01`;
}

export function lastDayOfMonth(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(Date.UTC(y ?? 2000, m ?? 1, 0)).getUTCDate();
  return `${monthKey}-${String(last).padStart(2, "0")}`;
}

export function scheduleChargeId(subscriptionId: string, monthKey: string, payerIndex: number): string {
  return `${subscriptionId}_${monthKey}_${payerIndex}`;
}

/** Instante de início de uma ocorrência (arena em -03:00, como o horário fixo). */
export function occurrenceStartMs(dateKey: string, startTime: string): number {
  return new Date(`${dateKey}T${startTime}:00-03:00`).getTime();
}

export function formatDateBr(dateKey: string): string {
  const [, m, d] = dateKey.split("-");
  return `${d}/${m}`;
}

/** Feriados nacionais (fixos + móveis) de 2026–2027 — o "Revisar" do portal alerta por eles. */
export const NATIONAL_HOLIDAYS: Array<{date: string; name: string}> = [
  {date: "2026-01-01", name: "Confraternização Universal"},
  {date: "2026-02-16", name: "Carnaval"},
  {date: "2026-02-17", name: "Carnaval"},
  {date: "2026-04-03", name: "Sexta-feira Santa"},
  {date: "2026-04-21", name: "Tiradentes"},
  {date: "2026-05-01", name: "Dia do Trabalho"},
  {date: "2026-06-04", name: "Corpus Christi"},
  {date: "2026-09-07", name: "Independência do Brasil"},
  {date: "2026-10-12", name: "Nossa Senhora Aparecida"},
  {date: "2026-11-02", name: "Finados"},
  {date: "2026-11-15", name: "Proclamação da República"},
  {date: "2026-11-20", name: "Dia da Consciência Negra"},
  {date: "2026-12-25", name: "Natal"},
  {date: "2027-01-01", name: "Confraternização Universal"},
  {date: "2027-02-08", name: "Carnaval"},
  {date: "2027-02-09", name: "Carnaval"},
  {date: "2027-03-26", name: "Sexta-feira Santa"},
  {date: "2027-04-21", name: "Tiradentes"},
  {date: "2027-05-01", name: "Dia do Trabalho"},
  {date: "2027-05-27", name: "Corpus Christi"},
  {date: "2027-09-07", name: "Independência do Brasil"},
  {date: "2027-10-12", name: "Nossa Senhora Aparecida"},
  {date: "2027-11-02", name: "Finados"},
  {date: "2027-11-15", name: "Proclamação da República"},
  {date: "2027-11-20", name: "Dia da Consciência Negra"},
  {date: "2027-12-25", name: "Natal"},
];

export function upcomingNationalHolidays(todayKey: string, days: number): Array<{date: string; name: string}> {
  const until = addDaysToDateKey(todayKey, days);
  return NATIONAL_HOLIDAYS.filter((h) => h.date >= todayKey && h.date <= until);
}

// ---------------------------------------------------------------------------
// Validação e leitura
// ---------------------------------------------------------------------------

export function str(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function obj(raw: unknown): Record<string, unknown> {
  return raw != null && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}

function num(raw: unknown, fallback: number): number {
  if (raw == null || raw === "") return fallback;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function bool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === "boolean" ? raw : fallback;
}

function intInRange(raw: unknown, fallback: number, min: number, max: number, message: string): number {
  const n = num(raw, fallback);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpsError("invalid-argument", message);
  return n;
}

/** Janelas `[{weekday, startTime, endTime}]`. Lança `invalid-argument`. */
export function parseWindowsInput(raw: unknown, label: string, minLength = 0): PlanWindow[] {
  if (!Array.isArray(raw)) throw new HttpsError("invalid-argument", `${label}: informe os dias e horários.`);
  if (raw.length > 50) throw new HttpsError("invalid-argument", `${label}: janelas demais.`);
  const out: PlanWindow[] = [];
  for (const item of raw) {
    const w = obj(item);
    const weekday = Number(w["weekday"]);
    const startTime = str(w["startTime"]);
    const endTime = str(w["endTime"]) === "24:00" ? "00:00" : str(w["endTime"]);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
      throw new HttpsError("invalid-argument", `${label}: dia da semana inválido.`);
    }
    if (!isClockTime(startTime) || !isClockTime(endTime) || endMinutes(endTime) <= toMinutes(startTime)) {
      throw new HttpsError("invalid-argument", `${label}: horário inválido.`);
    }
    out.push({weekday, startTime, endTime});
  }
  if (out.length < minLength) throw new HttpsError("invalid-argument", `${label}: informe ao menos um horário.`);
  return out.sort((a, b) => a.weekday - b.weekday || toMinutes(a.startTime) - toMinutes(b.startTime));
}

export function parsePlanRulesInput(raw: unknown): SchedulePlanRules {
  const r = obj(raw);
  const makeup = obj(r["makeup"]);
  const pause = obj(r["pause"]);
  const split = obj(r["split"]);
  const d = DEFAULT_PLAN_RULES;
  const holiday = r["holiday"] == null ? d.holiday : str(r["holiday"]);
  if (holiday !== "makeup" && holiday !== "play") throw new HttpsError("invalid-argument", "Regra de feriado inválida.");
  return {
    makeup: {
      enabled: bool(makeup["enabled"], d.makeup.enabled),
      perMonth: intInRange(makeup["perMonth"], d.makeup.perMonth, 0, 8, "Reposições por mês: de 0 a 8."),
      validityDays: intInRange(makeup["validityDays"], d.makeup.validityDays, 1, 90, "Validade da reposição: de 1 a 90 dias."),
      noticeHours: intInRange(makeup["noticeHours"], d.makeup.noticeHours, 0, 72, "Antecedência do aviso: de 0 a 72 horas."),
    },
    holiday,
    pause: {
      enabled: bool(pause["enabled"], d.pause.enabled),
      maxDaysPerYear: intInRange(pause["maxDaysPerYear"], d.pause.maxDaysPerYear, 0, 90, "Pausa: de 0 a 90 dias por ano."),
    },
    split: {
      enabled: bool(split["enabled"], d.split.enabled),
      maxPlayers: intInRange(split["maxPlayers"], d.split.maxPlayers, 2, 6, "Rateio: de 2 a 6 atletas."),
    },
    weather: bool(r["weather"], d.weather),
  };
}

/** Valida o plano vindo do portal. `courtNames` é resolvido pelo chamador. Lança `invalid-argument`. */
export function validateSchedulePlanInput(
  raw: Record<string, unknown>,
  opts: {courtsOptional?: boolean} = {},
): Omit<SchedulePlanData, "courtNames"> {
  const name = str(raw["name"]);
  if (!name || name.length > 60) throw new HttpsError("invalid-argument", "Informe o nome do plano (até 60 caracteres).");
  const description = str(raw["description"]).slice(0, 500) || null;
  const status = raw["status"] == null ? "draft" : str(raw["status"]);
  if (!(PLAN_STATUSES as readonly string[]).includes(status)) throw new HttpsError("invalid-argument", "Status do plano inválido.");
  const timesPerWeek = intInRange(raw["timesPerWeek"], 1, 1, 3, "Vezes por semana: de 1 a 3.");
  const durationMinutes = num(raw["durationMinutes"], 60);
  if (!(PLAN_DURATIONS as readonly number[]).includes(durationMinutes)) {
    throw new HttpsError("invalid-argument", "Duração: 60, 90 ou 120 minutos.");
  }
  const windows = parseWindowsInput(raw["windows"], "Janelas do plano", 1);
  for (const w of windows) {
    if (endMinutes(w.endTime) - toMinutes(w.startTime) < durationMinutes) {
      throw new HttpsError("invalid-argument", "Cada janela precisa caber ao menos um horário do plano.");
    }
  }
  if (new Set(windows.map((w) => w.weekday)).size < timesPerWeek) {
    throw new HttpsError("invalid-argument", "O plano precisa de janelas em dias suficientes para as vezes por semana.");
  }
  const courtIds = Array.isArray(raw["courtIds"]) ? (raw["courtIds"] as unknown[]).map(str).filter(Boolean) : [];
  if ((courtIds.length === 0 && !opts.courtsOptional) || courtIds.length > 30 || new Set(courtIds).size !== courtIds.length) {
    throw new HttpsError("invalid-argument", "Escolha as quadras do plano.");
  }
  const capacity = intInRange(raw["capacity"], NaN, 1, 500, "Vagas: de 1 a 500.");
  const monthlyPriceReais = round2(num(raw["monthlyPriceReais"], NaN));
  if (!Number.isFinite(monthlyPriceReais) || monthlyPriceReais <= 0 || monthlyPriceReais > 100_000) {
    throw new HttpsError("invalid-argument", "Informe o valor mensal.");
  }
  const refRaw = raw["referenceHourlyReais"];
  const referenceHourlyReais = refRaw == null || refRaw === "" ? null : round2(num(refRaw, NaN));
  if (referenceHourlyReais != null && (!Number.isFinite(referenceHourlyReais) || referenceHourlyReais <= 0)) {
    throw new HttpsError("invalid-argument", "Valor avulso de referência inválido.");
  }
  const cyclesRaw = obj(raw["cycles"]);
  const monthly = obj(cyclesRaw["monthly"]);
  const quarterly = obj(cyclesRaw["quarterly"]);
  const annual = obj(cyclesRaw["annual"]);
  const cycles = {
    monthly: {enabled: bool(monthly["enabled"], true)},
    quarterly: {
      enabled: bool(quarterly["enabled"], true),
      discountPercent: intInRange(quarterly["discountPercent"], 5, 0, 50, "Desconto do trimestral: de 0 a 50%."),
    },
    annual: {
      enabled: bool(annual["enabled"], true),
      discountPercent: intInRange(annual["discountPercent"], 10, 0, 50, "Desconto do anual: de 0 a 50%."),
    },
  };
  if (!cycles.monthly.enabled && !cycles.quarterly.enabled && !cycles.annual.enabled) {
    throw new HttpsError("invalid-argument", "Ligue ao menos um ciclo.");
  }
  const billingRaw = obj(raw["billing"]);
  const methods = Array.isArray(billingRaw["methods"]) ?
    [...new Set((billingRaw["methods"] as unknown[]).map(str))] :
    ["pix_auto", "card", "onsite"];
  if (methods.length === 0 || methods.some((m) => !(BILLING_METHODS as readonly string[]).includes(m))) {
    throw new HttpsError("invalid-argument", "Formas de pagamento inválidas.");
  }
  const dueDay = intInRange(billingRaw["dueDay"], 5, 0, 28, "Vencimento: dia 1 a 28 (ou 0 = dia da assinatura).");
  const overdueReleaseDays = num(billingRaw["overdueReleaseDays"], 3);
  if (!(OVERDUE_RELEASE_DAYS as readonly number[]).includes(overdueReleaseDays)) {
    throw new HttpsError("invalid-argument", "Liberar o horário após 1, 3 ou 7 dias de atraso.");
  }
  return {
    name, description, status: status as SchedulePlanStatus, timesPerWeek, durationMinutes, windows, courtIds,
    capacity, monthlyPriceReais, referenceHourlyReais, cycles,
    billing: {methods: methods as ScheduleBillingMethod[], dueDay, overdueReleaseDays},
    rules: parsePlanRulesInput(raw["rules"]),
  };
}

/** Leitura tolerante do doc do plano (padrões no que faltar). */
export function parseSchedulePlan(data: Record<string, unknown>): ParsedSchedulePlan {
  const cycles = obj(data["cycles"]);
  const billing = obj(data["billing"]);
  let rules: SchedulePlanRules;
  try {
    rules = parsePlanRulesInput(data["rules"]);
  } catch {
    rules = DEFAULT_PLAN_RULES;
  }
  let windows: PlanWindow[];
  try {
    windows = parseWindowsInput(data["windows"] ?? [], "Janelas");
  } catch {
    windows = [];
  }
  const status = str(data["status"]);
  return {
    name: str(data["name"]) || "Plano",
    description: str(data["description"]) || null,
    status: (PLAN_STATUSES as readonly string[]).includes(status) ? status as SchedulePlanStatus : "draft",
    timesPerWeek: Number(data["timesPerWeek"] ?? 1) || 1,
    durationMinutes: Number(data["durationMinutes"] ?? 60) || 60,
    windows,
    courtIds: Array.isArray(data["courtIds"]) ? (data["courtIds"] as unknown[]).map(String) : [],
    courtNames: Array.isArray(data["courtNames"]) ? (data["courtNames"] as unknown[]).map(String) : [],
    capacity: Number(data["capacity"] ?? 0) || 0,
    occupiedCount: Math.max(0, Number(data["occupiedCount"] ?? 0) || 0),
    waitingCount: Math.max(0, Number(data["waitingCount"] ?? 0) || 0),
    monthlyPriceReais: Number(data["monthlyPriceReais"] ?? 0) || 0,
    referenceHourlyReais: typeof data["referenceHourlyReais"] === "number" ? data["referenceHourlyReais"] : null,
    cycles: {
      monthly: {enabled: bool(obj(cycles["monthly"])["enabled"], true)},
      quarterly: {
        enabled: bool(obj(cycles["quarterly"])["enabled"], true),
        discountPercent: Number(obj(cycles["quarterly"])["discountPercent"] ?? 5) || 0,
      },
      annual: {
        enabled: bool(obj(cycles["annual"])["enabled"], true),
        discountPercent: Number(obj(cycles["annual"])["discountPercent"] ?? 10) || 0,
      },
    },
    billing: {
      methods: Array.isArray(billing["methods"]) ?
        (billing["methods"] as unknown[]).map(String).filter((m) => (BILLING_METHODS as readonly string[]).includes(m)) as ScheduleBillingMethod[] :
        ["pix_auto", "card", "onsite"],
      dueDay: Number(billing["dueDay"] ?? 5),
      overdueReleaseDays: Number(billing["overdueReleaseDays"] ?? 3) || 3,
    },
    rules,
  };
}

export function parseScheduleSettings(data: Record<string, unknown> | undefined): ScheduleSettings {
  const d = DEFAULT_SCHEDULE_SETTINGS;
  if (!data) return {...d, primeWindows: [...d.primeWindows], appliedHolidays: []};
  let primeWindows = d.primeWindows;
  if (Array.isArray(data["primeWindows"])) {
    try {
      primeWindows = parseWindowsInput(data["primeWindows"], "Horário nobre");
    } catch {
      primeWindows = d.primeWindows;
    }
  }
  const cap = Number(data["primeCapPercent"]);
  const hours = Number(data["waitlistOfferHours"]);
  return {
    primeWindows,
    primeCapPercent: Number.isFinite(cap) && cap >= 0 && cap <= 100 ? cap : d.primeCapPercent,
    waitlistAutoOffer: bool(data["waitlistAutoOffer"], d.waitlistAutoOffer),
    waitlistOfferHours: (WAITLIST_OFFER_HOURS as readonly number[]).includes(hours) ? hours : d.waitlistOfferHours,
    appliedHolidays: Array.isArray(data["appliedHolidays"]) ?
      (data["appliedHolidays"] as unknown[]).map(String).filter(isValidDateKey) :
      [],
    // Ausente = padrão (ligada); só `false` gravado pelo gestor desliga.
    onlineBillingEnabled: data["onlineBillingEnabled"] !== false,
  };
}

/** Campo ausente = mantém o gravado. Lança `invalid-argument`. */
export function mergeScheduleSettingsInput(stored: ScheduleSettings, input: Record<string, unknown>): ScheduleSettings {
  const out: ScheduleSettings = {...stored};
  if (input["primeWindows"] !== undefined) out.primeWindows = parseWindowsInput(input["primeWindows"], "Horário nobre");
  if (input["primeCapPercent"] !== undefined) {
    out.primeCapPercent = intInRange(input["primeCapPercent"], NaN, 0, 100, "Limite do nobre: de 0 a 100%.");
  }
  if (input["waitlistAutoOffer"] !== undefined) {
    if (typeof input["waitlistAutoOffer"] !== "boolean") throw new HttpsError("invalid-argument", "Oferta automática inválida.");
    out.waitlistAutoOffer = input["waitlistAutoOffer"];
  }
  if (input["waitlistOfferHours"] !== undefined) {
    const hours = Number(input["waitlistOfferHours"]);
    if (!(WAITLIST_OFFER_HOURS as readonly number[]).includes(hours)) {
      throw new HttpsError("invalid-argument", "Prazo da oferta: 12, 24 ou 48 horas.");
    }
    out.waitlistOfferHours = hours;
  }
  if (input["onlineBillingEnabled"] !== undefined) {
    if (typeof input["onlineBillingEnabled"] !== "boolean") throw new HttpsError("invalid-argument", "Cobrança online inválida.");
    out.onlineBillingEnabled = input["onlineBillingEnabled"];
  }
  return out;
}

/**
 * Dias escolhidos pelo atleta/gestor: exatamente `timesPerWeek` dias distintos, todos com o horário
 * cabendo numa janela do plano. Lança `invalid-argument`.
 */
export function validateChosenSlots(
  plan: Pick<SchedulePlanData, "windows" | "timesPerWeek" | "durationMinutes">,
  rawWeekdays: unknown,
  rawStartTime: unknown,
): {weekdays: number[]; startTime: string; endTime: string} {
  const weekdays = Array.isArray(rawWeekdays) ?
    [...new Set((rawWeekdays as unknown[]).map(Number))].sort((a, b) => a - b) :
    [];
  const startTime = str(rawStartTime);
  if (weekdays.length !== plan.timesPerWeek || weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) {
    throw new HttpsError("invalid-argument", `Escolha ${plan.timesPerWeek} dia(s) da semana.`);
  }
  if (!isClockTime(startTime)) throw new HttpsError("invalid-argument", "Horário inválido.");
  for (const weekday of weekdays) {
    if (!startFitsWindows(plan.windows, weekday, startTime, plan.durationMinutes)) {
      throw new HttpsError("invalid-argument", "Esse horário está fora das janelas do plano.");
    }
  }
  return {weekdays, startTime, endTime: addMinutesToTime(startTime, plan.durationMinutes)};
}

