import { Timestamp, type DocumentSnapshot, type QueryDocumentSnapshot } from 'firebase/firestore';

/** Planos de horário (horário fixo vendido como plano) — espelha o contrato de
 *  `docs/superpowers/specs/2026-11-03-arena-planos-de-horario-design.md`. Tudo aqui é leitura:
 *  a escrita é 100% por callable (`schedule-plan-repository.ts`). */

export type SchedulePlanStatus = 'draft' | 'active' | 'archived';
export type ScheduleCycle = 'monthly' | 'quarterly' | 'annual';
export type SchedulePaymentForm = 'pix_auto' | 'card' | 'onsite';
export type ScheduleHolidayRule = 'makeup' | 'play';
export type ScheduleSubscriptionStatus = 'active' | 'paused' | 'suspended' | 'canceled';
export type ScheduleChargeStatus = 'open' | 'paid' | 'canceled';
/** Forma da baixa manual (o que o gestor recebeu). */
export type ScheduleManualMethod = 'pix' | 'cash' | 'card_machine' | 'transfer';
export type ScheduleWaitlistStatus = 'waiting' | 'offered' | 'accepted' | 'expired' | 'removed';
/** Quem cobra a mensalidade: `null` = a decidir (o gatilho decide uma vez), `manual` = baixa do
 *  gestor, `asaas` = link online (Pix ou cartão). */
export type ScheduleBillingMode = 'manual' | 'asaas' | null;
/** Estado do grupo de pagamento Asaas da mensalidade (espelho em `asaas.state`). */
export type ScheduleAsaasState = 'pending' | 'creating' | 'open' | 'paid' | 'voiding' | 'void' | 'failed' | 'needs_cpf';
export const SCHEDULE_ASAAS_STATES: readonly ScheduleAsaasState[] = ['pending', 'creating', 'open', 'paid', 'voiding', 'void', 'failed', 'needs_cpf'];

