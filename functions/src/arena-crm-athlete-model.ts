/**
 * "Meu contrato" (app do atleta): o contrato de mensalista do CRM da arena visto
 * pelo próprio atleta. Funções puras; `arena-crm-athlete.ts` carrega os docs.
 *
 * O atleta vê o que deve e quando: plano, valor, vencimento, parcelas, pagamentos,
 * o link de pagamento aberto pela arena e o banco de horas da semana. Nunca vê a
 * anotação interna da arena (`note`), o motivo de cancelamento nem quem registrou.
 */

import {
  PATTERN_WEEKS,
  addDays,
  addMonthsToMonth,
  bookingHours,
  daysBetween,
  installmentDueDate,
  monthOf,
  round2,
  weekStartOf,
  type CrmContractRecord,
  type CrmContractView,
} from "./arena-crm-model";

/** Espelho por atleta: diz ao app, com uma leitura, se vale chamar a callable. */
export const CRM_MEMBERS = "arenaCrmMembers";

/** Parcelas mostradas por contrato (as 2 últimas pagas, as em aberto e as próximas). */
export const ATHLETE_INSTALLMENTS_SHOWN = 6;

/** Pagamentos mostrados por contrato. */
export const ATHLETE_PAYMENTS_SHOWN = 12;

export type AthleteInstallmentState = "paid" | "late" | "open" | "future" | "link";

export interface AthleteInstallment {
  /** 1 = primeira parcela do contrato. */
  number: number;
  month: string;
  dueDate: string;
  amountReais: number;
  state: AthleteInstallmentState;
}

/**
 * Contrato que o atleta enxerga: em vigor (ativo ou vencendo, ainda não substituído
 * pela renovação) ou com dívida. Cancelado e "não renovou" sem dívida somem.
 */
export function athleteSeesContract(record: CrmContractRecord, view: CrmContractView): boolean {
  if (record.status === "canceled") return false;
  if (view.status === "overdue") return true;
  if (record.renewedToId) return false;
  return view.status === "active" || view.status === "expiring";
}

/** Parcelas em volta de hoje, com o estado de cada uma. */
export function installmentSchedule(record: CrmContractRecord, view: CrmContractView, today: string): AthleteInstallment[] {
  const total = view.totalInstallments ?? Number.POSITIVE_INFINITY;
  const link = view.onlineLink ?? null;
  const out: AthleteInstallment[] = [];
  const from = Math.max(0, record.paidInstallments - 2);
  let openSeen = false;
  for (let k = from; k < total && out.length < ATHLETE_INSTALLMENTS_SHOWN; k++) {
    const dueDate = installmentDueDate(record.startDate, record.dueDay, k);
    const inLink = !!link && k >= link.fromInstallment && k < link.fromInstallment + link.installments;
    let state: AthleteInstallmentState;
    if (k < record.paidInstallments) state = "paid";
    else if (inLink) state = "link";
    else if (dueDate < today) state = "late";
    else if (!openSeen) state = "open";
    else state = "future";
    if (state === "open") openSeen = true;
    out.push({
      number: k + 1,
      month: addMonthsToMonth(monthOf(record.startDate), k),
      dueDate,
      amountReais: record.monthlyPriceReais,
      state,
    });
  }
  return out;
}

export interface AthleteBookingRecord {
  date?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  status?: unknown;
  attendanceStatus?: unknown;
  source?: unknown;
  bookedAs?: unknown;
}

const CANCELLED = new Set(["cancelled", "canceled"]);
const CUSTOMER_SOURCES = new Set(["platform", "manual", ""]);

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Primeiro dia da janela das barras (8 semanas de seg a dom; a última é a corrente). */
export function weekHoursFrom(today: string): string {
  return addDays(weekStartOf(today), -7 * (PATTERN_WEEKS - 1));
}

/**
 * Horas reservadas por semana. Diferente do CRM (que olha o que já aconteceu), aqui a
 * semana corrente conta também o que ele já reservou até domingo: é o que sobra do banco.
 */
