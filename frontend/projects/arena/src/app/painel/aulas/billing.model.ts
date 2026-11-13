import { Timestamp, type DocumentSnapshot, type QueryDocumentSnapshot } from 'firebase/firestore';
import { WEEKDAY_SHORT, addDaysKey } from './class.model';

/** Espelha `functions/src/arena-class-billing.ts` / `arena-class-makeup.ts` — fase 2 de Aulas.
 *  Cobrança manual: mensalidade gerada pelo sistema, pagamento registrado pelo gestor. */

export type PlanKind = 'monthly' | 'package' | 'single';
export type PaymentMethod = 'pix' | 'cash' | 'card_machine' | 'transfer';
/** `pending_payment` = contratado pelo app com Pix/cartão, esperando o 1º pagamento (vaga segurada 30 min). */
export type EnrollmentStatus = 'active' | 'paused' | 'canceled' | 'ended' | 'pending_payment';
export type ChargeStatus = 'open' | 'paid' | 'canceled';
/** `asaas` = mensalidade cobrada online (fatura Asaas: PIX ou cartão). */
export type BillingMode = 'manual' | 'asaas';
export type AsaasState = 'pending' | 'creating' | 'open' | 'paid' | 'voiding' | 'void' | 'failed' | 'needs_cpf';

/** Espelho da fatura Asaas na mensalidade (o grupo de pagamento é só do servidor). */
export interface ChargeAsaas {
  groupId: string;
  state: AsaasState;
  invoiceUrl: string | null;
  /** Status cru do Asaas (`PENDING`, `OVERDUE`, `RECEIVED`…). */
  status: string | null;
}

export interface ClassPlan {
  id: string;
  name: string;
  kind: PlanKind;
  priceReais: number;
  classesPerWeek: number | null;
  makeupsPerMonth: number | null;
  credits: number | null;
  validityDays: number | null;
  description: string | null;
  status: 'active' | 'archived';
  /** Professores (`classTeachers`) que dão aula no plano; vazio = qualquer turma. */
  teacherIds: string[];
  /** O atleta contrata e assina o contrato pelo app. */
  availableInApp: boolean;
  /** Ciclos do plano mensal: desconto sobre o mensal; ausente no doc = só o mensal. */
  cycles: PlanCycles;
  /** Formas aceitas e vencimento (fixo, das Regras ou à escolha do atleta). */
  billing: PlanBilling;
  /** Aviso prévio e multa por sair antes da fidelidade (ausente no doc = 30 dias e 50%). */
  cancellation: CancellationPolicy;
}

export type PlanCycle = 'monthly' | 'quarterly' | 'semiannual' | 'annual';
export type LongCycle = Exclude<PlanCycle, 'monthly'>;
export const PLAN_CYCLES: readonly PlanCycle[] = ['monthly', 'quarterly', 'semiannual', 'annual'];
export const LONG_CYCLES: readonly LongCycle[] = ['quarterly', 'semiannual', 'annual'];
/** Fidelidade (meses de compromisso). */
export const CYCLE_MONTHS: Record<PlanCycle, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };
/** Meses pagos de uma vez: só o anual é à vista. */
export const PREPAID_MONTHS: Record<PlanCycle, number> = { monthly: 1, quarterly: 1, semiannual: 1, annual: 12 };
export const MAX_CYCLE_DISCOUNT_PERCENT = 50;
export const CYCLE_LABEL: Record<PlanCycle, string> = {
  monthly: 'Mensal', quarterly: 'Trimestral', semiannual: 'Semestral', annual: 'Anual',
};

export interface PlanCycleConfig {
  enabled: boolean;
  /** Desconto sobre o mensal, 0–50 (sempre 0 no mensal). */
  discountPercent: number;
}
export type PlanCycles = Record<PlanCycle, PlanCycleConfig>;

export const DEFAULT_PLAN_CYCLES: PlanCycles = {
  monthly: { enabled: true, discountPercent: 0 },
  quarterly: { enabled: false, discountPercent: 0 },
  semiannual: { enabled: false, discountPercent: 0 },
  annual: { enabled: false, discountPercent: 0 },
};

