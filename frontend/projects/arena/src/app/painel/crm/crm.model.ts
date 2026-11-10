import type { PillTone } from '../ui/pill.component';

/** CRM da arena — espelho do payload de `getArenaCrmOverview` / `getArenaCrmCustomer`
 *  (`functions/src/arena-crm-model.ts`). Leitura e escrita só por callable. */

export type CrmPeriod = 'monthly' | 'quarterly' | 'semiannual' | 'annual';
export type CrmStatus = 'active' | 'expiring' | 'not_renewed' | 'overdue' | 'canceled';
export type CrmCustomerStatus = CrmStatus | 'walk_in';
export type CrmContactChannel = 'whatsapp' | 'call' | 'in_person' | 'note';
export type CrmContactReason = 'overdue' | 'due' | 'renewal' | 'absence' | 'offer' | 'other';
export type CrmContactOutcome = 'no_answer' | 'promised_payment' | 'interested' | 'converted' | 'declined' | 'done';
export type CrmPaymentMethod = 'pix' | 'cash' | 'card_machine' | 'transfer';
export type CrmQueueId = 'dueThisWeek' | 'notRenewed' | 'overdue' | 'absent';

export interface CrmContractView {
  id: string;
  source: 'contract' | 'schedule_plan';
  customerKey: string;
  planId: string | null;
  planName: string;
  period: CrmPeriod;
  dueDay: number;
  timesPerWeek: number;
  monthlyPriceReais: number;
  startDate: string;
  endDate: string | null;
  autoRenew: boolean;
  status: CrmStatus;
  paused: boolean;
  daysToEnd: number | null;
  nextDueDate: string | null;
  overdueCount: number;
  overdueReais: number;
  daysLate: number;
  paidInstallments: number;
  totalInstallments: number | null;
  canceledOn: string | null;
  renewedFromId: string | null;
  renewedToId: string | null;
  note: string | null;
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

export interface CrmConversion {
  score: number;
  avulso90d: number;
  activeWeeks: number;
  avgMonthlyReais: number;
  suggestion: { planId: string; planName: string; monthlyPriceReais: number; savingsReais: number } | null;
}

export interface CrmContact {
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

export interface CrmCustomer {
  key: string;
  athleteId: string | null;
  name: string;
  photoUrl: string | null;
  phone: string | null;
  whatsapp: string | null;
  kind: 'member' | 'former' | 'walk_in';
  status: CrmCustomerStatus;
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
  lastContact: CrmContact | null;
  /** Último lembrete automático (push) dos últimos 8 dias. */
  lastReminder?: { kind: ReminderKind; sentAt: string };
}

export interface CrmQueueItem {
  key: string;
  kind?: 'installment' | 'term_end';
  date?: string | null;
  amountReais: number;
  contactedRecently: boolean;
}

export interface CrmPlanOption {
  id: string;
  name: string;
  monthlyPriceReais: number;
  timesPerWeek: number;
  windows: Array<{ weekday: number; startTime: string; endTime: string }>;
}

export interface CrmKpis {
  mrrReais: number;
  members: number;
  mrrSeries: Array<{ month: string; mrrReais: number }>;
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
  funnel: { walkIns: number; frequent: number; offered: number; converted: number; convertedReais: number };
  byStatus: Record<CrmCustomerStatus, number>;
}

export interface CrmOverview {
  today: string;
  customers: CrmCustomer[];
  queues: Record<CrmQueueId | 'convert', CrmQueueItem[]>;
  kpis: CrmKpis;
  plans: CrmPlanOption[];
  settings: { monthlyGoal: number; reminders: ReminderSettings };
  reminders: ReminderOutcome;
  /** Quando as reservas foram lidas: o servidor guarda por até 30 min. */
  cache: { builtAt: string; fromCache: boolean };
}

export type ReminderKind = 'due_soon' | 'due_today' | 'overdue_1' | 'overdue_7' | 'renewal_15' | 'renewal_3' | 'absence';

export interface ReminderSettings {
  due: boolean;
  overdue: boolean;
  renewal: boolean;
  absence: boolean;
  teamDigest: boolean;
}

export interface ReminderOutcome {
  sent7d: number;
  byGroup: Record<'due' | 'overdue' | 'renewal' | 'absence', number>;
  paid: { done: number; total: number };
  renewed: { done: number; total: number };
  cameBack: { done: number; total: number };
}

export const REMINDER_OPTIONS: ReadonlyArray<{ id: keyof ReminderSettings; title: string; desc: string; when: string[] }> = [
  { id: 'due', title: 'Mensalidade vencendo', desc: 'Aviso antes e no dia do vencimento.', when: ['3 dias antes', 'no dia'] },
  { id: 'overdue', title: 'Mensalidade atrasada', desc: 'Cobrança gentil, sem citar multa.', when: ['+1 dia', '+7 dias'] },
  { id: 'renewal', title: 'Contrato terminando', desc: 'Convite para renovar e manter o horário.', when: ['15 dias antes', '3 dias antes'] },
  { id: 'absence', title: 'Sentimos sua falta', desc: 'Mensalista sem jogar há 14 dias. Uma vez por sumiço.', when: ['14 dias sem jogar'] },
  { id: 'teamDigest', title: 'Resumo do dia para o time', desc: 'Dono e gestores: quantos vencem, atrasaram e sumiram.', when: ['9h'] },
];

export const REMINDER_LABEL: Record<ReminderKind, string> = {
  due_soon: 'Vence em 3 dias',
  due_today: 'Vence hoje',
  overdue_1: 'Atraso +1',
  overdue_7: 'Atraso +7',
  renewal_15: 'Renovação · 15 dias',
  renewal_3: 'Renovação · 3 dias',
  absence: 'Sentimos sua falta',
};

export interface CrmPayment {
  id: string;
  contractId: string;
  amountReais: number;
  method: string;
  paidOn: string;
  installments: number;
  byName: string | null;
}

export interface CrmCustomerDetail {
  customerKey: string;
  contracts: Array<CrmContractView & { customerName: string; customerPhone: string | null; cancelReason: string | null }>;
  payments: CrmPayment[];
  contacts: CrmContact[];
  recentBookings: Array<{ date: string; startTime: string; endTime: string; courtName: string; amountReais: number; plan: boolean; attendance: string }>;
  reminders: Array<{ kind: ReminderKind; sentAt: string; title: string; body: string }>;
}

// ── Rótulos ─────────────────────────────────────────────────────────────────

export const PERIODS: readonly CrmPeriod[] = ['monthly', 'quarterly', 'semiannual', 'annual'];
export const PERIOD_LABEL: Record<CrmPeriod, string> = { monthly: 'Mensal', quarterly: 'Trimestral', semiannual: 'Semestral', annual: 'Anual' };
export const PERIOD_MONTHS: Record<CrmPeriod, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };
export const DUE_DAYS: readonly number[] = [5, 15, 25];

export const STATUS_LABEL: Record<CrmCustomerStatus, string> = {
  active: 'Ativo',
  expiring: 'Vencendo',
  not_renewed: 'Não renovou',
  overdue: 'Inadimplente',
  canceled: 'Cancelado',
  walk_in: 'Avulso',
};
export const STATUS_TONE: Record<CrmCustomerStatus, PillTone> = {
  active: 'green',
  expiring: 'yellow',
  not_renewed: 'orange',
  overdue: 'red',
  canceled: 'dim',
  walk_in: 'dim',
};

export const QUEUES: ReadonlyArray<{ id: CrmQueueId; label: string; color: string }> = [
  { id: 'dueThisWeek', label: 'Vencem esta semana', color: 'var(--nx-pending)' },
  { id: 'notRenewed', label: 'Não renovaram', color: 'var(--nx-orange-400)' },
  { id: 'overdue', label: 'Inadimplentes', color: 'var(--nx-live)' },
  { id: 'absent', label: 'Sem frequência', color: '#9AA0A6' },
];

export const QUEUE_REASON: Record<CrmQueueId | 'convert', CrmContactReason> = {
  dueThisWeek: 'due',
  notRenewed: 'renewal',
  overdue: 'overdue',
  absent: 'absence',
  convert: 'offer',
};

export const OUTCOMES: ReadonlyArray<{ id: CrmContactOutcome; label: string }> = [
  { id: 'no_answer', label: 'Sem resposta' },
  { id: 'promised_payment', label: 'Prometeu pagar' },
  { id: 'interested', label: 'Interessado' },
  { id: 'converted', label: 'Fechou' },
  { id: 'declined', label: 'Recusou' },
  { id: 'done', label: 'Mensagem enviada' },
];
export const OUTCOME_LABEL = Object.fromEntries(OUTCOMES.map((o) => [o.id, o.label])) as Record<CrmContactOutcome, string>;
export const CHANNEL_LABEL: Record<CrmContactChannel, string> = { whatsapp: 'WhatsApp', call: 'Ligação', in_person: 'Na arena', note: 'Anotação' };
export const PAYMENT_METHODS: ReadonlyArray<{ id: CrmPaymentMethod; label: string }> = [
  { id: 'pix', label: 'Pix' },
  { id: 'cash', label: 'Dinheiro' },
  { id: 'card_machine', label: 'Maquininha' },
  { id: 'transfer', label: 'Transferência' },
];

const WEEKDAY_SHORT: Record<number, string> = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb', 7: 'Dom' };
const WEEKDAY_PLURAL: Record<number, string> = { 1: 'segunda', 2: 'terça', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sábado', 7: 'domingo' };
const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// ── Formatação ──────────────────────────────────────────────────────────────

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const BRL_CENTS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** "R$ 1.320" (sem centavos quando é inteiro). */
export function money(v: number): string {
  return (Number.isInteger(v) ? BRL : BRL_CENTS).format(v).replace(/ /g, ' ');
}

/** "15/11" */
export function dayMonth(dateKey: string | null | undefined): string {
  if (!dateKey) return '—';
  return `${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}`;
}

/** "15/11/26" */
export function shortDate(dateKey: string | null | undefined): string {
  if (!dateKey) return '—';
  return `${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}/${dateKey.slice(2, 4)}`;
}

/** "nov" */
export function monthShort(monthKey: string): string {
  return MONTH_SHORT[Number(monthKey.slice(5, 7)) - 1] ?? monthKey;
}

/** "mar/26" */
export function monthYear(dateKey: string | null | undefined): string {
  if (!dateKey) return '—';
  return `${monthShort(dateKey.slice(0, 7))}/${dateKey.slice(2, 4)}`;
}

/** "19h" / "19h30" */
export function hourLabel(time: string): string {
  const [h, m] = time.split(':');
  return `${Number(h)}h${m && m !== '00' ? m : ''}`;
}

/** Dias da mesma hora juntos: "Seg e Qua 7h", "Ter 19h · Qui 20h". */
export function patternLabel(slots: readonly CrmPatternSlot[]): string {
  const byTime = new Map<string, number[]>();
  for (const s of slots) byTime.set(s.startTime, [...(byTime.get(s.startTime) ?? []), s.weekday]);
  return [...byTime.entries()]
    .map(([time, days]) => {
      const names = [...days].sort((a, b) => a - b).map((d) => WEEKDAY_SHORT[d] ?? '');
      const joined = names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : (names[0] ?? '');
      return `${joined} ${hourLabel(time)}`;
    })
    .join(' · ');
}

/** "toda terça às 19h" — para a mensagem. */
export function patternPhrase(slots: readonly CrmPatternSlot[]): string {
  const byTime = new Map<string, number[]>();
  for (const s of slots) byTime.set(s.startTime, [...(byTime.get(s.startTime) ?? []), s.weekday]);
  const parts = [...byTime.entries()].map(([time, days]) => {
    const names = [...days].sort((a, b) => a - b).map((d) => WEEKDAY_PLURAL[d] ?? '');
    const joined = names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : (names[0] ?? '');
    return `${joined} às ${hourLabel(time)}`;
  });
  return parts.length ? `toda ${parts.join(' e ')}` : 'com frequência';
}

/** Telefone com o final escondido para a lista: "(62) 9 8241-••••". */
export function maskedPhone(phone: string | null): string | null {
  const digits = (phone ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (digits.length < 10) return null;
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  return rest.length === 9 ? `(${ddd}) ${rest[0]} ${rest.slice(1, 5)}-••••` : `(${ddd}) ${rest.slice(0, 4)}-••••`;
}

/** Telefone completo: "(62) 9 8241-5530". */
export function formatPhone(phone: string | null): string | null {
  const digits = (phone ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (digits.length < 10) return phone;
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  return rest.length === 9 ? `(${ddd}) ${rest[0]} ${rest.slice(1, 5)}-${rest.slice(5)}` : `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "Plano Noite 2x · Mensal · vence dia 05" */
export function contractLine(c: CrmContractView): string {
  const parts = [c.planName, PERIOD_LABEL[c.period]];
  if (c.source === 'schedule_plan') parts[1] = `Plano de horário · ${PERIOD_LABEL[c.period]}`;
  parts.push(`dia ${String(c.dueDay).padStart(2, '0')}`);
  return parts.join(' · ');
}

/** O que dizer do fim do contrato na lista. */
export function contractEndLine(c: CrmContractView): string {
  if (c.status === 'canceled') return c.canceledOn ? `cancelado em ${dayMonth(c.canceledOn)}` : 'cancelado';
  if (c.status === 'not_renewed') return c.endDate ? `terminou ${dayMonth(c.endDate)}` : 'terminou';
  if (c.paused) return 'pausado';
  if (c.autoRenew) return 'renova sozinho';
  return c.endDate ? `até ${shortDate(c.endDate)}` : 'sem fim';
}

export function statusLabel(c: CrmCustomer): string {
  const v = c.contract;
  if (c.status === 'overdue' && v) return v.daysLate > 0 ? `${v.daysLate} ${v.daysLate === 1 ? 'dia' : 'dias'} de atraso` : 'Inadimplente';
  if (c.status === 'expiring' && v?.daysToEnd != null) return `Vencendo · ${v.daysToEnd} ${v.daysToEnd === 1 ? 'dia' : 'dias'}`;
  if (c.status === 'walk_in' && c.conversion) return 'Pronto pra plano';
  return STATUS_LABEL[c.status];
}

export function statusTone(c: CrmCustomer): PillTone {
  if (c.status === 'walk_in' && c.conversion) return 'blue';
  return STATUS_TONE[c.status];
}

export function daysAgo(days: number | null): string {
  if (days == null) return 'sem jogos';
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  return `há ${days} dias`;
}

/** "há 2 dias · Interessado" */
/** Contato humano mais recente; se o lembrete automático for mais novo, ele aparece. */
export function followUpLine(c: CrmCustomer, today: string): string {
  const r = c.lastReminder;
  if (r && (!c.lastContact || r.sentAt > c.lastContact.at)) {
    const days = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${r.sentAt.slice(0, 10)}T12:00:00Z`)) / 86_400_000);
    const when = days <= 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`;
    return `Lembrete automático (${REMINDER_LABEL[r.kind].toLowerCase()}) · ${when}`;
  }
  return contactLine(c.lastContact, today);
}

export function contactLine(contact: CrmContact | null, today: string): string {
  if (!contact) return 'Sem contato ainda';
  const days = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${contact.at.slice(0, 10)}T12:00:00Z`)) / 86_400_000);
  const when = days <= 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`;
  return `${OUTCOME_LABEL[contact.outcome]} · ${when}${contact.byName ? `, por ${firstName(contact.byName)}` : ''}`;
}

// ── Mensagens do WhatsApp ───────────────────────────────────────────────────

export type OfferTemplate = 'savings' | 'slot' | 'discount';
export const OFFER_TEMPLATES: ReadonlyArray<{ id: OfferTemplate; label: string }> = [
  { id: 'savings', label: 'Economia' },
  { id: 'slot', label: 'Horário garantido' },
  { id: 'discount', label: '1º mês com desconto' },
];

export function offerMessage(c: CrmCustomer, arenaName: string, template: OfferTemplate): string {
  const name = firstName(c.name);
  const conv = c.conversion;
  const plan = conv?.suggestion;
  const habit = patternPhrase(c.pattern);
  const hello = `Oi, ${name}! Aqui é da ${arenaName}. Vi que você joga com a gente ${habit}.`;
  if (!plan) return `${hello} Que tal deixar esse horário fixo como mensalista? A quadra fica garantida pra você toda semana. Posso te mandar as condições?`;
  if (template === 'discount') {
    return `${hello} Se fechar o plano ${plan.planName} esta semana, o 1º mês sai com desconto. Quer que eu te mande os detalhes?`;
  }
  if (template === 'savings' && plan.savingsReais > 0) {
    return `${hello} Que tal garantir esse horário fixo com o plano ${plan.planName}? Fica ${money(plan.monthlyPriceReais)}/mês, ${money(Math.round(plan.savingsReais))} a menos do que você gasta hoje, e a quadra é sua toda semana. Quer que eu reserve?`;
  }
  return `${hello} Que tal deixar esse horário fixo com o plano ${plan.planName} por ${money(plan.monthlyPriceReais)}/mês? A quadra fica garantida pra você toda semana, sem precisar correr pra reservar. Quer que eu reserve?`;
}

export function queueMessage(queue: CrmQueueId, c: CrmCustomer, item: CrmQueueItem, arenaName: string): string {
  const name = firstName(c.name);
  const v = c.contract;
  const plan = v?.planName ?? 'seu plano';
  switch (queue) {
  case 'overdue':
    return `Oi, ${name}! Tudo bem? Aqui é da ${arenaName}. Passando pra lembrar que a mensalidade do ${plan} está em aberto (${money(v?.overdueReais ?? item.amountReais)}). Se já pagou, me avisa que eu dou baixa. Pode ser por Pix ou aqui na recepção.`;
  case 'dueThisWeek':
    return item.kind === 'term_end'
      ? `Oi, ${name}! Aqui é da ${arenaName}. Seu contrato do ${plan} termina em ${dayMonth(item.date)}. Bora renovar e manter seu horário garantido? Posso deixar tudo pronto pra você.`
      : `Oi, ${name}! Aqui é da ${arenaName}. A mensalidade do ${plan} (${money(item.amountReais)}) vence em ${dayMonth(item.date)}. Pode pagar por Pix ou na recepção. Qualquer coisa, é só chamar!`;
  case 'notRenewed':
    return `Oi, ${name}! Sentimos sua falta aqui na ${arenaName}. Seu ${plan} terminou em ${dayMonth(item.date)} e dá pra voltar com as mesmas condições. Quer que eu renove pra você?`;
  case 'absent':
    return `Oi, ${name}! Faz ${c.daysSinceVisit ?? 'alguns'} dias que você não aparece na ${arenaName}. Está tudo bem? Seu horário do ${plan} continua garantido, te esperamos na quadra!`;
  }
}

export function whatsappUrl(digits: string, text: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** O que a fila mostra embaixo do nome. */
export function queueDetail(queue: CrmQueueId, c: CrmCustomer, item: CrmQueueItem): string {
  const v = c.contract;
  const base = v ? contractLine(v) : 'Sem contrato';
  switch (queue) {
  case 'dueThisWeek':
    return item.kind === 'term_end' ? `${v?.planName ?? ''} · contrato termina ${dayMonth(item.date)}` : `${base} · vence ${dayMonth(item.date)}`;
  case 'notRenewed':
    return `${v?.planName ?? ''} · terminou ${dayMonth(item.date)}`;
  case 'overdue':
    return base;
  case 'absent':
    return `${v?.planName ?? ''} · último jogo ${c.lastVisitDate ? dayMonth(c.lastVisitDate) : 'nunca'}`;
  }
}

/** Resumo do contrato no formulário: total, fim e a agenda das parcelas. */
export function contractSummary(startDate: string, period: CrmPeriod, dueDay: number, monthlyPrice: number) {
  const months = PERIOD_MONTHS[period];
  const [y, m, d] = startDate.split('-').map(Number);
  const endMonthIdx = (y ?? 2000) * 12 + ((m ?? 1) - 1) + months;
  const endY = Math.floor(endMonthIdx / 12);
  const endM = (endMonthIdx % 12) + 1;
  const lastDay = new Date(Date.UTC(endY, endM, 0)).getUTCDate();
  const sameDay = new Date(Date.UTC(endY, endM - 1, Math.min(d ?? 1, lastDay), 12));
  sameDay.setUTCDate(sameDay.getUTCDate() - 1);
  const endDate = sameDay.toISOString().slice(0, 10);
  const installments = Array.from({ length: months }, (_, k) => {
    const idx = (y ?? 2000) * 12 + ((m ?? 1) - 1) + k;
    return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
  });
  return { months, endDate, total: Math.round(months * monthlyPrice * 100) / 100, installments, firstDue: startDate, dueDay };
}

/** Busca sem acento e sem caixa. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV (separador `;`, como o Excel em pt-BR abre) da lista filtrada. */
export function customersCsv(customers: readonly CrmCustomer[]): string {
  const head = ['Cliente', 'Telefone', 'Status', 'Plano', 'Período', 'Vencimento', 'Mensal', 'Frequência/semana', 'Reservas 6 meses', 'Último jogo'];
  const lines = customers.map((c) => [
    c.name,
    formatPhone(c.phone) ?? '',
    STATUS_LABEL[c.status],
    c.contract?.planName ?? '',
    c.contract ? PERIOD_LABEL[c.contract.period] : '',
    c.contract ? `dia ${c.contract.dueDay}` : '',
    c.contract ? c.contract.monthlyPriceReais.toFixed(2).replace('.', ',') : '',
    c.visitsPerWeek.toString().replace('.', ','),
    c.bookings6m,
    c.lastVisitDate ? shortDate(c.lastVisitDate) : '',
  ].map(csvCell).join(';'));
  return [head.join(';'), ...lines].join('\n');
}

/** Semanas ativas (das últimas 8) para virar oportunidade — igual ao servidor. */
export const CONVERT_MIN_WEEKS = 4;

export type InstallmentState = 'paid' | 'late' | 'open' | 'future';

/** Parcelas do contrato em volta de hoje: as 2 últimas pagas, as atrasadas e as próximas (até 6). */
export function installmentStrip(c: CrmContractView, today: string): Array<{ month: string; due: string; state: InstallmentState }> {
  if (c.source !== 'contract') return [];
  const total = c.totalInstallments ?? Number.POSITIVE_INFINITY;
  const from = Math.max(0, Math.min(c.paidInstallments - 2, c.paidInstallments));
  const out: Array<{ month: string; due: string; state: InstallmentState }> = [];
  for (let k = from; k < total && out.length < 6; k++) {
    const idx = Number(c.startDate.slice(0, 4)) * 12 + Number(c.startDate.slice(5, 7)) - 1 + k;
    const month = `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
    const lastDay = new Date(Date.UTC(Math.floor(idx / 12), (idx % 12) + 1, 0)).getUTCDate();
    const due = k === 0 ? c.startDate : `${month}-${String(Math.min(c.dueDay, lastDay)).padStart(2, '0')}`;
    const state: InstallmentState = k < c.paidInstallments ? 'paid' : due < today ? 'late' : out.some((i) => i.state === 'open') ? 'future' : 'open';
    out.push({ month, due, state });
  }
  return out;
}

