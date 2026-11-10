/**
 * CRM da arena — base de clientes, contratos de mensalista e conversão de avulso.
 * Spec: `docs/product/arena-crm.md`.
 *
 * Tudo aqui é puro (sem Firestore): datas, parcelas, status derivado, histórico por mês,
 * padrão de horário, filas do time e KPIs. `arena-crm.ts` só carrega os docs e chama isto.
 *
 * Duas fontes de mensalista entram na mesma base:
 *  - `arenaCrmContracts` — contrato registrado pela arena (plano livre ou de horário, período,
 *    vencimento 5/15/25, frequência combinada, parcelas com baixa manual);
 *  - `arenaScheduleSubscriptions` — assinantes dos Planos de horário (cobrança própria). Entram
 *    só para leitura: status vem das mensalidades deles, nada aqui escreve neles.
 */

export const CRM_CONTRACTS = "arenaCrmContracts";
export const CRM_CONTACTS = "arenaCrmContacts";
/** Subcoleção do contrato com a baixa de cada pagamento. */
export const CRM_PAYMENTS = "payments";
/** `arenas/{arenaId}/crmSettings/main`. */
export const CRM_SETTINGS = "crmSettings";
export const CRM_SETTINGS_DOC = "main";

export const CRM_PERIODS = ["monthly", "quarterly", "semiannual", "annual"] as const;
export type CrmPeriod = typeof CRM_PERIODS[number];
export const PERIOD_MONTHS: Record<CrmPeriod, number> = {monthly: 1, quarterly: 3, semiannual: 6, annual: 12};

export const CRM_DUE_DAYS = [5, 15, 25] as const;

export const CRM_STATUSES = ["active", "expiring", "not_renewed", "overdue", "canceled"] as const;
export type CrmStatus = typeof CRM_STATUSES[number];

export const CRM_CONTACT_CHANNELS = ["whatsapp", "call", "in_person", "note"] as const;
export type CrmContactChannel = typeof CRM_CONTACT_CHANNELS[number];
export const CRM_CONTACT_REASONS = ["overdue", "due", "renewal", "absence", "offer", "other"] as const;
export type CrmContactReason = typeof CRM_CONTACT_REASONS[number];
export const CRM_CONTACT_OUTCOMES = [
  "no_answer", "promised_payment", "interested", "converted", "declined", "done",
] as const;
export type CrmContactOutcome = typeof CRM_CONTACT_OUTCOMES[number];

export const CRM_PAYMENT_METHODS = ["pix", "cash", "card_machine", "transfer"] as const;
export type CrmPaymentMethod = typeof CRM_PAYMENT_METHODS[number];

/** Janela do histórico por mês (mês corrente + 5 anteriores). */
export const HISTORY_MONTHS = 6;
/** Dias antes do fim do contrato em que ele passa a "vencendo". */
export const EXPIRING_WINDOW_DAYS = 30;
/** Mensalista sem jogar há tantos dias entra em "sem frequência". */
export const ABSENT_AFTER_DAYS = 14;
/** "Não renovou" fica na fila por até tantos dias depois do fim. */
export const NOT_RENEWED_QUEUE_DAYS = 60;
/** Contato registrado há menos que isso desce o cliente na fila. */
export const RECENT_CONTACT_DAYS = 3;
/** Avulso precisa disso em 90 dias para virar oportunidade (≈ 2 jogos por mês). */
export const CONVERT_MIN_BOOKINGS_90D = 6;
/** …e jogar em pelo menos tantas das últimas 8 semanas. */
export const CONVERT_MIN_ACTIVE_WEEKS = 4;
/** Um horário vira "padrão" quando se repete em tantas das últimas 8 semanas. */
export const PATTERN_MIN_WEEKS = 3;
export const PATTERN_WEEKS = 8;

/** Fontes de reserva que são do cliente (aula, clubinho, torneio e bloqueio ficam de fora). */
const CUSTOMER_BOOKING_SOURCES = new Set(["platform", "manual", ""]);
const CANCELLED = new Set(["cancelled", "canceled"]);

// ── Datas (YYYY-MM-DD / YYYY-MM, sempre em UTC ao meio-dia) ─────────────────────

export function isDateKey(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
}

export function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T12:00:00Z`) - Date.parse(`${fromKey}T12:00:00Z`)) / 86_400_000);
}

export function monthOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

export function addMonthsToMonth(monthKey: string, months: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const idx = (y ?? 2000) * 12 + ((m ?? 1) - 1) + months;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y ?? 2000, m ?? 1, 0)).getUTCDate();
}

/** Mesma data N meses depois (dia limitado ao fim do mês: 31/01 + 1 = 28/02). */
export function addMonthsToDate(dateKey: string, months: number): string {
  const month = addMonthsToMonth(monthOf(dateKey), months);
  const day = Math.min(Number(dateKey.slice(8, 10)), daysInMonth(month));
  return `${month}-${String(day).padStart(2, "0")}`;
}

/** Dia da semana ISO (1 = segunda … 7 = domingo). */
export function isoWeekday(dateKey: string): number {
  return ((new Date(`${dateKey}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