/** Formas que o plano aceita: Pix e cartão pelo app, ou na arena. */
export type ClassPaymentForm = 'pix' | 'card' | 'onsite';
export const CLASS_PAYMENT_FORMS: readonly ClassPaymentForm[] = ['pix', 'card', 'onsite'];
export const CLASS_PAYMENT_FORM_LABEL: Record<ClassPaymentForm, string> = { pix: 'Pix', card: 'Cartão', onsite: 'Na arena' };

export interface PlanBilling {
  methods: ClassPaymentForm[];
  /** Vencimento fixo; `null` = o das Regras de aulas. */
  dueDay: number | null;
  /** Dias que o atleta escolhe ao contratar (2 a 4). Vazio = vale `dueDay`. */
  dueDayOptions: number[];
}

export const DEFAULT_PLAN_BILLING: PlanBilling = { methods: [...CLASS_PAYMENT_FORMS], dueDay: null, dueDayOptions: [] };
/** "Atleta escolhe" — os mesmos dias do Plano de horário. */
export const ATHLETE_DUE_DAY_CHOICES: readonly number[] = [5, 15, 25];

export interface PlanCycleOption {
  cycle: PlanCycle;
  /** Fidelidade: 1 no mensal, 3/6/12 nos outros. */
  months: number;
  /** Meses pagos de uma vez: 12 no anual, 1 nos outros. */
  prepaidMonths: number;
  /** Desconto sobre o mensal, em % inteiro. */
  discountPercent: number;
  /** Valor por mês neste ciclo (mensal − desconto). */
  monthlyPriceReais: number;
  /** O que paga em cada cobrança cheia (anual: 12 meses). */
  totalReais: number;
}

/** Valor por mês com o desconto do ciclo (2 casas) — espelha o servidor. */
export function cycleMonthlyPrice(priceReais: number, discountPercent: number): number {
  return round2(priceReais * (1 - discountPercent / 100));
}

/** Ciclos ligados do plano mensal (espelha `planCycleOptions` do backend). Vazio fora do mensal. */
export function planCycles(plan: Pick<ClassPlan, 'kind' | 'priceReais'> & { cycles?: PlanCycles }): PlanCycleOption[] {
  if (plan.kind !== 'monthly') return [];
  const cycles = plan.cycles ?? DEFAULT_PLAN_CYCLES;
  return PLAN_CYCLES.filter((cycle) => cycles[cycle].enabled).map((cycle) => {
    const discountPercent = cycle === 'monthly' ? 0 : cycles[cycle].discountPercent;
    const monthlyPriceReais = cycleMonthlyPrice(plan.priceReais, discountPercent);
    const prepaidMonths = PREPAID_MONTHS[cycle];
    return {
      cycle, months: CYCLE_MONTHS[cycle], prepaidMonths, discountPercent,
      monthlyPriceReais, totalReais: round2(monthlyPriceReais * prepaidMonths),
    };
  });
}

function clampDiscount(raw: unknown): number {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.min(MAX_CYCLE_DISCOUNT_PERCENT, Math.max(0, n)) : 0;
}

export function parsePlanCycles(raw: unknown): PlanCycles {
  const d = raw != null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!d) return cloneCycles(DEFAULT_PLAN_CYCLES);
  const out = {} as PlanCycles;
  for (const cycle of PLAN_CYCLES) {
    const c = (d[cycle] ?? {}) as Record<string, unknown>;
    out[cycle] = {
      enabled: cycle === 'monthly' ? c['enabled'] !== false : c['enabled'] === true,
      discountPercent: cycle === 'monthly' ? 0 : clampDiscount(c['discountPercent']),
    };
  }
  return out;
}

function cloneCycles(c: PlanCycles): PlanCycles {
  return {
    monthly: { ...c.monthly }, quarterly: { ...c.quarterly }, semiannual: { ...c.semiannual }, annual: { ...c.annual },
  };
}

export function parsePlanBilling(raw: unknown): PlanBilling {
  const d = raw != null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!d) return { ...DEFAULT_PLAN_BILLING, methods: [...DEFAULT_PLAN_BILLING.methods] };
  const methods = Array.isArray(d['methods'])
    ? CLASS_PAYMENT_FORMS.filter((m) => (d['methods'] as unknown[]).includes(m))
    : [...CLASS_PAYMENT_FORMS];
  const dueDay = Number(d['dueDay']);
  const options = Array.isArray(d['dueDayOptions'])
    ? [...new Set((d['dueDayOptions'] as unknown[]).map(Number))].filter((n) => Number.isInteger(n) && n >= 1 && n <= 28).sort((a, b) => a - b)
    : [];
  return {
    methods: methods.length > 0 ? methods : [...CLASS_PAYMENT_FORMS],
    dueDay: d['dueDay'] != null && Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 28 ? dueDay : null,
    dueDayOptions: options.length >= 2 ? options.slice(0, 4) : [],
  };
}