export interface PlanWindow {
  /** ISO 1 = segunda … 7 = domingo. */
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface PlanCycles {
  monthly: { enabled: boolean };
  quarterly: { enabled: boolean; discountPercent: number };
  annual: { enabled: boolean; discountPercent: number };
}

export interface PlanBilling {
  methods: SchedulePaymentForm[];
  /** 1–28; 0 = dia da assinatura. */
  dueDay: number;
  overdueReleaseDays: 1 | 3 | 7;
}

export interface PlanRules {
  makeup: { enabled: boolean; perMonth: number; validityDays: number; noticeHours: number };
  holiday: ScheduleHolidayRule;
  pause: { enabled: boolean; maxDaysPerYear: number };
  split: { enabled: boolean; maxPlayers: number };
  weather: boolean;
}

export interface SchedulePlan {
  id: string;
  name: string;
  description: string | null;
  status: SchedulePlanStatus;
  timesPerWeek: number;
  durationMinutes: number;
  windows: PlanWindow[];
  courtIds: string[];
  courtNames: string[];
  capacity: number;
  occupiedCount: number;
  waitingCount: number;
  monthlyPriceReais: number;
  referenceHourlyReais: number | null;
  cycles: PlanCycles;
  billing: PlanBilling;
  rules: PlanRules;
  createdAt: Date | null;
}

export interface ScheduleSettings {
  primeWindows: PlanWindow[];
  primeCapPercent: number;
  waitlistAutoOffer: boolean;
  waitlistOfferHours: 12 | 24 | 48;
  appliedHolidays: string[];
  /** Mensalidades de Pix/cartão saem por link online (Asaas). Padrão `false`. */
  onlineBillingEnabled: boolean;
}

export interface SubscriptionSlot {
  weekday: number;
  startTime: string;
  endTime: string;
  courtId: string;
  courtName: string;
  seriesId: string;
}

export interface SubscriptionMember {
  athleteId: string | null;
  name: string;
  photoUrl: string | null;
  shareReais: number;
  role: 'holder' | 'member';
}

export interface ScheduleSubscription {
  id: string;
  arenaId: string;
  planId: string;
  planName: string;
  durationMinutes: number;
  holderAthleteId: string | null;
  holderName: string;
  holderPhone: string | null;
  holderPhotoUrl: string | null;
  members: SubscriptionMember[];
  slots: SubscriptionSlot[];
  cycle: ScheduleCycle;
  monthlyPriceReais: number;
  commitmentEndsOn: string | null;
  paymentMethod: SchedulePaymentForm;
  dueDay: number;
  status: ScheduleSubscriptionStatus;
  endsOn: string | null;
  pausedUntil: string | null;
  makeupBalance: number;
  startDate: string;
  source: 'arena' | 'athlete' | 'waitlist';
  createdAt: Date | null;
}

export interface ScheduleCharge {
  id: string;
  arenaId: string;
  subscriptionId: string;
  planName: string;
  holderName: string;
  period: string;
  kind: 'first' | 'monthly' | 'resume';
  payerIndex: number;
  payerName: string;
  payerAthleteId: string | null;
  amountReais: number;
  dueDate: string;
  status: ScheduleChargeStatus;
  paidOn: string | null;
  paymentMethod: ScheduleManualMethod | null;
  billingMode: ScheduleBillingMode;
  /** Espelho do grupo Asaas (ausente = sem cobrança online). */
  asaas: ScheduleChargeAsaas | null;
  /** `asaas` = pago pelo link online. */
  paidVia: 'asaas' | 'manual' | null;
  /** `PIX`, `CREDIT_CARD`, … (só quando pago online). */
  onlineBillingType: string | null;
  platformFeeReais: number | null;
}

export interface ScheduleChargeAsaas {
  groupId: string;
  state: ScheduleAsaasState;
  invoiceUrl: string | null;
  /** Status cru do pagamento no Asaas (`PENDING`, `OVERDUE`, …). */
  status: string | null;
}

export interface WaitlistOffer {
  courtId: string;
  courtName: string;
  offeredAt: Date | null;
  expiresAt: Date | null;
}

export interface ScheduleWaitlistEntry {
  id: string;
  arenaId: string;
  planId: string;
  planName: string;
  weekdays: number[];
  startTime: string;
  athleteId: string | null;
  name: string;
  phone: string | null;
  photoUrl: string | null;
  playersCount: number;
  note: string | null;
  status: ScheduleWaitlistStatus;
  offer: WaitlistOffer | null;
  createdAt: Date | null;
}

/** Ocorrência de plano em `arenaBookings` (só o que o detalhe do assinante mostra). */
export interface PlanOccurrence {
  id: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  courtName: string;
  status: string;
  makeup: boolean;
}

// ── Padrões (contrato) ──────────────────────────────────────────────────────

export const DEFAULT_PLAN_CYCLES: PlanCycles = {
  monthly: { enabled: true },
  quarterly: { enabled: true, discountPercent: 5 },
  annual: { enabled: true, discountPercent: 10 },
};

export const DEFAULT_PLAN_BILLING: PlanBilling = { methods: ['pix_auto', 'card', 'onsite'], dueDay: 5, overdueReleaseDays: 3 };

export const DEFAULT_PLAN_RULES: PlanRules = {
  makeup: { enabled: true, perMonth: 2, validityDays: 30, noticeHours: 24 },
  holiday: 'makeup',
  pause: { enabled: true, maxDaysPerYear: 30 },
  split: { enabled: true, maxPlayers: 4 },
  weather: true,
};

export const DEFAULT_PRIME_WINDOWS: PlanWindow[] = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: '18:00', endTime: '23:00' }));

export const DEFAULT_SETTINGS: ScheduleSettings = {
  primeWindows: DEFAULT_PRIME_WINDOWS,
  primeCapPercent: 75,
  waitlistAutoOffer: true,
  waitlistOfferHours: 24,
  appliedHolidays: [],
  onlineBillingEnabled: false,
};

// ── Rótulos ─────────────────────────────────────────────────────────────────

export const CYCLE_LABEL: Record<ScheduleCycle, string> = { monthly: 'Mensal', quarterly: 'Trimestral', annual: 'Anual' };

