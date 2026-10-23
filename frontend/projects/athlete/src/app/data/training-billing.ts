import { InjectionToken } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { fetchMyClassCharges, safeExternalUrl, type MyClassChargeItem } from './class-agenda-repository';
import { athleteFunctions } from './functions';

/**
 * Mensalidades de treino (área do aluno web · W1/W2): faturas do CENTRO DE TREINAMENTO
 * (`getMyTrainingCenters`), mensalidades da ARENA em aberto (`getMyClassCharges`) e os
 * pagamentos já feitos à arena e ao PROFESSOR (`getMyTrainingPlans`). Cada origem cobra separado.
 */

export type TrainingOrigin = 'private' | 'arena' | 'center';

export const ORIGIN_LABEL: Record<TrainingOrigin, string> = {
  private: 'Particular',
  arena: 'Arena',
  center: 'Centro',
};

export interface CenterInvoice {
  invoiceId: string;
  reference: string;
  amountCents: number;
  dueDate: string;
  status: string;
  payUrl: string | null;
  paidOn: string | null;
  method: string;
}

export interface CenterEnrollmentSummary {
  className: string;
  planName: string;
  priceCents: number;
  billingDay: number | null;
  billingMethod: string;
  nextChargeDate: string | null;
}

export interface TrainingCenterBilling {
  centerId: string;
  name: string;
  billingHold: boolean;
  enrollments: CenterEnrollmentSummary[];
  invoices: CenterInvoice[];
}

export interface TrainingPayment {
  source: 'arena' | 'professor';
  chargeId: string;
  payee: string;
  description: string;
  amountReais: number;
  paidOn: string;
  method: string;
}

/** Uma linha da tabela de Mensalidades. */
export interface BillingRow {
  key: string;
  origin: TrainingOrigin;
  title: string;
  payee: string;
  /** `YYYY-MM-DD`: vencimento (em aberto) ou pagamento (paga). */
  date: string;
  amountCents: number;
  status: 'open' | 'late' | 'paid' | 'failed';
  method: string;
  /** Pagar: a fatura do centro na web, um link externo, ou nada (direto com a arena). */
  action: { kind: 'center'; centerId: string; invoiceId: string } | { kind: 'url'; url: string } | null;
  info: string | null;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function recs(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];
}

export function centersFromRaw(raw: unknown): TrainingCenterBilling[] {
  const centers = recs((raw as { centers?: unknown } | null)?.centers);
  return centers.map((c) => ({
    centerId: str(c['centerId']),
    name: str(c['name'], 'Centro de treinamento'),
    billingHold: c['billingHold'] === true,
    enrollments: recs(c['enrollments']).map((e) => {
      const b = (e['billing'] && typeof e['billing'] === 'object' ? e['billing'] : {}) as Record<string, unknown>;
      return {
        className: str(e['className'], 'Turma'),
        planName: str(e['planName'], 'Plano'),
        priceCents: num(e['priceCents']) ?? 0,
        billingDay: num(b['billingDay']),
        billingMethod: str(b['method']),
        nextChargeDate: str(b['nextChargeDate']) || null,
      };
    }),
    invoices: recs(c['invoices']).map((i) => ({
      invoiceId: str(i['invoiceId']),
      reference: str(i['reference'], 'Mensalidade'),
      amountCents: num(i['amountCents']) ?? 0,
      dueDate: str(i['dueDate']),
      status: str(i['status'], 'pending'),
      payUrl: safeExternalUrl(i['payUrl']),
      paidOn: str(i['paidOn']) || null,
      method: str(i['method']),
    })),
  }));
}

export function paymentsFromRaw(raw: unknown): TrainingPayment[] {
  return recs((raw as { payments?: unknown } | null)?.payments).map((p) => ({
    source: p['source'] === 'professor' ? 'professor' : 'arena',
    chargeId: str(p['chargeId']),
    payee: str(p['payee']),
    description: str(p['description'], 'Pagamento'),
    amountReais: num(p['amountReais']) ?? 0,
    paidOn: str(p['paidOn']),
    method: str(p['method']),
  }));
}

const METHOD_LABEL: Record<string, string> = { pix: 'Pix', card: 'Cartão', cash: 'Dinheiro', transfer: 'Transferência' };

/** Junta as origens numa tabela: em aberto primeiro (vence antes), depois as pagas (mais recentes). */
export function buildBillingRows(
  centers: TrainingCenterBilling[],
  charges: MyClassChargeItem[],
  payments: TrainingPayment[],
  todayKey: string,
): BillingRow[] {
  const rows: BillingRow[] = [];
  for (const c of centers) {
    for (const i of c.invoices) {
      if (i.status === 'refunded' || i.status === 'disputed') continue;
      const paid = i.status === 'approved';
      const open = i.status === 'pending' || i.status === 'failed';
      if (!paid && !open) continue;
      rows.push({
        key: `ct:${c.centerId}:${i.invoiceId}`,
        origin: 'center',
        title: i.reference,
        payee: c.name,
        date: paid ? (i.paidOn ?? i.dueDate) : i.dueDate,
        amountCents: i.amountCents,
        status: paid ? 'paid' : i.status === 'failed' ? 'failed' : i.dueDate && i.dueDate < todayKey ? 'late' : 'open',
        method: METHOD_LABEL[i.method] ?? (paid ? 'Online' : 'Pix ou cartão'),
        action: paid ? null : { kind: 'center', centerId: c.centerId, invoiceId: i.invoiceId },
        info: null,
      });
    }
  }
  for (const ch of charges) {
    rows.push({
      key: `ar:${ch.chargeId}`,
      origin: 'arena',
      title: ch.description,
      payee: ch.arenaName,
      date: ch.dueDate,
      amountCents: Math.round(ch.amountReais * 100),
      status: ch.overdue ? 'late' : 'open',
      method: ch.invoiceUrl ? 'Pix ou cartão' : 'Direto à arena',
      action: ch.invoiceUrl ? { kind: 'url', url: ch.invoiceUrl } : null,
      info: ch.invoiceUrl ? null : ch.payment === 'preparing' ? 'Link em preparo' : 'Pague direto à arena',
    });
  }
  for (const p of payments) {
    rows.push({
      key: `${p.source}:${p.chargeId}`,
      origin: p.source === 'professor' ? 'private' : 'arena',
      title: p.description,
      payee: p.payee,
      date: p.paidOn,
      amountCents: Math.round(p.amountReais * 100),
      status: 'paid',
      method: p.method,
      action: null,
      info: null,
    });
  }
  const open = rows.filter((r) => r.status !== 'paid').sort((a, b) => a.date.localeCompare(b.date));
  const paid = rows.filter((r) => r.status === 'paid').sort((a, b) => b.date.localeCompare(a.date));
  return [...open, ...paid];
}