// ── Cancelamento (espelha `functions/src/arena-class-cancellation-model.ts`) ──

export type PenaltyKind = 'none' | 'percent' | 'fixed';
const PENALTY_KINDS: readonly PenaltyKind[] = ['none', 'percent', 'fixed'];

export interface CancellationPolicy {
  /** Dias de aviso prévio (0–90): aulas e mensalidades seguem até o fim do aviso. */
  noticeDays: number;
  /** Multa por sair antes do fim da fidelidade: % das mensalidades que faltariam, ou valor fixo. */
  penalty: { kind: PenaltyKind; percent: number | null; amountReais: number | null };
}

/** Plano sem regra gravada: 30 dias de aviso e 50% das mensalidades que faltam. */
export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = {
  noticeDays: 30,
  penalty: { kind: 'percent', percent: 50, amountReais: null },
};

export function parseCancellationPolicy(raw: unknown): CancellationPolicy {
  const d = raw != null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!d) return { ...DEFAULT_CANCELLATION_POLICY, penalty: { ...DEFAULT_CANCELLATION_POLICY.penalty } };
  const notice = Number(d['noticeDays']);
  const p = (d['penalty'] ?? {}) as Record<string, unknown>;
  const kind = oneOf(p['kind'], PENALTY_KINDS, 'none');
  const percent = Number(p['percent']);
  const amount = Number(p['amountReais']);
  return {
    noticeDays: Number.isInteger(notice) && notice >= 0 && notice <= 90 ? notice : DEFAULT_CANCELLATION_POLICY.noticeDays,
    penalty: {
      kind,
      percent: kind === 'percent' && Number.isFinite(percent) && percent > 0 && percent <= 100 ? Math.round(percent) : null,
      amountReais: kind === 'fixed' && Number.isFinite(amount) && amount > 0 ? round2(amount) : null,
    },
  };
}

export type CancelReason = 'routine' | 'price' | 'health' | 'moved' | 'other';
export const CANCEL_REASONS: readonly CancelReason[] = ['routine', 'price', 'health', 'moved', 'other'];
/** `monthly` sem fidelidade · `commitment` trimestral/semestral · `prepaid` anual à vista · `package`. */
export type CancelKind = 'monthly' | 'commitment' | 'prepaid' | 'package';
export type PenaltyStatus = 'open' | 'paid' | 'waived' | 'none';

/** Pedido de cancelamento do aluno (matrícula segue até `endsOn`). */
export interface CancelRequest {
  requestedAt: Date | null;
  requestedOn: string;
  by: string;
  reason: CancelReason;
  note: string | null;
  kind: CancelKind;
  remainingMonths: number;
  penaltyReais: number;
  penaltyStatus: PenaltyStatus;
  waivedReason: string | null;
}

export function parseCancelRequest(raw: unknown): CancelRequest | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;
  const requestedOn = str(d['requestedOn']);
  if (!requestedOn) return null;
  return {
    requestedAt: toDate(d['requestedAt']),
    requestedOn,
    by: str(d['by'], 'athlete'),
    reason: oneOf(d['reason'], CANCEL_REASONS, 'other'),
    note: optStr(d['note']),
    kind: oneOf(d['kind'], ['monthly', 'commitment', 'prepaid', 'package'] as const, 'monthly'),
    remainingMonths: optNum(d['remainingMonths']) ?? 0,
    penaltyReais: optNum(d['penaltyReais']) ?? 0,
    penaltyStatus: oneOf(d['penaltyStatus'], ['open', 'paid', 'waived', 'none'] as const, 'none'),
    waivedReason: optStr(d['waivedReason']),
  };
}