// ── Identidade do cliente ───────────────────────────────────────────────────

/** Nome sem acento, minúsculo e com espaços simples — casa "João  Silva" com "joao silva". */
export function normalizeName(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** `a:<uid>` para atleta do app; `n:<nome normalizado>` para cliente só com nome. */
export function customerKeyOf(athleteId: string | null | undefined, name: string | null | undefined): string | null {
  const uid = typeof athleteId === "string" ? athleteId.trim() : "";
  if (uid) return `a:${uid}`;
  const n = typeof name === "string" ? normalizeName(name) : "";
  return n ? `n:${n}` : null;
}

/** Telefone BR pronto para `wa.me` (mesma regra de `normalizePhoneForWhatsApp`). */
export function whatsappDigits(phone: string | null | undefined): string | null {
  if (typeof phone !== "string") return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
}

// ── Contrato ────────────────────────────────────────────────────────────────

/** O que o doc `arenaCrmContracts` guarda (só o que a matemática usa). */
export interface CrmContractRecord {
  id: string;
  arenaId: string;
  customerKey: string;
  athleteId: string | null;
  customerName: string;
  customerPhone: string | null;
  planId: string | null;
  planName: string;
  period: CrmPeriod;
  dueDay: number;
  timesPerWeek: number;
  monthlyPriceReais: number;
  startDate: string;
  autoRenew: boolean;
  /** Parcelas pagas a partir da 1ª, em sequência. */
  paidInstallments: number;
  status: "active" | "canceled" | "renewed";
  canceledOn: string | null;
  cancelReason: string | null;
  renewedFromId: string | null;
  renewedToId: string | null;
  note: string | null;
  createdAt: string | null;
}

/** Contrato de qualquer fonte, já com o status do dia. */
export interface CrmContractView {
  id: string;
  source: "contract" | "schedule_plan";
  customerKey: string;
  planId: string | null;
  planName: string;
  period: CrmPeriod;
  dueDay: number;
  timesPerWeek: number;
  monthlyPriceReais: number;
  startDate: string;
  /** Fim do período atual (com renovação automática, o do ciclo corrente). `null` = sem fim. */
  endDate: string | null;
  autoRenew: boolean;
  status: CrmStatus;
  paused: boolean;
  /** Dias até o fim (negativo = já acabou). */
  daysToEnd: number | null;
  nextDueDate: string | null;
  overdueCount: number;
  overdueReais: number;
  /** Atraso da parcela mais antiga em aberto. */
  daysLate: number;
  paidInstallments: number;
  totalInstallments: number | null;
  canceledOn: string | null;
  renewedFromId: string | null;
  renewedToId: string | null;
  note: string | null;
}

export function periodMonths(period: CrmPeriod): number {
  return PERIOD_MONTHS[period];
}

/** Fim do 1º período: um dia antes da mesma data N meses depois. */
export function termEndDate(startDate: string, period: CrmPeriod): string {
  return addDays(addMonthsToDate(startDate, periodMonths(period)), -1);
}

/** Vencimento da parcela `k` (0 = 1ª): a 1ª vence no início; as outras, no `dueDay` de cada mês. */
export function installmentDueDate(startDate: string, dueDay: number, k: number): string {
  if (k === 0) return startDate;
  const month = addMonthsToMonth(monthOf(startDate), k);
  const day = Math.min(dueDay, daysInMonth(month));
  return `${month}-${String(day).padStart(2, "0")}`;
}

/** Fim do ciclo que contém `today` (renovação automática repete o período). */
function currentCycleEnd(startDate: string, period: CrmPeriod, today: string): string {
  const months = periodMonths(period);
  let cycle = 0;
  let end = termEndDate(startDate, period);
  while (end < today && cycle < 600) {
    cycle += 1;
    end = addDays(addMonthsToDate(startDate, months * (cycle + 1)), -1);
  }
  return end;
}

export function contractView(c: CrmContractRecord, today: string): CrmContractView {
  const months = periodMonths(c.period);
  const fixedEnd = termEndDate(c.startDate, c.period);
  const endDate = c.autoRenew ? currentCycleEnd(c.startDate, c.period, today) : fixedEnd;
  const totalInstallments = c.autoRenew ? null : months;
  const live = c.status === "active";

  // Parcelas vencidas e a próxima: só enquanto o contrato está vivo.
  let overdueCount = 0;
  let oldestOverdue: string | null = null;
  let nextDueDate: string | null = null;
  if (live) {
    const limit = totalInstallments ?? Number.POSITIVE_INFINITY;
    for (let k = Math.max(0, c.paidInstallments); k < limit && k < 600; k++) {
      const due = installmentDueDate(c.startDate, c.dueDay, k);
      if (due < today) {
        overdueCount += 1;
        oldestOverdue ??= due;
      } else {
        nextDueDate = due;
        break;
      }
    }
  }

  const daysToEnd = daysBetween(today, endDate);
  let status: CrmStatus;
  // Dívida vem antes de "não renovou": contrato que acabou devendo aparece na fila de cobrança.
  if (c.status === "canceled") status = "canceled";
  else if (overdueCount > 0) status = "overdue";
  else if (!c.autoRenew && fixedEnd < today && !c.renewedToId) status = "not_renewed";
  else if (!c.autoRenew && daysToEnd >= 0 && daysToEnd <= EXPIRING_WINDOW_DAYS) status = "expiring";
  else status = "active";

  return {
    id: c.id,
    source: "contract",
    customerKey: c.customerKey,
    planId: c.planId,
    planName: c.planName,
    period: c.period,
    dueDay: c.dueDay,
    timesPerWeek: c.timesPerWeek,
    monthlyPriceReais: c.monthlyPriceReais,
    startDate: c.startDate,
    endDate,
    autoRenew: c.autoRenew,
    status,
    paused: false,
    daysToEnd,
    nextDueDate,
    overdueCount,
    overdueReais: round2(overdueCount * c.monthlyPriceReais),
    daysLate: oldestOverdue ? daysBetween(oldestOverdue, today) : 0,
    paidInstallments: c.paidInstallments,
    totalInstallments,
    canceledOn: c.canceledOn,
    renewedFromId: c.renewedFromId,
    renewedToId: c.renewedToId,
    note: c.note,
  };
}

/** Início do contrato renovado: o dia seguinte ao fim, ou hoje se ele já acabou há tempo. */
export function renewalStartDate(previous: CrmContractRecord, today: string): string {
  const next = addDays(termEndDate(previous.startDate, previous.period), 1);
  return next < today ? today : next;
}

// ── Assinantes dos Planos de horário (só leitura) ─────────────────────────────

export interface ScheduleSubscriptionRecord {
  id: string;
  planId: string;
  planName: string;
  holderAthleteId: string | null;
  holderName: string;
  holderPhone: string | null;
  holderPhotoUrl: string | null;
  cycle: string;
  monthlyPriceReais: number;
  dueDay: number;
  slotsCount: number;
  status: string;
  endsOn: string | null;
  endRequestedBy: string | null;
  startDate: string;
}

export interface ScheduleChargeRecord {
  subscriptionId: string;
  amountReais: number;
  dueDate: string;
  status: string;
}

const CYCLE_TO_PERIOD: Record<string, CrmPeriod> = {monthly: "monthly", quarterly: "quarterly", annual: "annual"};

export function subscriptionView(
  s: ScheduleSubscriptionRecord,
  openCharges: ScheduleChargeRecord[],
  today: string,
): CrmContractView | null {
  if (s.status === "pending_payment") return null;
  const key = customerKeyOf(s.holderAthleteId, s.holderName);
  if (!key) return null;
  const overdue = openCharges.filter((ch) => ch.status === "open" && ch.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const upcoming = openCharges.filter((ch) => ch.status === "open" && ch.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const ended = s.status === "canceled" || (s.endsOn !== null && s.endsOn <= today);

  let status: CrmStatus;
  if (ended) status = s.endRequestedBy === "athlete" ? "not_renewed" : "canceled";
  else if (s.status === "suspended" || overdue.length > 0) status = "overdue";
  else if (s.endsOn !== null) status = "expiring";
  else status = "active";

  return {
    id: `sub:${s.id}`,
    source: "schedule_plan",
    customerKey: key,
    planId: s.planId,
    planName: s.planName,
    period: CYCLE_TO_PERIOD[s.cycle] ?? "monthly",
    dueDay: s.dueDay,
    timesPerWeek: Math.max(1, s.slotsCount),
    monthlyPriceReais: s.monthlyPriceReais,
    startDate: s.startDate,
    endDate: s.endsOn,
    autoRenew: s.endsOn === null,
    status,
    paused: s.status === "paused",
    daysToEnd: s.endsOn ? daysBetween(today, s.endsOn) : null,
    nextDueDate: upcoming[0]?.dueDate ?? null,
    overdueCount: overdue.length,
    overdueReais: round2(overdue.reduce((sum, ch) => sum + ch.amountReais, 0)),
    daysLate: overdue[0] ? daysBetween(overdue[0].dueDate, today) : 0,
    paidInstallments: 0,
    totalInstallments: null,
    canceledOn: ended ? (s.endsOn ?? today) : null,
    renewedFromId: null,
    renewedToId: null,
    note: null,
  };
}

// ── Reservas → histórico do cliente ───────────────────────────────────────────

export interface CrmBookingRecord {
  athleteId?: unknown;
  customerName?: unknown;
  date?: unknown;
  startTime?: unknown;
  status?: unknown;
  attendanceStatus?: unknown;
  amountReais?: unknown;
  isRecurring?: unknown;
  coveredByPlan?: unknown;
  scheduleSubscriptionId?: unknown;
  source?: unknown;
  bookedAs?: unknown;
}

export interface CrmMonth {
  month: string;
  total: number;
  plan: number;
  avulso: number;
  avulsoReais: number;
}

export interface CrmPatternSlot {
  weekday: number;
  startTime: string;
  weeks: number;
}

export interface CrmBookingStats {
  key: string;
  athleteId: string | null;
  name: string | null;
  months: CrmMonth[];
  firstDate: string | null;
  lastVisitDate: string | null;
  visits28d: number;
  avulso90d: number;
  avulsoReais90d: number;
  /** Semanas (das últimas 8) com pelo menos um avulso; índice 0 = a mais antiga. */
  weekHits: boolean[];
  pattern: CrmPatternSlot[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Meses da janela do histórico, do mais antigo ao corrente. */
export function historyMonths(today: string): string[] {
  const current = monthOf(today);
  return Array.from({length: HISTORY_MONTHS}, (_, i) => addMonthsToMonth(current, i - (HISTORY_MONTHS - 1)));
}

export function historyStartDate(today: string): string {
  return `${historyMonths(today)[0]}-01`;
}

/** Reserva que conta para o CRM: do cliente, não cancelada, já aconteceu (≤ hoje). */
function customerBooking(b: CrmBookingRecord, today: string): boolean {
  const date = str(b.date);
  if (!isDateKey(date) || date > today) return false;
  if (CANCELLED.has(str(b.status).toLowerCase())) return false;
  if (!CUSTOMER_BOOKING_SOURCES.has(str(b.source))) return false;
  if (str(b.bookedAs) === "professor") return false;
  return true;
}

function isPlanBooking(b: CrmBookingRecord): boolean {
  return b.isRecurring === true || b.coveredByPlan === true || str(b.scheduleSubscriptionId) !== "";
}

export function aggregateBookings(bookings: CrmBookingRecord[], today: string): Map<string, CrmBookingStats> {
  const months = historyMonths(today);
  const from = historyStartDate(today);
  const d28 = addDays(today, -27);
  const d90 = addDays(today, -89);
  const weeksFrom = addDays(today, -(PATTERN_WEEKS * 7 - 1));
  const out = new Map<string, CrmBookingStats & {slotWeeks: Map<string, Set<number>>}>();

  for (const b of bookings) {
    if (!customerBooking(b, today)) continue;
    const date = str(b.date);
    if (date < from) continue;
    const athleteId = str(b.athleteId) || null;
    const name = str(b.customerName) || null;
    const key = customerKeyOf(athleteId, name);
    if (!key) continue;

    let s = out.get(key);
    if (!s) {
      s = {
        key, athleteId, name,
        months: months.map((month) => ({month, total: 0, plan: 0, avulso: 0, avulsoReais: 0})),
        firstDate: null, lastVisitDate: null, visits28d: 0, avulso90d: 0, avulsoReais90d: 0,
        weekHits: Array.from({length: PATTERN_WEEKS}, () => false), pattern: [],
        slotWeeks: new Map(),
      };
      out.set(key, s);
    }
    if (!s.name && name) s.name = name;

    const plan = isPlanBooking(b);
    const amount = num(b.amountReais);
    const m = s.months[months.indexOf(monthOf(date))];
    if (m) {
      m.total += 1;
      if (plan) m.plan += 1;
      else {
        m.avulso += 1;
        m.avulsoReais = round2(m.avulsoReais + amount);
      }
    }
    if (!s.firstDate || date < s.firstDate) s.firstDate = date;

    const noShow = str(b.attendanceStatus).toLowerCase() === "no_show";
    if (!noShow) {
      if (!s.lastVisitDate || date > s.lastVisitDate) s.lastVisitDate = date;
      if (date >= d28) s.visits28d += 1;
    }
    if (!plan && date >= d90) {
      s.avulso90d += 1;
      s.avulsoReais90d = round2(s.avulsoReais90d + amount);
    }
    // Horário de sempre olha tudo (plano e avulso); as semanas ativas da conversão, só avulso.
    if (date >= weeksFrom) {
      const week = Math.floor(daysBetween(weeksFrom, date) / 7);
      if (!plan) s.weekHits[week] = true;
      const time = str(b.startTime).slice(0, 5);
      if (time) {
        const slot = `${isoWeekday(date)}|${time}`;
        const set = s.slotWeeks.get(slot) ?? new Set<number>();
        set.add(week);
        s.slotWeeks.set(slot, set);
      }
    }
  }

  const result = new Map<string, CrmBookingStats>();
  for (const [key, s] of out) {
    const {slotWeeks, ...stats} = s;
    stats.pattern = [...slotWeeks.entries()]
      .map(([slot, weeks]) => {
        const [weekday, startTime] = slot.split("|");
        return {weekday: Number(weekday), startTime: startTime ?? "", weeks: weeks.size};
      })
      .filter((p) => p.weeks >= PATTERN_MIN_WEEKS)
      .sort((a, b) => b.weeks - a.weeks || a.weekday - b.weekday)
      .slice(0, 3)
      .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
    result.set(key, stats);
  }
  return result;
}

// ── Conversão ─────────────────────────────────────────────────────────────────

export interface CrmPlanOption {
  id: string;
  name: string;
  monthlyPriceReais: number;
  timesPerWeek: number;
  windows: Array<{weekday: number; startTime: string; endTime: string}>;
}

export interface CrmConversion {
  score: number;
  avulso90d: number;
  activeWeeks: number;
  avgMonthlyReais: number;
  suggestion: {planId: string; planName: string; monthlyPriceReais: number; savingsReais: number} | null;
}

function windowCovers(w: CrmPlanOption["windows"][number], slot: CrmPatternSlot): boolean {
  return w.weekday === slot.weekday && w.startTime <= slot.startTime && slot.startTime < w.endTime;
}

/** Plano que mais se parece com o que o cliente já joga: cobre o horário e tem a frequência certa. */
export function suggestPlan(stats: CrmBookingStats, plans: CrmPlanOption[]): CrmPlanOption | null {
  if (plans.length === 0) return null;
  const perWeek = Math.max(1, Math.round(stats.avulso90d / 13));
  const ranked = plans
    .map((p) => {
      const covered = stats.pattern.filter((slot) => p.windows.some((w) => windowCovers(w, slot))).length;
      return {p, covered, diff: Math.abs(p.timesPerWeek - perWeek)};
    })
    .sort((a, b) => b.covered - a.covered || a.diff - b.diff || a.p.monthlyPriceReais - b.p.monthlyPriceReais);
  return ranked[0]?.p ?? null;
}

export function conversionOf(stats: CrmBookingStats, plans: CrmPlanOption[]): CrmConversion | null {
  const activeWeeks = stats.weekHits.filter(Boolean).length;
  if (stats.avulso90d < CONVERT_MIN_BOOKINGS_90D || activeWeeks < CONVERT_MIN_ACTIVE_WEEKS) return null;
  const avgMonthlyReais = round2(stats.avulsoReais90d / 3);
  const plan = suggestPlan(stats, plans);
  return {
    score: stats.avulso90d + activeWeeks * 2 + stats.pattern.reduce((s, p) => s + p.weeks, 0),
    avulso90d: stats.avulso90d,
    activeWeeks,
    avgMonthlyReais,
    suggestion: plan ? {
      planId: plan.id,
      planName: plan.name,
      monthlyPriceReais: plan.monthlyPriceReais,
      savingsReais: round2(avgMonthlyReais - plan.monthlyPriceReais),
    } : null,
  };
}

// ── Contatos ──────────────────────────────────────────────────────────────────

export interface CrmContactRecord {
  id: string;
  customerKey: string;
  contractId: string | null;
  channel: CrmContactChannel;
  reason: CrmContactReason;
  outcome: CrmContactOutcome;
  note: string | null;
  at: string;
  byName: string | null;
}

// ── Montagem da base ──────────────────────────────────────────────────────────

export type CrmCustomerKind = "member" | "former" | "walk_in";

export interface CrmCustomer {
  key: string;
  athleteId: string | null;
  name: string;
  photoUrl: string | null;
  phone: string | null;
  whatsapp: string | null;
  kind: CrmCustomerKind;
  status: CrmStatus | "walk_in";
  contract: CrmContractView | null;
  months: CrmMonth[];
  bookings6m: number;
  avulsoReais6m: number;
  firstDate: string | null;
  lastVisitDate: string | null;
  daysSinceVisit: number | null;
  visitsPerWeek: number;
  pattern: CrmPatternSlot[];
  weekHits: boolean[];
  conversion: CrmConversion | null;
  absent: boolean;
  lastContact: CrmContactRecord | null;
}

export interface CrmIdentity {
  name: string | null;
  photoUrl: string | null;
  phone: string | null;
}

export interface CrmQueueItem {
  key: string;
  /** `installment` = mensalidade vence; `term_end` = contrato termina. */
  kind?: "installment" | "term_end";
  date?: string | null;
  amountReais: number;
  contactedRecently: boolean;
}

export interface CrmQueues {
  dueThisWeek: CrmQueueItem[];
  notRenewed: CrmQueueItem[];
  overdue: CrmQueueItem[];
  absent: CrmQueueItem[];
  convert: CrmQueueItem[];
}

export interface CrmKpis {
  mrrReais: number;
  members: number;
  /** Receita recorrente no fim de cada mês da janela (o último é hoje). */
  mrrSeries: Array<{month: string; mrrReais: number}>;
  atRiskReais: number;
  atRiskCount: number;
  overdueReais: number;
  renewalRate90d: number | null;
  renewed90d: number;
  ended90d: number;
  convertCount: number;
  convertPotentialReais: number;
  newMembersThisMonth: number;
  newMembersReaisThisMonth: number;
  monthlyGoal: number;
  funnel: {walkIns: number; frequent: number; offered: number; converted: number; convertedReais: number};
  byStatus: Record<CrmStatus | "walk_in", number>;
}

export interface CrmOverview {
  today: string;
  customers: CrmCustomer[];
  queues: CrmQueues;
  kpis: CrmKpis;
  plans: CrmPlanOption[];
}

export interface BuildOverviewInput {
  today: string;
  contracts: CrmContractRecord[];
  subscriptions: ScheduleSubscriptionRecord[];
  openCharges: ScheduleChargeRecord[];
  bookings: CrmBookingRecord[];
  contacts: CrmContactRecord[];
  plans: CrmPlanOption[];
  identities: Map<string, CrmIdentity>;
  monthlyGoal: number;
  /** Estatísticas já prontas (cache); quando vêm, `bookings` é ignorado. */
  bookingStats?: Map<string, CrmBookingStats>;
}

const LIVE: ReadonlySet<CrmStatus> = new Set(["active", "expiring", "overdue"]);
const STATUS_RANK: Record<CrmStatus, number> = {overdue: 0, expiring: 1, active: 2, not_renewed: 3, canceled: 4};

/** Contrato que representa o cliente hoje: o vivo mais urgente; senão o encerrado mais recente. */
function pickCurrent(views: CrmContractView[]): CrmContractView | null {
  if (views.length === 0) return null;
  // Renovado sai de cena, a não ser que ainda tenha parcela atrasada (a dívida aparece).
  const current = views.filter((v) => !v.renewedToId || v.status === "overdue");
  const pool = current.length > 0 ? current : views;
  return [...pool].sort((a, b) =>
    (LIVE.has(a.status) ? 0 : 1) - (LIVE.has(b.status) ? 0 : 1) ||
    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    b.startDate.localeCompare(a.startDate),
  )[0] ?? null;
}

/** Contrato vivo num dia (para a série da receita recorrente). */
function liveOn(v: CrmContractView, day: string): boolean {
  if (v.startDate > day) return false;
  if (v.canceledOn && v.canceledOn <= day) return false;
  if (v.source === "contract" && !v.autoRenew && v.endDate && v.endDate < day) return false;
  return true;
}

export function buildOverview(input: BuildOverviewInput): CrmOverview {
  const {today} = input;
  const stats = input.bookingStats ?? aggregateBookings(input.bookings, today);

  const views: CrmContractView[] = [];
  for (const c of input.contracts) views.push(contractView(c, today));
  const chargesBySub = new Map<string, ScheduleChargeRecord[]>();
  for (const ch of input.openCharges) {
    const list = chargesBySub.get(ch.subscriptionId) ?? [];
    list.push(ch);
    chargesBySub.set(ch.subscriptionId, list);
  }
  for (const s of input.subscriptions) {
    const v = subscriptionView(s, chargesBySub.get(s.id) ?? [], today);
    if (v) views.push(v);
  }

  const viewsByKey = new Map<string, CrmContractView[]>();
  for (const v of views) {
    const list = viewsByKey.get(v.customerKey) ?? [];
    list.push(v);
    viewsByKey.set(v.customerKey, list);
  }

  const lastContactByKey = new Map<string, CrmContactRecord>();
  for (const c of input.contacts) {
    const prev = lastContactByKey.get(c.customerKey);
    if (!prev || c.at > prev.at) lastContactByKey.set(c.customerKey, c);
  }

  // Nome/telefone dos contratos e assinaturas (quando o cliente não é atleta do app).
  const contractNames = new Map<string, {name: string; phone: string | null; athleteId: string | null}>();
  for (const c of input.contracts) {
    contractNames.set(c.customerKey, {name: c.customerName, phone: c.customerPhone, athleteId: c.athleteId});
  }
  for (const s of input.subscriptions) {
    const key = customerKeyOf(s.holderAthleteId, s.holderName);
    if (key && !contractNames.has(key)) contractNames.set(key, {name: s.holderName, phone: s.holderPhone, athleteId: s.holderAthleteId});
  }

  const keys = new Set<string>([...stats.keys(), ...viewsByKey.keys()]);
  const emptyMonths = historyMonths(today).map((month) => ({month, total: 0, plan: 0, avulso: 0, avulsoReais: 0}));
  const customers: CrmCustomer[] = [];

  for (const key of keys) {
    const st = stats.get(key) ?? null;
    const contract = pickCurrent(viewsByKey.get(key) ?? []);
    const fromContract = contractNames.get(key);
    const identity = input.identities.get(key);
    const athleteId = key.startsWith("a:") ? key.slice(2) : null;
    const name = identity?.name || fromContract?.name || st?.name || "Cliente";
    const phone = fromContract?.phone || identity?.phone || null;
    const live = contract !== null && LIVE.has(contract.status);
    const lastVisitDate = st?.lastVisitDate ?? null;
    const daysSinceVisit = lastVisitDate ? daysBetween(lastVisitDate, today) : null;
    const absent = live && !contract.paused &&
      daysBetween(contract.startDate, today) >= ABSENT_AFTER_DAYS &&
      (daysSinceVisit === null || daysSinceVisit >= ABSENT_AFTER_DAYS);

    customers.push({
      key,
      athleteId,
      name,
      photoUrl: identity?.photoUrl ?? null,
      phone,
      whatsapp: whatsappDigits(phone),
      kind: contract === null ? "walk_in" : live ? "member" : "former",
      status: contract === null ? "walk_in" : contract.status,
      contract,
      months: st?.months ?? emptyMonths,
      bookings6m: st ? st.months.reduce((s, m) => s + m.total, 0) : 0,
      avulsoReais6m: st ? round2(st.months.reduce((s, m) => s + m.avulsoReais, 0)) : 0,
      firstDate: st?.firstDate ?? null,
      lastVisitDate,
      daysSinceVisit,
      visitsPerWeek: st ? round2(st.visits28d / 4) : 0,
      pattern: st?.pattern ?? [],
      weekHits: st?.weekHits ?? Array.from({length: PATTERN_WEEKS}, () => false),
      conversion: live || !st ? null : conversionOf(st, input.plans),
      absent,
      lastContact: lastContactByKey.get(key) ?? null,
    });
  }

  customers.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const queues = buildQueues(customers, today);
  const kpis = buildKpis(customers, views, input, today);
  return {today, customers, queues, kpis, plans: input.plans};
}

function recentlyContacted(c: CrmCustomer, today: string): boolean {
  return !!c.lastContact && daysBetween(c.lastContact.at.slice(0, 10), today) < RECENT_CONTACT_DAYS;
}

/** Contatado há pouco desce; o resto mantém a ordem de urgência. */
function settle(items: CrmQueueItem[]): CrmQueueItem[] {
  return [...items.filter((i) => !i.contactedRecently), ...items.filter((i) => i.contactedRecently)];
}

export function buildQueues(customers: CrmCustomer[], today: string): CrmQueues {
  const weekEnd = addDays(today, 6);
  const due: Array<CrmQueueItem & {sort: string}> = [];
  const notRenewed: Array<CrmQueueItem & {sort: number}> = [];
  const overdue: Array<CrmQueueItem & {sort: number}> = [];
  const absent: Array<CrmQueueItem & {sort: number}> = [];
  const convert: Array<CrmQueueItem & {sort: number}> = [];

  for (const c of customers) {
    const v = c.contract;
    const recent = recentlyContacted(c, today);
    if (v && (v.status === "active" || v.status === "expiring")) {
      if (v.nextDueDate && v.nextDueDate <= weekEnd) {
        due.push({key: c.key, kind: "installment", date: v.nextDueDate, amountReais: v.monthlyPriceReais, contactedRecently: recent, sort: v.nextDueDate});
      } else if (!v.autoRenew && v.endDate && v.endDate >= today && v.endDate <= weekEnd) {
        due.push({key: c.key, kind: "term_end", date: v.endDate, amountReais: v.monthlyPriceReais, contactedRecently: recent, sort: v.endDate});
      }
    }
    if (v && v.status === "not_renewed" && v.endDate && daysBetween(v.endDate, today) <= NOT_RENEWED_QUEUE_DAYS) {
      notRenewed.push({key: c.key, date: v.endDate, amountReais: v.monthlyPriceReais, contactedRecently: recent, sort: daysBetween(v.endDate, today)});
    }
    if (v && v.status === "overdue") {
      overdue.push({key: c.key, date: null, amountReais: v.overdueReais, contactedRecently: recent, sort: v.daysLate});
    }
    if (c.absent) {
      absent.push({key: c.key, date: c.lastVisitDate, amountReais: v?.monthlyPriceReais ?? 0, contactedRecently: recent, sort: c.daysSinceVisit ?? 9999});
    }
    if (c.conversion) {
      convert.push({key: c.key, date: c.lastVisitDate, amountReais: c.conversion.avgMonthlyReais, contactedRecently: recent, sort: c.conversion.score});
    }
  }

  const strip = <T extends CrmQueueItem & {sort: unknown}>(list: T[]): CrmQueueItem[] =>
    list.map(({sort: _sort, ...item}) => item);
  return {
    dueThisWeek: settle(strip(due.sort((a, b) => a.sort.localeCompare(b.sort)))),
    notRenewed: settle(strip(notRenewed.sort((a, b) => a.sort - b.sort))),
    overdue: settle(strip(overdue.sort((a, b) => b.sort - a.sort))),
    absent: settle(strip(absent.sort((a, b) => b.sort - a.sort))),
    convert: settle(strip(convert.sort((a, b) => b.sort - a.sort))),
  };
}

function buildKpis(customers: CrmCustomer[], views: CrmContractView[], input: BuildOverviewInput, today: string): CrmKpis {
  // Receita recorrente = contratos vivos no dia (o que acabou devendo é cobrança, não recorrência).
  const liveByCustomer = (day: string): Map<string, number> => {
    const perCustomer = new Map<string, number>();
    for (const v of views) {
      if (v.paused && day === today) continue;
      if (liveOn(v, day)) perCustomer.set(v.customerKey, Math.max(perCustomer.get(v.customerKey) ?? 0, v.monthlyPriceReais));
    }
    return perCustomer;
  };
  const sum = (m: Map<string, number>): number => round2([...m.values()].reduce((s, x) => s + x, 0));
  const mrrSeries = historyMonths(today).map((month) => {
    const day = month === monthOf(today) ? today : addDays(`${addMonthsToMonth(month, 1)}-01`, -1);
    return {month, mrrReais: sum(liveByCustomer(day))};
  });
  const liveToday = liveByCustomer(today);
  const mrrReais = sum(liveToday);

  const risky = customers.filter((c) => c.kind === "member" && (c.status === "overdue" || c.status === "expiring" || c.absent));
  const d90 = addDays(today, -90);

  const ended = input.contracts.filter((c) => {
    if (c.autoRenew || c.status === "canceled") return false;
    const end = termEndDate(c.startDate, c.period);
    return end >= d90 && end < today;
  });
  const renewed = ended.filter((c) => !!c.renewedToId);

  const convertList = customers.filter((c) => c.conversion);
  const month = monthOf(today);
  const newThisMonth = views.filter((v) => !v.renewedFromId && monthOf(v.startDate) === month && v.startDate <= today);

  const byKey = new Map(customers.map((c) => [c.key, c]));
  const walkIns = customers.filter((c) => c.months.some((m) => m.avulso > 0) && (c.lastVisitDate ?? "") >= d90);
  const frequent = customers.filter((c) => c.weekHits.filter(Boolean).length >= CONVERT_MIN_ACTIVE_WEEKS || (c.conversion !== null));
  const offered = new Set(input.contacts.filter((c) => c.reason === "offer" && c.at.slice(0, 10) >= d90).map((c) => c.customerKey));
  const convertedViews = views.filter((v) => !v.renewedFromId && v.startDate >= d90 && v.startDate <= today);
  const converted = convertedViews.filter((v) => {
    const c = byKey.get(v.customerKey);
    return !!c?.firstDate && c.firstDate < v.startDate;
  });

  const byStatus: Record<CrmStatus | "walk_in", number> = {active: 0, expiring: 0, not_renewed: 0, overdue: 0, canceled: 0, walk_in: 0};
  for (const c of customers) byStatus[c.status] += 1;

  return {
    mrrReais,
    members: liveToday.size,
    mrrSeries,
    atRiskReais: round2(risky.reduce((s, c) => s + (c.contract?.monthlyPriceReais ?? 0), 0)),
    atRiskCount: risky.length,
    overdueReais: round2(customers.reduce((s, c) => s + (c.contract?.status === "overdue" ? c.contract.overdueReais : 0), 0)),
    renewalRate90d: ended.length === 0 ? null : Math.round((renewed.length / ended.length) * 100),
    renewed90d: renewed.length,
    ended90d: ended.length,
    convertCount: convertList.length,
    convertPotentialReais: round2(convertList.reduce((s, c) => s + (c.conversion?.suggestion?.monthlyPriceReais ?? c.conversion?.avgMonthlyReais ?? 0), 0)),
    newMembersThisMonth: newThisMonth.length,
    newMembersReaisThisMonth: round2(newThisMonth.reduce((s, v) => s + v.monthlyPriceReais, 0)),
    monthlyGoal: input.monthlyGoal,
    funnel: {
      walkIns: walkIns.length,
      frequent: frequent.length,
      offered: offered.size,
      converted: converted.length,
      convertedReais: round2(converted.reduce((s, v) => s + v.monthlyPriceReais, 0)),
    },
    byStatus,
  };
}