export const PAYMENT_FORM_LABEL: Record<SchedulePaymentForm, string> = {
  pix_auto: 'Pix',
  card: 'Cartão',
  onsite: 'Na arena',
};

export const PAYMENT_FORMS: readonly SchedulePaymentForm[] = ['pix_auto', 'card', 'onsite'];

export const MANUAL_METHOD_LABEL: Record<ScheduleManualMethod, string> = {
  pix: 'PIX',
  cash: 'Dinheiro',
  card_machine: 'Maquininha',
  transfer: 'Transferência',
};

export const MANUAL_METHODS: readonly ScheduleManualMethod[] = ['pix', 'cash', 'card_machine', 'transfer'];

export const WEEKDAY_SHORT: Record<number, string> = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb', 7: 'Dom' };
export const WEEKDAY_LONG: Record<number, string> = {
  1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado', 7: 'Domingo',
};
export const WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5, 6, 7];

// ── Parse ───────────────────────────────────────────────────────────────────

type Snap = QueryDocumentSnapshot | DocumentSnapshot;
type Raw = Record<string, unknown>;

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function optStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function optNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
function toDate(v: unknown): Date | null {
  return v instanceof Timestamp ? v.toDate() : null;
}
function obj(v: unknown): Raw {
  return v != null && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {};
}
function arr(v: unknown): Raw[] {
  return Array.isArray(v) ? (v.filter((x) => x != null && typeof x === 'object') as Raw[]) : [];
}
function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
function hhmm(v: unknown): string {
  const t = str(v).trim();
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function windowsFromRaw(v: unknown): PlanWindow[] {
  return arr(v)
    .map((w) => ({ weekday: num(w['weekday'], 0), startTime: hhmm(w['startTime']), endTime: hhmm(w['endTime']) }))
    .filter((w) => w.weekday >= 1 && w.weekday <= 7 && w.startTime && w.endTime);
}

export function planFromRaw(id: string, d: Raw): SchedulePlan {
  const cycles = obj(d['cycles']);
  const q = obj(cycles['quarterly']);
  const a = obj(cycles['annual']);
  const billing = obj(d['billing']);
  const rules = obj(d['rules']);
  const makeup = obj(rules['makeup']);
  const pause = obj(rules['pause']);
  const split = obj(rules['split']);
  const release = num(billing['overdueReleaseDays'], 3);
  const methods = strings(billing['methods']).filter((m): m is SchedulePaymentForm => (PAYMENT_FORMS as readonly string[]).includes(m));
  return {
    id,
    name: str(d['name'], 'Plano'),
    description: optStr(d['description']),
    status: oneOf(d['status'], ['draft', 'active', 'archived'] as const, 'draft'),
    timesPerWeek: num(d['timesPerWeek'], 1),
    durationMinutes: num(d['durationMinutes'], 60),
    windows: windowsFromRaw(d['windows']),
    courtIds: strings(d['courtIds']),
    courtNames: strings(d['courtNames']),
    capacity: num(d['capacity'], 0),
    occupiedCount: num(d['occupiedCount'], 0),
    waitingCount: num(d['waitingCount'], 0),
    monthlyPriceReais: num(d['monthlyPriceReais'], 0),
    referenceHourlyReais: optNum(d['referenceHourlyReais']),
    cycles: {
      monthly: { enabled: bool(obj(cycles['monthly'])['enabled'], true) },
      quarterly: { enabled: bool(q['enabled'], DEFAULT_PLAN_CYCLES.quarterly.enabled), discountPercent: num(q['discountPercent'], 5) },
      annual: { enabled: bool(a['enabled'], DEFAULT_PLAN_CYCLES.annual.enabled), discountPercent: num(a['discountPercent'], 10) },
    },
    billing: {
      methods: Array.isArray(billing['methods']) ? methods : [...DEFAULT_PLAN_BILLING.methods],
      dueDay: num(billing['dueDay'], 5),
      overdueReleaseDays: release === 1 || release === 7 ? release : 3,
    },
    rules: {
      makeup: {
        enabled: bool(makeup['enabled'], true),
        perMonth: num(makeup['perMonth'], 2),
        validityDays: num(makeup['validityDays'], 30),
        noticeHours: num(makeup['noticeHours'], 24),
      },
      holiday: rules['holiday'] === 'play' ? 'play' : 'makeup',
      pause: { enabled: bool(pause['enabled'], true), maxDaysPerYear: num(pause['maxDaysPerYear'], 30) },
      split: { enabled: bool(split['enabled'], true), maxPlayers: num(split['maxPlayers'], 4) },
      weather: bool(rules['weather'], true),
    },
    createdAt: toDate(d['createdAt']),
  };
}

export function planFromDoc(doc: Snap): SchedulePlan {
  return planFromRaw(doc.id, (doc.data() ?? {}) as Raw);
}

export function settingsFromRaw(d: Raw | undefined): ScheduleSettings {
  if (!d) return { ...DEFAULT_SETTINGS, primeWindows: [...DEFAULT_PRIME_WINDOWS] };
  const hours = num(d['waitlistOfferHours'], 24);
  return {
    primeWindows: Array.isArray(d['primeWindows']) ? windowsFromRaw(d['primeWindows']) : [...DEFAULT_PRIME_WINDOWS],
    primeCapPercent: num(d['primeCapPercent'], 75),
    waitlistAutoOffer: bool(d['waitlistAutoOffer'], true),
    waitlistOfferHours: hours === 12 || hours === 48 ? hours : 24,
    appliedHolidays: strings(d['appliedHolidays']),
    onlineBillingEnabled: d['onlineBillingEnabled'] === true,
  };
}

export function subscriptionFromRaw(id: string, d: Raw): ScheduleSubscription {
  const snapshot = obj(d['planSnapshot']);
  return {
    id,
    arenaId: str(d['arenaId']),
    planId: str(d['planId']),
    planName: str(d['planName'], 'Plano'),
    durationMinutes: num(snapshot['durationMinutes'], 60),
    holderAthleteId: optStr(d['holderAthleteId']),
    holderName: str(d['holderName'], 'Assinante'),
    holderPhone: optStr(d['holderPhone']),
    holderPhotoUrl: optStr(d['holderPhotoUrl']),
    members: arr(d['members']).map((m) => ({
      athleteId: optStr(m['athleteId']),
      name: str(m['name'], 'Jogador'),
      photoUrl: optStr(m['photoUrl']),
      shareReais: num(m['shareReais'], 0),
      role: m['role'] === 'member' ? 'member' : 'holder',
    })),
    slots: arr(d['slots']).map((s) => ({
      weekday: num(s['weekday'], 0),
      startTime: hhmm(s['startTime']),
      endTime: hhmm(s['endTime']),
      courtId: str(s['courtId']),
      courtName: str(s['courtName'], 'Quadra'),
      seriesId: str(s['seriesId']),
    })),
    cycle: oneOf(d['cycle'], ['monthly', 'quarterly', 'annual'] as const, 'monthly'),
    monthlyPriceReais: num(d['monthlyPriceReais'], 0),
    commitmentEndsOn: optStr(d['commitmentEndsOn']),
    paymentMethod: oneOf(d['paymentMethod'], PAYMENT_FORMS, 'onsite'),
    dueDay: num(d['dueDay'], 5),
    status: oneOf(d['status'], ['active', 'paused', 'suspended', 'canceled'] as const, 'active'),
    endsOn: optStr(d['endsOn']),
    pausedUntil: optStr(d['pausedUntil']),
    makeupBalance: num(d['makeupBalance'], 0),
    startDate: str(d['startDate']),
    source: oneOf(d['source'], ['arena', 'athlete', 'waitlist'] as const, 'arena'),
    createdAt: toDate(d['createdAt']),
  };
}

export function subscriptionFromDoc(doc: Snap): ScheduleSubscription {
  return subscriptionFromRaw(doc.id, (doc.data() ?? {}) as Raw);
}

export function chargeFromRaw(id: string, d: Raw): ScheduleCharge {
  const method = d['paymentMethod'];
  return {
    id,
    arenaId: str(d['arenaId']),
    subscriptionId: str(d['subscriptionId']),
    planName: str(d['planName'], 'Plano'),
    holderName: str(d['holderName'], 'Assinante'),
    period: str(d['period']),
    kind: oneOf(d['kind'], ['first', 'monthly', 'resume'] as const, 'monthly'),
    payerIndex: num(d['payerIndex'], 0),
    payerName: str(d['payerName'], str(d['holderName'], 'Assinante')),
    payerAthleteId: optStr(d['payerAthleteId']),
    amountReais: num(d['amountReais'], 0),
    dueDate: str(d['dueDate']),
    status: oneOf(d['status'], ['open', 'paid', 'canceled'] as const, 'open'),
    paidOn: optStr(d['paidOn']),
    paymentMethod: typeof method === 'string' && (MANUAL_METHODS as readonly string[]).includes(method) ? (method as ScheduleManualMethod) : null,
    billingMode: d['billingMode'] === 'asaas' ? 'asaas' : d['billingMode'] === 'manual' ? 'manual' : null,
    asaas: chargeAsaasFromRaw(d['asaas']),
    paidVia: d['paidVia'] === 'asaas' ? 'asaas' : d['paidVia'] === 'manual' ? 'manual' : null,
    onlineBillingType: optStr(d['onlineBillingType']),
    platformFeeReais: optNum(d['platformFeeReais']),
  };
}

function chargeAsaasFromRaw(v: unknown): ScheduleChargeAsaas | null {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return null;
  const a = v as Raw;
  const groupId = str(a['groupId']);
  if (!groupId) return null;
  return {
    groupId,
    state: oneOf(a['state'], SCHEDULE_ASAAS_STATES, 'pending'),
    invoiceUrl: optStr(a['invoiceUrl']),
    status: optStr(a['status']),
  };
}

export function chargeFromDoc(doc: Snap): ScheduleCharge {
  return chargeFromRaw(doc.id, (doc.data() ?? {}) as Raw);
}

export function waitlistFromRaw(id: string, d: Raw): ScheduleWaitlistEntry {
  const offer = d['offer'] != null && typeof d['offer'] === 'object' ? obj(d['offer']) : null;
  return {
    id,
    arenaId: str(d['arenaId']),
    planId: str(d['planId']),
    planName: str(d['planName'], 'Plano'),
    weekdays: Array.isArray(d['weekdays'])
      ? (d['weekdays'] as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7).sort((a, b) => a - b)
      : [],
    startTime: hhmm(d['startTime']),
    athleteId: optStr(d['athleteId']),
    name: str(d['name'], 'Atleta'),
    phone: optStr(d['phone']),
    photoUrl: optStr(d['photoUrl']),
    playersCount: num(d['playersCount'], 1),
    note: optStr(d['note']),
    status: oneOf(d['status'], ['waiting', 'offered', 'accepted', 'expired', 'removed'] as const, 'waiting'),
    offer: offer
      ? { courtId: str(offer['courtId']), courtName: str(offer['courtName'], 'Quadra'), offeredAt: toDate(offer['offeredAt']), expiresAt: toDate(offer['expiresAt']) }
      : null,
    createdAt: toDate(d['createdAt']),
  };
}

export function waitlistFromDoc(doc: Snap): ScheduleWaitlistEntry {
  return waitlistFromRaw(doc.id, (doc.data() ?? {}) as Raw);
}

export function occurrenceFromDoc(doc: Snap): PlanOccurrence {
  const d = (doc.data() ?? {}) as Raw;
  return {
    id: doc.id,
    dateKey: str(d['dateKey'], str(d['date'])),
    startTime: hhmm(d['startTime']),
    endTime: hhmm(d['endTime']),
    courtName: str(d['courtName'], 'Quadra'),
    status: str(d['status']),
    makeup: typeof d['scheduleMakeupCreditId'] === 'string',
  };
}
