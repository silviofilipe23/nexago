import { daysLate } from '../aulas/billing.model';
import { addDaysKey, isoWeekdayOf, minutesOf, shortDate } from '../aulas/class.model';
import {
  CYCLE_LABEL,
  PAYMENT_FORM_LABEL,
  WEEKDAY_SHORT,
  type PlanWindow,
  type ScheduleAsaasState,
  type ScheduleCharge,
  type SchedulePaymentForm,
  type SchedulePlan,
  type ScheduleSubscription,
  type ScheduleWaitlistEntry,
  type SubscriptionSlot,
} from './schedule-plan.model';

/** Regras puras das telas de Planos de horário (sem Firestore nem Angular) — é aqui que mora o
 *  que tem teste: situação do assinante, atraso, horário nobre, ocupação por faixa, grade e CSV. */

// ── Horas e faixas ──────────────────────────────────────────────────────────

export type BandId = 'manha' | 'tarde' | 'noite';

export interface Band {
  id: BandId;
  label: string;
  hours: string;
  startTime: string;
  endTime: string;
}

/** Faixas da janela do plano (protótipo: Manhã 6–12h, Tarde 12–18h, Noite 18–23h). */
export const BANDS: readonly Band[] = [
  { id: 'manha', label: 'Manhã', hours: '6–12h', startTime: '06:00', endTime: '12:00' },
  { id: 'tarde', label: 'Tarde', hours: '12–18h', startTime: '12:00', endTime: '18:00' },
  { id: 'noite', label: 'Noite', hours: '18–23h', startTime: '18:00', endTime: '23:00' },
];

export function overlapMinutes(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  return Math.max(0, Math.min(minutesOf(aEnd), minutesOf(bEnd)) - Math.max(minutesOf(aStart), minutesOf(bStart)));
}

/** `18:00` → `18h`; `18:30` → `18h30`. */
export function hourLabel(time: string): string {
  const [h, m] = time.split(':');
  return `${Number(h ?? 0)}h${m && m !== '00' ? m : ''}`;
}

export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  return `${h}h${m ? String(m).padStart(2, '0') : ''}`;
}

/** `[1,2,3,4,5]` → `Seg–Sex`; `[6,7]` → `Sáb e Dom`; `[1,3,5]` → `Seg, Qua e Sex`. Sequência
 *  de 3+ dias seguidos vira intervalo. */
export function compactWeekdays(days: readonly number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    if (j - i >= 2) {
      parts.push(`${WEEKDAY_SHORT[sorted[i]!]}–${WEEKDAY_SHORT[sorted[j]!]}`);
    } else {
      for (let k = i; k <= j; k++) parts.push(WEEKDAY_SHORT[sorted[k]!] ?? '?');
    }
    i = j + 1;
  }
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

/** Janela do plano para o card: `Seg–Sex · 18h–23h`; janelas com horas diferentes viram grupos. */
export function windowsLabel(windows: readonly PlanWindow[]): string {
  if (windows.length === 0) return 'Sem janela definida';
  const groups = new Map<string, number[]>();
  for (const w of windows) {
    const key = `${w.startTime}|${w.endTime}`;
    groups.set(key, [...(groups.get(key) ?? []), w.weekday]);
  }
  const parts = [...groups.entries()].map(([key, days]) => {
    const [start, end] = key.split('|');
    return { days, text: `${compactWeekdays(days)} · ${hourLabel(start!)}–${hourLabel(end!)}` };
  });
  return parts
    .sort((a, b) => Math.min(...a.days) - Math.min(...b.days))
    .map((p) => p.text)
    .join(' + ');
}

// ── Grade de janelas do editor (dias × faixas) ─────────────────────────────

export function windowCellKey(weekday: number, band: BandId): string {
  return `${weekday}:${band}`;
}

/** Célula ligada = alguma janela daquele dia encosta na faixa. */
export function gridFromWindows(windows: readonly PlanWindow[]): Set<string> {
  const out = new Set<string>();
  for (const w of windows) {
    for (const b of BANDS) {
      if (overlapMinutes(w.startTime, w.endTime, b.startTime, b.endTime) > 0) out.add(windowCellKey(w.weekday, b.id));
    }
  }
  return out;
}