export interface ClassRules {
  makeupValidityDays: number;
  excusedGeneratesCredit: boolean;
  arenaCancelGeneratesCredit: boolean;
  /** Horas de antecedência para o "Não vou" do aluno virar falta avisada com crédito (0–72). */
  makeupNoticeHours: number;
  defaultDueDay: number;
  enrollmentFeeReais: number;
  /** Push 2h antes da aula para alunos com conta e o professor. */
  classReminderEnabled: boolean;
  /** Mensalidade cobrada online pelo Asaas (PIX ou cartão na fatura). */
  onlineBillingEnabled: boolean;
}

export const DEFAULT_RULES: ClassRules = {
  makeupValidityDays: 30,
  excusedGeneratesCredit: true,
  arenaCancelGeneratesCredit: true,
  makeupNoticeHours: 4,
  defaultDueDay: 5,
  enrollmentFeeReais: 0,
  classReminderEnabled: true,
  onlineBillingEnabled: false,
};

export interface EnrollmentSlot {
  classId: string;
  className: string;
  weekday: number;
  startTime: string;
  teacherId: string;
}

export interface Enrollment {
  id: string;
  arenaId: string;
  studentId: string;
  athleteId: string | null;
  name: string;
  phone: string | null;
  /** Foto do atleta NexaGO no momento da matrícula. */
  photoUrl: string | null;
  plan: Omit<ClassPlan, 'id' | 'status' | 'teacherIds' | 'availableInApp' | 'cycles' | 'billing' | 'cancellation'> & { planId: string };
  slots: EnrollmentSlot[];
  status: EnrollmentStatus;
  dueDay: number;
  paymentMethod: PaymentMethod;
  billingMode: BillingMode;
  /** CPF do pagador mascarado (`***.456.789-**`), só na cobrança online. */
  cpfMasked: string | null;
  startDate: string;
  creditsLeft: number | null;
  expiresOn: string | null;
  createdAt: Date | null;
  canceledAt: Date | null;
  /** Ciclo contratado (fidelidade 3/6/12 meses; anual à vista). */
  cycle: PlanCycle;
  /** Fim da fidelidade (trimestral/semestral/anual); `null` no mensal. */
  commitmentEndsOn: string | null;
  /** Última aula de quem pediu para sair (fim do aviso ou do período pago); `null` = sem cancelamento. */
  endsOn: string | null;
  cancelRequest: CancelRequest | null;
  /** Regras de cancelamento congeladas na matrícula (antiga sem regra = padrão). */
  cancellationPolicy: CancellationPolicy;
}

export interface Charge {
  id: string;
  enrollmentId: string;
  studentId: string;
  athleteId: string | null;
  name: string;
  phone: string | null;
  description: string;
  period: string | null;
  amountReais: number;
  dueDate: string;
  status: ChargeStatus;
  paidOn: string | null;
  paymentMethod: PaymentMethod;
  billingMode: BillingMode;
  asaas: ChargeAsaas | null;
  /** `asaas` = pago pela fatura online; `manual` = baixa do gestor. */
  paidVia: 'asaas' | 'manual' | null;
  onlineBillingType: 'PIX' | 'CREDIT_CARD' | null;
}

export interface MakeupCredit {
  id: string;
  studentId: string;
  athleteId: string | null;
  name: string;
  enrollmentId: string | null;
  reason: 'excused' | 'arena_canceled';
  sourceDate: string;
  status: 'available' | 'used' | 'expired';
  expiresOn: string;
}

export interface WaitlistEntry {
  id: string;
  classId: string;
  athleteId: string | null;
  name: string;
  phone: string | null;
  note: string | null;
  status: 'waiting' | 'removed' | 'enrolled';
  createdAt: Date | null;
}

// ── Rótulos ─────────────────────────────────────────────────────────────────

export const PLAN_KIND_LABEL: Record<PlanKind, string> = {
  monthly: 'Mensalidade',
  package: 'Pacote',
  single: 'Avulsa',
};

export const PLAN_GROUP_LABEL: Record<PlanKind, string> = {
  monthly: 'Mensalidades',
  package: 'Pacotes',
  single: 'Avulsas',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: 'PIX',
  cash: 'Dinheiro',
  card_machine: 'Maquininha',
  transfer: 'Transferência',
};

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['pix', 'cash', 'card_machine', 'transfer'];

export function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: value % 1 === 0 ? 0 : 2 });
}