export function athleteWeekHours(bookings: AthleteBookingRecord[], today: string): number[] {
  const from = weekHoursFrom(today);
  const until = addDays(weekStartOf(today), 6);
  const out = Array.from({length: PATTERN_WEEKS}, () => 0);
  for (const b of bookings) {
    const date = s(b.date);
    if (date < from || date > until) continue;
    if (CANCELLED.has(s(b.status).toLowerCase())) continue;
    if (s(b.attendanceStatus).toLowerCase() === "no_show") continue;
    if (!CUSTOMER_SOURCES.has(s(b.source)) || s(b.bookedAs) === "professor") continue;
    const week = Math.floor(daysBetween(from, date) / 7);
    if (week >= 0 && week < PATTERN_WEEKS) out[week] = round2(out[week]! + bookingHours(b.startTime, b.endTime));
  }
  return out;
}

export interface AthleteArenaInfo {
  name: string;
  logoUrl: string | null;
  whatsapp: string | null;
}

export interface AthletePayment {
  paidOn: string;
  amountReais: number;
  installments: number;
  method: string;
}

export interface AthleteContract {
  id: string;
  arenaId: string;
  arenaName: string;
  arenaLogoUrl: string | null;
  arenaWhatsapp: string | null;
  planName: string;
  period: CrmContractView["period"];
  dueDay: number;
  weeklyHours: number;
  monthlyPriceReais: number;
  startDate: string;
  endDate: string | null;
  autoRenew: boolean;
  status: CrmContractView["status"];
  nextDueDate: string | null;
  overdueCount: number;
  overdueReais: number;
  /** Vencimento da parcela atrasada mais antiga. */
  overdueSince: string | null;
  paidInstallments: number;
  totalInstallments: number | null;
  installments: AthleteInstallment[];
  /** Link de pagamento aberto pela arena (Pix ou cartão no Asaas). */
  payLink: {invoiceUrl: string; amountReais: number; installments: number} | null;
  payments: AthletePayment[];
  /** Horas reservadas por semana (seg a dom), 8 semanas; a última é a corrente. */
  weekHours: number[];
}

export function buildAthleteContract(
  record: CrmContractRecord,
  view: CrmContractView,
  arena: AthleteArenaInfo,
  payments: AthletePayment[],
  weekHours: number[],
  today: string,
): AthleteContract {
  const installments = installmentSchedule(record, view, today);
  const overdueSince = view.overdueCount > 0 ?
    installmentDueDate(record.startDate, record.dueDay, record.paidInstallments) :
    null;
  const link = view.onlineLink ?? null;
  return {
    id: record.id,
    arenaId: record.arenaId,
    arenaName: arena.name,
    arenaLogoUrl: arena.logoUrl,
    arenaWhatsapp: arena.whatsapp,
    planName: record.planName,
    period: view.period,
    dueDay: view.dueDay,
    weeklyHours: view.weeklyHours,
    monthlyPriceReais: view.monthlyPriceReais,
    startDate: view.startDate,
    endDate: view.endDate,
    autoRenew: view.autoRenew,
    status: view.status,
    nextDueDate: view.nextDueDate,
    overdueCount: view.overdueCount,
    overdueReais: view.overdueReais,
    overdueSince,
    paidInstallments: view.paidInstallments,
    totalInstallments: view.totalInstallments,
    installments,
    payLink: link ? {invoiceUrl: link.invoiceUrl, amountReais: link.amountReais, installments: link.installments} : null,
    payments: [...payments].sort((a, b) => b.paidOn.localeCompare(a.paidOn)).slice(0, ATHLETE_PAYMENTS_SHOWN),
    weekHours,
  };
}

/** Atrasado primeiro, depois quem vence antes. */
export function sortAthleteContracts(list: AthleteContract[]): AthleteContract[] {
  return [...list].sort((a, b) =>
    (b.overdueReais > 0 ? 1 : 0) - (a.overdueReais > 0 ? 1 : 0) ||
    (a.nextDueDate ?? "9999").localeCompare(b.nextDueDate ?? "9999") ||
    a.arenaName.localeCompare(b.arenaName, "pt-BR"));
}