/** Células → janelas; faixas vizinhas do mesmo dia viram uma janela só (Manhã+Tarde = 6h–18h). */
export function windowsFromGrid(cells: ReadonlySet<string>): PlanWindow[] {
  const out: PlanWindow[] = [];
  for (let weekday = 1; weekday <= 7; weekday++) {
    let current: PlanWindow | null = null;
    for (const b of BANDS) {
      if (cells.has(windowCellKey(weekday, b.id))) {
        if (current && current.endTime === b.startTime) current.endTime = b.endTime;
        else {
          current = { weekday, startTime: b.startTime, endTime: b.endTime };
          out.push(current);
        }
      } else {
        current = null;
      }
    }
  }
  return out;
}

// ── Preço ───────────────────────────────────────────────────────────────────

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Mensal do ciclo com desconto (trimestral/anual pagam mês a mês). */
export function cycleMonthlyPrice(monthlyPriceReais: number, discountPercent: number): number {
  return round2(monthlyPriceReais * (1 - Math.max(0, Math.min(100, discountPercent)) / 100));
}

export interface PlanEconomy {
  /** Reservas avulsas equivalentes no mês (vezes por semana × 4). */
  bookingsPerMonth: number;
  avulsoMonthlyReais: number;
  savingsReais: number;
  /** % de desconto do mensal sobre o avulso (pode ser negativo: plano mais caro). */
  discountPercent: number;
}

export function planEconomy(
  plan: Pick<SchedulePlan, 'monthlyPriceReais' | 'referenceHourlyReais' | 'timesPerWeek' | 'durationMinutes'>,
): PlanEconomy | null {
  const ref = plan.referenceHourlyReais;
  if (ref == null || ref <= 0 || plan.monthlyPriceReais <= 0) return null;
  const bookingsPerMonth = plan.timesPerWeek * 4;
  const avulso = round2(ref * (plan.durationMinutes / 60) * bookingsPerMonth);
  return {
    bookingsPerMonth,
    avulsoMonthlyReais: avulso,
    savingsReais: round2(avulso - plan.monthlyPriceReais),
    discountPercent: Math.round((1 - plan.monthlyPriceReais / avulso) * 100),
  };
}

// ── Horário nobre ───────────────────────────────────────────────────────────

/** Assinatura que segura horário (o servidor também conta pausada/suspensa como dona da vaga). */
export function holdsSlot(sub: Pick<ScheduleSubscription, 'status'>): boolean {
  return sub.status !== 'canceled';
}

export interface PrimeCommitment {
  committedHours: number;
  totalHours: number;
  percent: number;
}

/** Horas-quadra de séries de plano no nobre ÷ horas-quadra do nobre (quadras ativas × horas da
 *  janela) — a mesma conta do servidor ao assinar, aqui só para mostrar. */
export function primeCommitment(
  primeWindows: readonly PlanWindow[],
  activeCourtCount: number,
  subs: readonly Pick<ScheduleSubscription, 'status' | 'slots'>[],
): PrimeCommitment {
  const windowHours = primeWindows.reduce((s, w) => s + overlapMinutes(w.startTime, w.endTime, w.startTime, w.endTime), 0) / 60;
  const totalHours = windowHours * Math.max(0, activeCourtCount);
  let committed = 0;
  for (const sub of subs) {
    if (!holdsSlot(sub)) continue;
    for (const slot of sub.slots) {
      for (const w of primeWindows) {
        if (w.weekday === slot.weekday) committed += overlapMinutes(slot.startTime, slot.endTime, w.startTime, w.endTime);
      }
    }
  }
  const committedHours = committed / 60;
  return {
    committedHours,
    totalHours,
    percent: totalHours > 0 ? Math.round((committedHours / totalHours) * 100) : 0,
  };
}

/** Horas-quadra que ainda cabem no nobre antes do limite (nunca negativo). */
export function primeHoursLeft(c: PrimeCommitment, capPercent: number): number {
  return Math.max(0, Math.floor((c.totalHours * capPercent) / 100 - c.committedHours));
}