/** O que o CRM tem a dizer sobre o cliente (frequência caindo, pronto pra plano…). */
export function customerInsight(c: CrmCustomer, today: string): string | null {
  const v = c.contract;
  if (c.kind === 'member' && v) {
    // Mês corrente projetado para 30 dias, para não parecer queda só porque o mês começou.
    const day = Math.max(1, Number(today.slice(8, 10)));
    const current = (c.months.at(-1)?.total ?? 0) * (30 / day);
    const recent = ((c.months.at(-2)?.total ?? 0) + current) / 2;
    const before = c.months.slice(1, 4).reduce((s, m) => s + m.total, 0) / 3;
    if (before >= 2 && recent < before * 0.6) {
      const risk = v.status === 'overdue' ? ' e está com parcela atrasada. Risco alto de sair: vale ligar antes de cobrar.' : '. Vale um contato antes que vire cancelamento.';
      return `Caiu de ${before.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} para ${recent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} jogos por mês${risk}`;
    }
    if (c.absent) return `Não joga há ${c.daysSinceVisit ?? 'muitos'} dias. Mensalista sumido costuma cancelar no vencimento seguinte.`;
    if (c.visitsPerWeek > v.timesPerWeek) return `Joga ${c.visitsPerWeek.toLocaleString('pt-BR')}x por semana, mais do que o contrato (${v.timesPerWeek}x). Dá pra oferecer um plano maior.`;
    return null;
  }
  const conv = c.conversion;
  if (conv) {
    const s = conv.suggestion;
    const plan = s ? ` O ${s.planName} custa ${money(s.monthlyPriceReais)}/mês${s.savingsReais > 0 ? `: economiza ${money(Math.round(s.savingsReais))}` : ''}.` : '';
    return `Gastou ${money(Math.round(conv.avgMonthlyReais * 3))} em avulso nos últimos 3 meses (média ${money(Math.round(conv.avgMonthlyReais))}/mês).${plan}`;
  }
  return null;
}

