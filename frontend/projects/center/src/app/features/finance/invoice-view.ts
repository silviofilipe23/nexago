import { daysBetween, formatDayKey } from '../../domain/dates';
import { awaitingTooLong, invoiceDisplayStatus } from '../../domain/enrollment';
import { centsToInput, formatBRL } from '../../domain/money';
import { INVOICE_STATUS, PAYMENT_METHOD_LABELS, type Invoice, type InvoiceStatus } from '../../domain/models';
import type { CsvCell } from '../../ui/csv';

export type InvoiceFilter = InvoiceStatus | 'late' | 'all';

/** Cobranças do mês (pelo vencimento), mais recentes primeiro. */
export function invoicesOfMonth(invoices: Invoice[], month: string): Invoice[] {
  return invoices
    .filter((i) => i.dueDate.slice(0, 7) === month)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate) || a.payerName.localeCompare(b.payerName, 'pt-BR'));
}

export interface InvoiceDetail {
  text: string;
  /** Pendente há mais de 2h sem confirmação. */
  warn: boolean;
}

/** Coluna "Detalhe" do financeiro (W21). */
export function invoiceDetail(inv: Invoice, today: string, now = new Date()): InvoiceDetail {
  const st = invoiceDisplayStatus(inv, today);
  const method = inv.method ? PAYMENT_METHOD_LABELS[inv.method] : '';
  switch (st) {
    case 'approved': {
      const base = [method, inv.providerRef || 'confirmação manual'].filter(Boolean).join(' · ');
      return { text: inv.refundedCents > 0 ? `${base} · estorno parcial ${formatBRL(inv.refundedCents)}` : base, warn: false };
    }
    case 'pending':
      return awaitingTooLong(inv, now)
        ? { text: 'Sem confirmação há mais de 2h', warn: true }
        : { text: 'Aguardando confirmação do pagamento', warn: false };
    case 'late': {
      const d = daysBetween(inv.dueDate, today);
      return { text: `${d} dia${d === 1 ? '' : 's'} em atraso`, warn: false };
    }
    case 'refunded':
      return { text: `Estorno ${formatBRL(inv.refundedCents || inv.amountCents)}`, warn: false };
    case 'disputed':
      return { text: 'Contestação aberta', warn: false };
    case 'failed':
      return { text: method ? `${method} recusado` : 'Pagamento recusado', warn: false };
    case 'cancelled':
      return { text: 'Cobrança cancelada', warn: false };
  }
}

/** Contagem por situação exibida (para os chips). */
export function countByDisplayStatus(invoices: Invoice[], today: string): Record<InvoiceStatus | 'late', number> {
  const c = { approved: 0, pending: 0, late: 0, disputed: 0, refunded: 0, failed: 0, cancelled: 0 };
  for (const i of invoices) {
    c[invoiceDisplayStatus(i, today)]++;
  }
  return c;
}

/** Linhas do CSV exportado (valores em reais com vírgula, como o Excel pt-BR espera). */
export function invoicesCsv(invoices: Invoice[], today: string): CsvCell[][] {
  const head = ['Pagador', 'Referência', 'Valor (R$)', 'Estornado (R$)', 'Vencimento', 'Situação', 'Forma', 'Detalhe'];
  return [
    head,
    ...invoices.map((i) => [
      i.payerName,
      i.reference,
      centsToInput(i.amountCents),
      centsToInput(i.refundedCents),
      formatDayKey(i.dueDate, true),
      INVOICE_STATUS[invoiceDisplayStatus(i, today)][0],
      i.method ? PAYMENT_METHOD_LABELS[i.method] : '',
      invoiceDetail(i, today).text,
    ]),
  ];
}