/** Algum dos dias, no horário de início e duração dados, cai no nobre? */
export function isInPrime(weekdays: readonly number[], startTime: string, durationMinutes: number, primeWindows: readonly PlanWindow[]): boolean {
  const end = minutesOf(startTime) + durationMinutes;
  const endTime = `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
  return weekdays.some((d) => primeWindows.some((w) => w.weekday === d && overlapMinutes(startTime, endTime, w.startTime, w.endTime) > 0));
}

// ── Ocupação por faixa (onde sobra espaço) ──────────────────────────────────

export type DayGroup = 'weekdays' | 'weekend';

export const DAY_GROUP_DAYS: Record<DayGroup, readonly number[]> = { weekdays: [1, 2, 3, 4, 5], weekend: [6, 7] };
export const DAY_GROUP_LABEL: Record<DayGroup, string> = { weekdays: 'Seg–Sex', weekend: 'Sáb–Dom' };

export interface BandOccupancy {
  group: DayGroup;
  band: Band;
  percent: number;
  /** `Seg–Sex · 6h–12h` */
  label: string;
}

/** Ocupação por planos fixos em cada faixa (Seg–Sex e Sáb–Dom × Manhã/Tarde/Noite), da mais vazia
 *  à mais cheia. Base = quadras ativas × horas da faixa × dias do grupo. */
export function bandOccupancy(subs: readonly Pick<ScheduleSubscription, 'status' | 'slots'>[], activeCourtCount: number): BandOccupancy[] {
  const out: BandOccupancy[] = [];
  for (const group of ['weekdays', 'weekend'] as const) {
    const days = DAY_GROUP_DAYS[group];
    for (const band of BANDS) {
      const capacity = (overlapMinutes(band.startTime, band.endTime, band.startTime, band.endTime) * days.length * Math.max(0, activeCourtCount)) / 60;
      let used = 0;
      for (const sub of subs) {
        if (!holdsSlot(sub)) continue;
        for (const slot of sub.slots) {
          if (days.includes(slot.weekday)) used += overlapMinutes(slot.startTime, slot.endTime, band.startTime, band.endTime) / 60;
        }
      }
      out.push({
        group,
        band,
        percent: capacity > 0 ? Math.round((used / capacity) * 100) : 0,
        label: `${DAY_GROUP_LABEL[group]} · ${band.hours}`,
      });
    }
  }
  return out.sort((a, b) => a.percent - b.percent || (a.group === b.group ? 0 : a.group === 'weekdays' ? -1 : 1));
}

/** Plural da faixa para o título da sugestão: `Manhãs de Seg–Sex`. */
export function bandPluralTitle(o: Pick<BandOccupancy, 'band' | 'group'>): string {
  const plural: Record<BandId, string> = { manha: 'Manhãs', tarde: 'Tardes', noite: 'Noites' };
  return `${plural[o.band.id]} de ${DAY_GROUP_LABEL[o.group]}`;
}

// ── Situação do assinante ───────────────────────────────────────────────────

export type SubscriberStateKind = 'ok' | 'late' | 'suspended' | 'paused' | 'leaving';
export type SubscriberFilter = 'all' | 'ok' | 'late' | 'paused' | 'leaving';

export interface SubscriberState {
  kind: SubscriberStateKind;
  label: string;
  tone: 'green' | 'yellow' | 'red' | 'dim';
  overdueDays: number;
}

/** Maior atraso (dias) entre as mensalidades abertas já vencidas; 0 = nada vencido. */
export function overdueDays(charges: readonly Pick<ScheduleCharge, 'status' | 'dueDate'>[], todayKey: string): number {
  let max = 0;
  for (const c of charges) {
    if (c.status === 'open' && c.dueDate && c.dueDate < todayKey) max = Math.max(max, daysLate(c.dueDate, todayKey));
  }
  return max;
}

/** Pausado > suspenso > atrasado > saindo > em dia. `charges` são as mensalidades da assinatura. */
export function subscriberState(
  sub: Pick<ScheduleSubscription, 'status' | 'endsOn' | 'pausedUntil'>,
  charges: readonly Pick<ScheduleCharge, 'status' | 'dueDate'>[],
  todayKey: string,
): SubscriberState {
  const late = overdueDays(charges, todayKey);
  if (sub.status === 'paused') {
    return { kind: 'paused', label: sub.pausedUntil ? `Pausado até ${shortDate(sub.pausedUntil)}` : 'Pausado', tone: 'dim', overdueDays: late };
  }
  if (sub.status === 'suspended') return { kind: 'suspended', label: 'Suspenso por atraso', tone: 'red', overdueDays: late };
  if (late > 0) return { kind: 'late', label: `Atrasado ${late} dia${late === 1 ? '' : 's'}`, tone: 'yellow', overdueDays: late };
  if (sub.endsOn) return { kind: 'leaving', label: `Sai em ${shortDate(sub.endsOn)}`, tone: 'red', overdueDays: 0 };
  return { kind: 'ok', label: 'Em dia', tone: 'green', overdueDays: 0 };
}

export function matchesFilter(kind: SubscriberStateKind, filter: SubscriberFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'late':
      return kind === 'late' || kind === 'suspended';
    default:
      return kind === filter;
  }
}

// ── Cobrança online (Asaas) ─────────────────────────────────────────────────

export interface OnlineChargeBadge {
  label: string;
  tone: 'green' | 'yellow' | 'red' | 'dim' | 'blue';
}

/** Texto da taxa da cobrança online (o mesmo do aluguel online). */
export const ONLINE_BILLING_FEE_TEXT =
  'A NexaGO desconta a mesma taxa do aluguel online (6% no Pro, 5% no Elite, mínimo R$ 1,50) mais a taxa do cartão quando for cartão. O valor cai no caixa da arena.';

type OnlineChargeFields = Pick<ScheduleCharge, 'status' | 'billingMode' | 'asaas' | 'paidVia' | 'onlineBillingType'>;

/** Grupo com pagamento vivo (ou a caminho) no Asaas — o mesmo conjunto que o backend anula na baixa manual. */
const LIVE_ASAAS_STATES: readonly ScheduleAsaasState[] = ['pending', 'creating', 'open', 'failed'];

/** `PIX` → Pix; cartões → Cartão; resto (boleto…) → nome cru capitalizado. */
export function onlineBillingTypeLabel(type: string | null): string {
  if (!type || type === 'PIX') return 'Pix';
  if (type === 'CREDIT_CARD' || type === 'DEBIT_CARD') return 'Cartão';
  return type.charAt(0) + type.slice(1).toLowerCase();
}

/** Selo do estado online da mensalidade. `null` = manual (ou link já anulado), nada a mostrar. */
export function onlineChargeBadge(charge: OnlineChargeFields): OnlineChargeBadge | null {
  if (charge.status === 'paid') {
    return charge.paidVia === 'asaas' ? { label: `Pago online · ${onlineBillingTypeLabel(charge.onlineBillingType)}`, tone: 'green' } : null;
  }
  if (charge.status !== 'open' || charge.billingMode !== 'asaas') return null;
  switch (charge.asaas?.state ?? 'pending') {
    case 'pending':
    case 'creating':
      return { label: 'Gerando link', tone: 'dim' };
    case 'open':
      return { label: 'Link enviado', tone: 'blue' };
    case 'failed':
      return { label: 'Falhou — tentando de novo', tone: 'red' };
    case 'needs_cpf':
      return { label: 'Sem CPF — cobrar manual', tone: 'yellow' };
    default:
      return null;
  }
}

/** Link da fatura pronto para copiar (só com a mensalidade em aberto). */
export function onlineChargeInvoiceUrl(charge: Pick<ScheduleCharge, 'status' | 'asaas'>): string | null {
  return charge.status === 'open' && charge.asaas?.state === 'open' ? charge.asaas.invoiceUrl : null;
}

/** Baixa manual ou cancelamento desta mensalidade anula o link online (o webhook estorna se o atleta pagar depois). */
export function chargeVoidsOnlineLink(charge: Pick<ScheduleCharge, 'status' | 'billingMode' | 'asaas'>): boolean {
  return charge.status === 'open' && charge.billingMode === 'asaas' && LIVE_ASAAS_STATES.includes(charge.asaas?.state ?? 'pending');
}

/** Como a forma do plano é cobrada hoje: Pix/cartão viram link mensal com a regra ligada; o resto é baixa manual. */
export function paymentFormBilling(form: SchedulePaymentForm, onlineBillingEnabled: boolean): string {
  return onlineBillingEnabled && form !== 'onsite' ? 'Pix ou cartão por link (online)' : 'baixa manual';
}

/** Vencimento mais próximo entre as mensalidades abertas (`null` = nada em aberto). */
export function nextDueDate(charges: readonly Pick<ScheduleCharge, 'status' | 'dueDate'>[]): string | null {
  const open = charges.filter((c) => c.status === 'open' && c.dueDate).map((c) => c.dueDate).sort();
  return open[0] ?? null;
}

/** `Ter e Qui · 19:00` (horários diferentes por dia vêm junto do dia). */
export function slotsLabel(slots: readonly Pick<SubscriptionSlot, 'weekday' | 'startTime'>[]): string {
  if (slots.length === 0) return '—';
  const sorted = [...slots].sort((a, b) => a.weekday - b.weekday);
  const times = [...new Set(sorted.map((s) => s.startTime))];
  if (times.length === 1) return `${compactWeekdays(sorted.map((s) => s.weekday))} · ${times[0]}`;
  return sorted.map((s) => `${WEEKDAY_SHORT[s.weekday]} ${s.startTime}`).join(' · ');
}

export function slotCourtsLabel(slots: readonly Pick<SubscriptionSlot, 'courtName'>[]): string {
  return [...new Set(slots.map((s) => s.courtName))].join(', ');
}

export function playersLabel(count: number): string {
  return count > 1 ? `${count} jogadores` : 'Individual';
}

// ── CSV ─────────────────────────────────────────────────────────────────────

export interface SubscriberCsvRow {
  sub: Pick<
    ScheduleSubscription,
    'holderName' | 'holderPhone' | 'members' | 'planName' | 'slots' | 'cycle' | 'monthlyPriceReais' | 'paymentMethod' | 'makeupBalance'
  >;
  state: Pick<SubscriberState, 'label'>;
  nextDue: string | null;
}

export function csvField(value: string | number): string {
  const text = String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV no padrão do Excel brasileiro (`;` e vírgula decimal). */
export function subscribersCsv(rows: readonly SubscriberCsvRow[]): string {
  const header = ['Titular', 'Telefone', 'Jogadores', 'Plano', 'Horário', 'Quadra', 'Ciclo', 'Mensal (R$)', 'Forma', 'Próxima cobrança', 'Reposições', 'Status'];
  const lines = rows.map(({ sub, state, nextDue }) =>
    [
      sub.holderName,
      sub.holderPhone ?? '',
      Math.max(1, sub.members.length),
      sub.planName,
      slotsLabel(sub.slots),
      slotCourtsLabel(sub.slots),
      CYCLE_LABEL[sub.cycle],
      sub.monthlyPriceReais.toFixed(2).replace('.', ','),
      PAYMENT_FORM_LABEL[sub.paymentMethod],
      nextDue ? nextDue.split('-').reverse().join('/') : '',
      sub.makeupBalance,
      state.label,
    ]
      .map(csvField)
      .join(';'),
  );
  return [header.map(csvField).join(';'), ...lines].join('\r\n');
}

// ── Próxima cobrança ────────────────────────────────────────────────────────

export interface NextChargeSummary {
  dueDate: string;
  totalReais: number;
  count: number;
  byForm: Record<SchedulePaymentForm, number>;
  splitGroups: number;
}

/** Próximo vencimento em aberto (hoje em diante) somando as mensalidades daquele dia. */
export function nextChargeSummary(
  openCharges: readonly Pick<ScheduleCharge, 'status' | 'dueDate' | 'amountReais' | 'subscriptionId'>[],
  subsById: ReadonlyMap<string, Pick<ScheduleSubscription, 'paymentMethod' | 'members'>>,
  todayKey: string,
): NextChargeSummary | null {
  const upcoming = openCharges.filter((c) => c.status === 'open' && c.dueDate >= todayKey);
  const dueDate = upcoming.map((c) => c.dueDate).sort()[0];
  if (!dueDate) return null;
  const sameDay = upcoming.filter((c) => c.dueDate === dueDate);
  const byForm: Record<SchedulePaymentForm, number> = { pix_auto: 0, card: 0, onsite: 0 };
  const subIds = new Set(sameDay.map((c) => c.subscriptionId));
  let splitGroups = 0;
  for (const id of subIds) {
    const sub = subsById.get(id);
    if (!sub) continue;
    if (sub.members.length > 1) splitGroups++;
  }
  for (const c of sameDay) {
    const sub = subsById.get(c.subscriptionId);
    if (sub) byForm[sub.paymentMethod]++;
  }
  return { dueDate, totalReais: round2(sameDay.reduce((s, c) => s + c.amountReais, 0)), count: sameDay.length, byForm, splitGroups };
}

// ── Feriados nacionais (lista fixa, como no backend) ────────────────────────

export const BR_NATIONAL_HOLIDAYS: ReadonlyArray<{ date: string; name: string }> = [
  { date: '2026-01-01', name: 'Confraternização Universal' },
  { date: '2026-04-03', name: 'Sexta-feira Santa' },
  { date: '2026-04-21', name: 'Tiradentes' },
  { date: '2026-05-01', name: 'Dia do Trabalho' },
  { date: '2026-09-07', name: 'Independência' },
  { date: '2026-10-12', name: 'Nossa Senhora Aparecida' },
  { date: '2026-11-02', name: 'Finados' },
  { date: '2026-11-15', name: 'Proclamação da República' },
  { date: '2026-11-20', name: 'Consciência Negra' },
  { date: '2026-12-25', name: 'Natal' },
  { date: '2027-01-01', name: 'Confraternização Universal' },
  { date: '2027-03-26', name: 'Sexta-feira Santa' },
  { date: '2027-04-21', name: 'Tiradentes' },
  { date: '2027-05-01', name: 'Dia do Trabalho' },
  { date: '2027-09-07', name: 'Independência' },
  { date: '2027-10-12', name: 'Nossa Senhora Aparecida' },
  { date: '2027-11-02', name: 'Finados' },
  { date: '2027-11-15', name: 'Proclamação da República' },
  { date: '2027-11-20', name: 'Consciência Negra' },
  { date: '2027-12-25', name: 'Natal' },
];

/** Feriados de hoje até `days` dias à frente que a arena ainda não revisou. */
export function upcomingHolidays(todayKey: string, days: number, applied: readonly string[]): Array<{ date: string; name: string }> {
  const until = addDaysKey(todayKey, days);
  return BR_NATIONAL_HOLIDAYS.filter((h) => h.date >= todayKey && h.date <= until && !applied.includes(h.date));
}

/** Horários de plano que caem no dia do feriado (`makeup` = os que viram reposição pela regra). */
export function holidayImpact(
  date: string,
  subs: readonly Pick<ScheduleSubscription, 'status' | 'slots' | 'planId'>[],
  holidayRuleOf: (planId: string) => 'makeup' | 'play',
): { total: number; makeup: number } {
  const weekday = isoWeekdayOf(date);
  let total = 0;
  let makeup = 0;
  for (const sub of subs) {
    if (sub.status !== 'active') continue;
    const hits = sub.slots.filter((s) => s.weekday === weekday).length;
    total += hits;
    if (holidayRuleOf(sub.planId) === 'makeup') makeup += hits;
  }
  return { total, makeup };
}

// ── Lista de espera ─────────────────────────────────────────────────────────

export interface WaitlistGroup {
  key: string;
  weekdays: number[];
  startTime: string;
  /** Na ordem da fila (mais antiga primeiro). */
  entries: ScheduleWaitlistEntry[];
}

export function waitlistKey(weekdays: readonly number[], startTime: string): string {
  return `${[...weekdays].sort((a, b) => a - b).join(',')}|${startTime}`;
}

/** Agrupa a fila ativa (`waiting`/`offered`) por dias + horário; grupos mais longos primeiro. */
export function groupWaitlist(entries: readonly ScheduleWaitlistEntry[]): WaitlistGroup[] {
  const map = new Map<string, WaitlistGroup>();
  for (const e of entries) {
    if (e.status !== 'waiting' && e.status !== 'offered') continue;
    const key = waitlistKey(e.weekdays, e.startTime);
    const group = map.get(key) ?? { key, weekdays: [...e.weekdays].sort((a, b) => a - b), startTime: e.startTime, entries: [] };
    group.entries.push(e);
    map.set(key, group);
  }
  const groups = [...map.values()];
  for (const g of groups) g.entries.sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
  return groups.sort((a, b) => b.entries.length - a.entries.length || a.key.localeCompare(b.key));
}

export function waitlistGroupLabel(g: Pick<WaitlistGroup, 'weekdays' | 'startTime'>): string {
  return `${compactWeekdays(g.weekdays)} · ${g.startTime}`;
}

/** Fila que espera numa hora cheia da grade (início dentro da hora). */
export function waitlistCountAt(entries: readonly Pick<ScheduleWaitlistEntry, 'status' | 'weekdays' | 'startTime'>[], weekday: number, hour: number): number {
  return entries.filter(
    (e) => (e.status === 'waiting' || e.status === 'offered') && e.weekdays.includes(weekday) && Math.floor(minutesOf(e.startTime) / 60) === hour,
  ).length;
}

/** Assinaturas que saem (têm `endsOn`) num dos dias/horário do grupo. */
export function leavingSubsFor(
  g: Pick<WaitlistGroup, 'weekdays' | 'startTime'>,
  subs: readonly ScheduleSubscription[],
): Array<{ sub: ScheduleSubscription; slot: SubscriptionSlot }> {
  const out: Array<{ sub: ScheduleSubscription; slot: SubscriptionSlot }> = [];
  for (const sub of subs) {
    if (!sub.endsOn || sub.status === 'canceled') continue;
    const slot = sub.slots.find((s) => g.weekdays.includes(s.weekday) && s.startTime === g.startTime);
    if (slot) out.push({ sub, slot });
  }
  return out.sort((a, b) => (a.sub.endsOn ?? '').localeCompare(b.sub.endsOn ?? ''));
}

// ── Grade da semana ─────────────────────────────────────────────────────────

export const GRID_HOURS: readonly number[] = Array.from({ length: 17 }, (_, i) => i + 6);

export type GridBlockKind = 'fixed' | 'class';

export interface GridBlock {
  kind: GridBlockKind;
  weekday: number;
  startTime: string;
  endTime: string;
  courtIds: string[];
  title: string;
  detail: string;
}

export interface GridCourt {
  id: string;
  name: string;
}

export interface GridCellCourt {
  court: GridCourt;
  block: GridBlock | null;
}

/** Quem ocupa cada quadra na hora cheia `hour` (`[hour:00, hour+1:00)`) do dia; sem ninguém = livre.
 *  Havendo dois blocos na mesma quadra/hora, o horário fixo ganha (é o que o gestor vende aqui). */
export function cellOccupants(blocks: readonly GridBlock[], courts: readonly GridCourt[], weekday: number, hour: number): GridCellCourt[] {
  const from = `${String(hour).padStart(2, '0')}:00`;
  const to = `${String(hour + 1).padStart(2, '0')}:00`;
  return courts.map((court) => {
    const hits = blocks.filter(
      (b) => b.weekday === weekday && b.courtIds.includes(court.id) && overlapMinutes(b.startTime, b.endTime, from, to) > 0,
    );
    const block = hits.find((b) => b.kind === 'fixed') ?? hits[0] ?? null;
    return { court, block };
  });
}