export interface BillingSummary {
  openCents: number;
  openCount: number;
  nextDue: string | null;
  paidYearCents: number;
  paidYearCount: number;
  /** "CT Areia Alta · Pix todo dia 05" da primeira assinatura de centro. */
  recurring: { name: string; line: string } | null;
}

export function billingSummary(rows: BillingRow[], centers: TrainingCenterBilling[], todayKey: string): BillingSummary {
  const open = rows.filter((r) => r.status !== 'paid');
  const year = todayKey.slice(0, 4);
  const paidYear = rows.filter((r) => r.status === 'paid' && r.date.startsWith(year));
  let recurring: BillingSummary['recurring'] = null;
  for (const c of centers) {
    const e = c.enrollments.find((x) => x.billingDay != null);
    if (e && !recurring) {
      const how = e.billingMethod === 'card' ? 'Cartão' : e.billingMethod === 'pix_auto' ? 'Pix automático' : 'Pix';
      recurring = { name: c.name, line: `${how} · todo dia ${String(e.billingDay).padStart(2, '0')}` };
    }
  }
  return {
    openCents: open.reduce((s, r) => s + r.amountCents, 0),
    openCount: open.length,
    nextDue: open.length ? open[0]!.date : null,
    paidYearCents: paidYear.reduce((s, r) => s + r.amountCents, 0),
    paidYearCount: paidYear.length,
    recurring,
  };
}

// ── chamadas ───────────────────────────────────────────────────────────────

export async function fetchTrainingCenters(): Promise<TrainingCenterBilling[]> {
  const res = await httpsCallable(athleteFunctions(), 'getMyTrainingCenters')({});
  return centersFromRaw(res.data);
}

export async function fetchTrainingPayments(): Promise<TrainingPayment[]> {
  const res = await httpsCallable(athleteFunctions(), 'getMyTrainingPlans')({});
  return paymentsFromRaw(res.data);
}

/** As três fontes; uma falha não derruba as outras (vira lista vazia). */
export async function fetchBillingSources(): Promise<{
  centers: TrainingCenterBilling[];
  charges: MyClassChargeItem[];
  payments: TrainingPayment[];
}> {
  const [centers, charges, payments] = await Promise.all([
    fetchTrainingCenters().catch(() => [] as TrainingCenterBilling[]),
    fetchMyClassCharges().catch(() => [] as MyClassChargeItem[]),
    fetchTrainingPayments().catch(() => [] as TrainingPayment[]),
  ]);
  return { centers, charges, payments };
}

export async function fetchCenterInvoicePix(centerId: string, invoiceId: string): Promise<{
  status: string;
  invoiceUrl: string | null;
  pixPayload: string;
}> {
  const res = await httpsCallable(athleteFunctions(), 'getMyTrainingCenterInvoicePix')({ centerId, invoiceId });
  const d = (res.data ?? {}) as Record<string, unknown>;
  return { status: str(d['status'], 'pending'), invoiceUrl: safeExternalUrl(d['invoiceUrl']), pixPayload: str(d['pixPayload']) };
}

export async function checkCenterInvoice(centerId: string, invoiceId: string): Promise<string> {
  const res = await httpsCallable(athleteFunctions(), 'checkMyTrainingCenterInvoice')({ centerId, invoiceId });
  return str((res.data as Record<string, unknown> | null)?.['status'], 'pending');
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** `2026-11-05` → "05 nov". */
export function shortDate(dateKey: string | null): string {
  if (!dateKey) return '—';
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${String(d).padStart(2, '0')} ${months[m - 1]}`;
}

/** Seam das telas de Mensalidades (os testes e o harness de QA trocam pelas fixtures). */
export interface TrainingBillingApi {
  fetchBillingSources: typeof fetchBillingSources;
  fetchTrainingCenters: typeof fetchTrainingCenters;
  fetchCenterInvoicePix: typeof fetchCenterInvoicePix;
  checkCenterInvoice: typeof checkCenterInvoice;
}

export const TRAINING_BILLING_API = new InjectionToken<TrainingBillingApi>('TRAINING_BILLING_API', {
  providedIn: 'root',
  factory: () => ({ fetchBillingSources, fetchTrainingCenters, fetchCenterInvoicePix, checkCenterInvoice }),
});
