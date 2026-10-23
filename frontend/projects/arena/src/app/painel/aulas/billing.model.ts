import { Timestamp, type DocumentSnapshot, type QueryDocumentSnapshot } from 'firebase/firestore';
import { WEEKDAY_SHORT, addDaysKey } from './class.model';

/** Espelha `functions/src/arena-class-billing.ts` / `arena-class-makeup.ts` — fase 2 de Aulas.
 *  Cobrança manual: mensalidade gerada pelo sistema, pagamento registrado pelo gestor. */

export type PlanKind = 'monthly' | 'package' | 'single';
export type PaymentMethod = 'pix' | 'cash' | 'card_machine' | 'transfer';
export type EnrollmentStatus = 'active' | 'paused' | 'canceled' | 'ended';
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
  plan: Omit<ClassPlan, 'id' | 'status'> & { planId: string };
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

export type StudentPayState = 'ok' | 'today' | 'late' | 'paused';

export const PAY_STATE_LABEL: Record<StudentPayState, string> = {
  ok: 'Em dia',
  today: 'Vence hoje',
  late: 'Atrasado',
  paused: 'Pausado',
};

export const PAY_STATE_TONE: Record<StudentPayState, 'green' | 'yellow' | 'red' | 'dim'> = {
  ok: 'green',
  today: 'yellow',
  late: 'red',
  paused: 'dim',
};

/** Situação do aluno pelas cobranças abertas da matrícula. */
export function studentPayState(enrollment: Pick<Enrollment, 'status'>, openCharges: readonly Pick<Charge, 'status' | 'dueDate'>[], todayKey: string): StudentPayState {
  if (enrollment.status === 'paused') return 'paused';
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
    status: oneOf(d['status'], ['active', 'paused', 'canceled', 'ended'] as const, 'active'),
    dueDay: optNum(d['dueDay']) ?? 5,
    paymentMethod: oneOf(d['paymentMethod'], PAYMENT_METHODS, 'pix'),
    billingMode: d['billingMode'] === 'asaas' ? 'asaas' : 'manual',
    cpfMasked: optStr(d['cpfMasked']),
    startDate: str(d['startDate']),
    creditsLeft: optNum(d['creditsLeft']),
    expiresOn: optStr(d['expiresOn']),
    createdAt: toDate(d['createdAt']),
    canceledAt: toDate(d['canceledAt']),
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