/** Mensagem do WhatsApp da ficha, conforme a situação. */
export function profileMessage(c: CrmCustomer, arenaName: string): string {
  const v = c.contract;
  const amount = v?.status === 'overdue' ? v.overdueReais : v?.monthlyPriceReais ?? 0;
  const item: CrmQueueItem = { key: c.key, date: v?.status === 'not_renewed' ? v.endDate : v?.nextDueDate ?? v?.endDate, amountReais: amount, contactedRecently: false, kind: v?.status === 'expiring' ? 'term_end' : 'installment' };
  if (v?.status === 'overdue') return queueMessage('overdue', c, item, arenaName);
  if (v?.status === 'not_renewed') return queueMessage('notRenewed', c, item, arenaName);
  if (v?.status === 'expiring') return queueMessage('dueThisWeek', c, item, arenaName);
  if (c.absent) return queueMessage('absent', c, item, arenaName);
  if (c.conversion) return offerMessage(c, arenaName, 'savings');
  return `Oi, ${firstName(c.name)}! Aqui é da ${arenaName}. Tudo bem?`;
}

export function profileReason(c: CrmCustomer): CrmContactReason {
  const s = c.contract?.status;
  if (s === 'overdue') return 'overdue';
  if (s === 'not_renewed' || s === 'expiring') return 'renewal';
  if (c.absent) return 'absence';
  if (c.conversion) return 'offer';
  return 'other';
}

/** "reservas de 14:32" (hora local de quando o servidor leu as reservas). */
export function cacheLabel(builtAt: string | null | undefined): string {
  if (!builtAt) return '';
  const d = new Date(builtAt);
  if (Number.isNaN(d.getTime())) return '';
  return `reservas de ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}