/** Valor digitado "1.320,50" → 1320.5 (NaN se não for número). */
export function parsePrice(raw: string): number {
  const n = Number(raw.replace(/\./g, '').replace(',', '.').trim());
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

export function planDetail(plan: Pick<ClassPlan, 'kind' | 'classesPerWeek' | 'makeupsPerMonth' | 'credits' | 'validityDays'>): string {
  if (plan.kind === 'monthly') {
    const makeups = plan.makeupsPerMonth ?? 0;
    return `${(plan.classesPerWeek ?? 1) * 4} aulas/mês · ${makeups} reposiç${makeups === 1 ? 'ão' : 'ões'}`;
  }
  if (plan.kind === 'package') return `${plan.credits ?? 0} créditos · validade ${plan.validityDays ?? 0} dias`;
  return 'Aula avulsa';
}

export function planPriceUnit(kind: PlanKind): string {
  return kind === 'monthly' ? '/mês' : kind === 'single' ? '/aula' : '';
}

export function slotsLabel(slots: readonly Pick<EnrollmentSlot, 'weekday' | 'startTime'>[]): string {
  const sorted = [...slots].sort((a, b) => a.weekday - b.weekday);
  const days = sorted.map((s) => WEEKDAY_SHORT[s.weekday] ?? '?');
  const times = [...new Set(sorted.map((s) => s.startTime))];
  const dayText = days.length <= 1 ? days.join('') : `${days.slice(0, -1).join(', ')} e ${days[days.length - 1]}`;
  return `${dayText}${times.length === 1 ? ' · ' + times[0] : ''}`;
}

export function enrollmentClassNames(slots: readonly Pick<EnrollmentSlot, 'className'>[]): string {
  return [...new Set(slots.map((s) => s.className))].join(', ');
}

// ── Situação de cobrança ────────────────────────────────────────────────────

export type ChargeState = 'paid' | 'overdue' | 'due_today' | 'upcoming' | 'canceled';

export function chargeState(charge: Pick<Charge, 'status' | 'dueDate'>, todayKey: string): ChargeState {
  if (charge.status === 'paid') return 'paid';
  if (charge.status === 'canceled') return 'canceled';
  if (charge.dueDate < todayKey) return 'overdue';
  if (charge.dueDate === todayKey) return 'due_today';
  return 'upcoming';
}

export type StudentPayState = 'ok' | 'today' | 'late' | 'paused' | 'awaiting';

export const PAY_STATE_LABEL: Record<StudentPayState, string> = {
  ok: 'Em dia',
  today: 'Vence hoje',
  late: 'Atrasado',
  paused: 'Pausado',
  awaiting: 'Aguardando pagamento',
};

export const PAY_STATE_TONE: Record<StudentPayState, 'green' | 'yellow' | 'red' | 'dim'> = {
  ok: 'green',
  today: 'yellow',
  late: 'red',
  paused: 'dim',
  awaiting: 'yellow',
};

/** Situação do aluno pelas cobranças abertas da matrícula. */
export function studentPayState(enrollment: Pick<Enrollment, 'status'>, openCharges: readonly Pick<Charge, 'status' | 'dueDate'>[], todayKey: string): StudentPayState {
  if (enrollment.status === 'paused') return 'paused';
  if (enrollment.status === 'pending_payment') return 'awaiting';
  const states = openCharges.map((c) => chargeState(c, todayKey));
  if (states.includes('overdue')) return 'late';
  if (states.includes('due_today')) return 'today';
  return 'ok';
}

export function daysLate(dueDate: string, todayKey: string): number {
  const [y1, m1, d1] = dueDate.split('-').map(Number);
  const [y2, m2, d2] = todayKey.split('-').map(Number);
  const a = Date.UTC(y1 ?? 0, (m1 ?? 1) - 1, d1 ?? 1);
  const b = Date.UTC(y2 ?? 0, (m2 ?? 1) - 1, d2 ?? 1);
  return Math.round((b - a) / 86_400_000);
}

export interface BillingTotals {
  overdueReais: number;
  overdueStudents: number;
  next7Reais: number;
  next7Count: number;
}

export function billingTotals(openCharges: readonly Charge[], todayKey: string): BillingTotals {
  const in7 = addDaysKey(todayKey, 7);
  const overdue = openCharges.filter((c) => c.status === 'open' && c.dueDate < todayKey);
  const next = openCharges.filter((c) => c.status === 'open' && c.dueDate >= todayKey && c.dueDate <= in7);
  return {
    overdueReais: round2(overdue.reduce((s, c) => s + c.amountReais, 0)),
    overdueStudents: new Set(overdue.map((c) => c.studentId)).size,
    next7Reais: round2(next.reduce((s, c) => s + c.amountReais, 0)),
    next7Count: next.length,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Link do WhatsApp com a mensagem de cobrança pronta (telefone com DDD, só dígitos); com a fatura
 *  online, a mensagem leva o link de pagamento (PIX ou cartão). */
/** Telefone do cadastro do atleta no formato do campo: `+5562982406456` → `(62) 98240-6456`.
 *  O cadastro é texto livre (SMS grava E.164, o antigo o que foi digitado), então o que não
 *  for número brasileiro reconhecível passa como veio. */
export function formatPhoneBR(raw: string | null): string {
  const text = (raw ?? '').trim();
  if (text.startsWith('+') && !text.startsWith('+55')) return text;
  let digits = text.replace(/\D/g, '');
  if (digits.length >= 12 && digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length !== 10 && digits.length !== 11) return text;
  const split = digits.length === 11 ? 7 : 6;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, split)}-${digits.slice(split)}`;
}

export function whatsappChargeLink(
  phone: string | null,
  name: string,
  charge: Pick<Charge, 'description' | 'amountReais' | 'dueDate'>,
  arenaName: string,
  invoiceUrl: string | null = null,
): string | null {
  return whatsappLink(phone, chargeMessageText(name, charge, arenaName, invoiceUrl));
}

/** Mensagem de cobrança (a mesma no WhatsApp e no chat do app); com a fatura online, leva o link
 *  de pagamento (PIX ou cartão). */
export function chargeMessageText(
  name: string,
  charge: Pick<Charge, 'description' | 'amountReais' | 'dueDate'>,
  arenaName: string,
  invoiceUrl: string | null = null,
): string {
  const [y, m, d] = charge.dueDate.split('-');
  const pay = invoiceUrl ? ` Pague por aqui, com PIX ou cartão: ${invoiceUrl}` : '';
  return `Olá, ${name.split(' ')[0]}! Aqui é da ${arenaName}. Segue a cobrança "${charge.description}" ` +
    `(${brl(charge.amountReais)}), com vencimento em ${d}/${m}/${y}.${pay} Qualquer dúvida, é só chamar.`;
}

export function whatsappLink(phone: string | null, text: string): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return `https://wa.me/${digits.length <= 11 ? '55' + digits : digits}?text=${encodeURIComponent(text)}`;
}

// ── Parse ───────────────────────────────────────────────────────────────────

type Snap = QueryDocumentSnapshot | DocumentSnapshot;

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function optStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}
function optNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function toDate(v: unknown): Date | null {
  return v instanceof Timestamp ? v.toDate() : null;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

const KINDS: readonly PlanKind[] = ['monthly', 'package', 'single'];

export function planFromDoc(doc: Snap): ClassPlan {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  return {
    id: doc.id,
    name: str(d['name'], 'Plano'),
    kind: oneOf(d['kind'], KINDS, 'single'),
    priceReais: optNum(d['priceReais']) ?? 0,
    classesPerWeek: optNum(d['classesPerWeek']),
    makeupsPerMonth: optNum(d['makeupsPerMonth']),
    credits: optNum(d['credits']),
    validityDays: optNum(d['validityDays']),
    description: optStr(d['description']),
    status: d['status'] === 'archived' ? 'archived' : 'active',
    teacherIds: Array.isArray(d['teacherIds'])
      ? (d['teacherIds'] as unknown[]).filter((v): v is string => typeof v === 'string' && v.length > 0)
      : [],
    availableInApp: d['availableInApp'] === true,
    cycles: parsePlanCycles(d['cycles']),
    billing: parsePlanBilling(d['billing']),
    cancellation: parseCancellationPolicy(d['cancellation']),
  };
}

export function rulesFromDoc(data: Record<string, unknown> | undefined): ClassRules {
  const d = data ?? {};
  return {
    makeupValidityDays: optNum(d['makeupValidityDays']) ?? DEFAULT_RULES.makeupValidityDays,
    excusedGeneratesCredit: typeof d['excusedGeneratesCredit'] === 'boolean' ? d['excusedGeneratesCredit'] : DEFAULT_RULES.excusedGeneratesCredit,
    arenaCancelGeneratesCredit: typeof d['arenaCancelGeneratesCredit'] === 'boolean' ? d['arenaCancelGeneratesCredit'] : DEFAULT_RULES.arenaCancelGeneratesCredit,
    makeupNoticeHours: optNum(d['makeupNoticeHours']) ?? DEFAULT_RULES.makeupNoticeHours,
    defaultDueDay: optNum(d['defaultDueDay']) ?? DEFAULT_RULES.defaultDueDay,
    enrollmentFeeReais: optNum(d['enrollmentFeeReais']) ?? DEFAULT_RULES.enrollmentFeeReais,
    classReminderEnabled: typeof d['classReminderEnabled'] === 'boolean' ? d['classReminderEnabled'] : DEFAULT_RULES.classReminderEnabled,
    onlineBillingEnabled: d['onlineBillingEnabled'] === true,
  };
}

export function enrollmentFromDoc(doc: Snap): Enrollment {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  const p = (d['plan'] ?? {}) as Record<string, unknown>;
  const slots = Array.isArray(d['slots']) ? (d['slots'] as Array<Record<string, unknown>>) : [];
  return {
    id: doc.id,
    arenaId: str(d['arenaId']),
    studentId: str(d['studentId']),
    athleteId: optStr(d['athleteId']),
    name: str(d['name'], 'Aluno'),
    phone: optStr(d['phone']),
    photoUrl: optStr(d['photoUrl']),
    plan: {
      planId: str(p['planId']),
      name: str(p['name'], 'Plano'),
      kind: oneOf(p['kind'], KINDS, 'monthly'),
      priceReais: optNum(p['priceReais']) ?? 0,
      classesPerWeek: optNum(p['classesPerWeek']),
      makeupsPerMonth: optNum(p['makeupsPerMonth']),
      credits: optNum(p['credits']),
      validityDays: optNum(p['validityDays']),
      description: optStr(p['description']),
    },
    slots: slots.map((s) => ({
      classId: str(s['classId']),
      className: str(s['className'], 'Turma'),
      weekday: optNum(s['weekday']) ?? 1,
      startTime: str(s['startTime']),
      teacherId: str(s['teacherId']),
    })),
    status: oneOf(d['status'], ['active', 'paused', 'canceled', 'ended', 'pending_payment'] as const, 'active'),
    dueDay: optNum(d['dueDay']) ?? 5,
    paymentMethod: oneOf(d['paymentMethod'], PAYMENT_METHODS, 'pix'),
    billingMode: d['billingMode'] === 'asaas' ? 'asaas' : 'manual',
    cpfMasked: optStr(d['cpfMasked']),
    startDate: str(d['startDate']),
    creditsLeft: optNum(d['creditsLeft']),
    expiresOn: optStr(d['expiresOn']),
    createdAt: toDate(d['createdAt']),
    canceledAt: toDate(d['canceledAt']),
    cycle: oneOf(d['cycle'], PLAN_CYCLES, 'monthly'),
    commitmentEndsOn: optStr(d['commitmentEndsOn']),
    endsOn: optStr(d['endsOn']),
    cancelRequest: parseCancelRequest(d['cancelRequest']),
    cancellationPolicy: parseCancellationPolicy(d['cancellationPolicy']),
  };
}

export function chargeFromDoc(doc: Snap): Charge {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  return {
    id: doc.id,
    enrollmentId: str(d['enrollmentId']),
    studentId: str(d['studentId']),
    athleteId: optStr(d['athleteId']),
    name: str(d['name'], 'Aluno'),
    phone: optStr(d['phone']),
    description: str(d['description'], 'Mensalidade'),
    period: optStr(d['period']),
    amountReais: optNum(d['amountReais']) ?? 0,
    dueDate: str(d['dueDate']),
    status: oneOf(d['status'], ['open', 'paid', 'canceled'] as const, 'open'),
    paidOn: optStr(d['paidOn']),
    paymentMethod: oneOf(d['paymentMethod'], PAYMENT_METHODS, 'pix'),
    billingMode: d['billingMode'] === 'asaas' ? 'asaas' : 'manual',
    asaas: chargeAsaasFromDoc(d['asaas']),
    paidVia: d['paidVia'] === 'asaas' ? 'asaas' : d['paidVia'] === 'manual' ? 'manual' : null,
    onlineBillingType: d['onlineBillingType'] === 'CREDIT_CARD' ? 'CREDIT_CARD' : d['onlineBillingType'] === 'PIX' ? 'PIX' : null,
  };
}

const ASAAS_STATES: readonly AsaasState[] = ['pending', 'creating', 'open', 'paid', 'voiding', 'void', 'failed', 'needs_cpf'];

function chargeAsaasFromDoc(raw: unknown): ChargeAsaas | null {
  if (raw == null || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const groupId = str(a['groupId']);
  if (!groupId) return null;
  return {
    groupId,
    state: oneOf(a['state'], ASAAS_STATES, 'pending'),
    invoiceUrl: optStr(a['invoiceUrl']),
    status: optStr(a['status']),
  };
}

export function creditFromDoc(doc: Snap): MakeupCredit {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  return {
    id: doc.id,
    studentId: str(d['studentId']),
    athleteId: optStr(d['athleteId']),
    name: str(d['name'], 'Aluno'),
    enrollmentId: optStr(d['enrollmentId']),
    reason: d['reason'] === 'arena_canceled' ? 'arena_canceled' : 'excused',
    sourceDate: str(d['sourceDate']),
    status: oneOf(d['status'], ['available', 'used', 'expired'] as const, 'available'),
    expiresOn: str(d['expiresOn']),
  };
}

export function waitlistFromDoc(doc: Snap): WaitlistEntry {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  return {
    id: doc.id,
    classId: str(d['classId']),
    athleteId: optStr(d['athleteId']),
    name: str(d['name'], 'Aluno'),
    phone: optStr(d['phone']),
    note: optStr(d['note']),
    status: oneOf(d['status'], ['waiting', 'removed', 'enrolled'] as const, 'waiting'),
    createdAt: toDate(d['createdAt']),
  };
}

// ── Cobrança online ─────────────────────────────────────────────────────────

/** Grupo com pagamento vivo (ou a caminho) no Asaas — espelha `LIVE_ASAAS_STATES` do backend. */
const LIVE_ASAAS_STATES: readonly AsaasState[] = ['pending', 'creating', 'open', 'failed'];

/** Cancelar esta mensalidade também cancela a fatura online no Asaas (o link deixa de valer). */
export function chargeVoidsInvoice(charge: Pick<Charge, 'status' | 'billingMode' | 'asaas'>): boolean {
  return charge.status === 'open' && charge.billingMode === 'asaas' && charge.asaas != null && LIVE_ASAAS_STATES.includes(charge.asaas.state);
}

/** Link da fatura online pronto para mandar (só com a mensalidade em aberto). */
export function chargeInvoiceUrl(charge: Pick<Charge, 'status' | 'asaas'>): string | null {
  return charge.status === 'open' && charge.asaas?.state === 'open' ? charge.asaas.invoiceUrl : null;
}

/** Situação da fatura online para a tela (null = cobrança manual ou fatura resolvida). */
export function onlineChargeLabel(charge: Pick<Charge, 'status' | 'billingMode' | 'asaas' | 'paidVia' | 'onlineBillingType'>): string | null {
  if (charge.billingMode !== 'asaas') return null;
  if (charge.status === 'paid') {
    if (charge.paidVia !== 'asaas') return 'Baixa manual';
    return charge.onlineBillingType === 'CREDIT_CARD' ? 'Pago online · cartão' : 'Pago online · PIX';
  }
  if (charge.status !== 'open') return null;
  switch (charge.asaas?.state) {
    case 'open':
      return charge.asaas.status === 'OVERDUE' ? 'Fatura vencida' : 'Fatura enviada';
    case 'pending':
    case 'creating':
    case 'voiding':
      return 'Gerando link…';
    case 'failed':
      return 'Falha ao gerar link — tentando de novo';
    case 'needs_cpf':
      return 'Sem CPF — cobre manualmente';
    default:
      return 'Cobrança manual';
  }
}
