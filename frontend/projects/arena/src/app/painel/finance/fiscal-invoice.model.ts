/** Espelha `fiscalInvoices/{id}`, escrito só pelas functions. */

export type FiscalInvoiceStatus =
  | 'requested'
  | 'processing'
  | 'authorized'
  | 'rejected'
  | 'cancelled'
  | 'cancellation_failed';

export const FISCAL_INVOICE_STATUS_LABEL: Record<FiscalInvoiceStatus, string> = {
  requested: 'Na fila',
  processing: 'Processando',
  authorized: 'Autorizada',
  rejected: 'Rejeitada',
  cancelled: 'Cancelada',
  cancellation_failed: 'Falha ao cancelar',
};

export const FISCAL_INVOICE_ORIGIN_LABEL: Record<string, string> = {
  booking: 'Reserva',
  club: 'Clubinho',
  manual: 'Avulsa',
  activation_test: 'Teste de ativação',
};

export interface FiscalInvoiceItem {
  id: string;
  origin: string;
  status: FiscalInvoiceStatus;
  numero: string | null;
  valorBrutoReais: number;
  tomadorNome: string;
  tomadorDocumento: string;
  pdfUrl: string | null;
  xmlUrl: string | null;
  errorMessage: string | null;
  createdAt: Date | null;
}

function toDate(value: unknown): Date | null {
  const ts = value as {toDate?: () => Date} | undefined;
  return typeof ts?.toDate === 'function' ? ts.toDate() : null;
}

/** Documento incompleto acontece enquanto a nota está em voo. */
export function mapFiscalInvoice(id: string, raw: Record<string, unknown>): FiscalInvoiceItem {
  const tomador = (raw['tomador'] ?? {}) as {nome?: string; cpfCnpj?: string};
  return {
    id,
    origin: (raw['origin'] as string) ?? 'booking',
    status: (raw['status'] as FiscalInvoiceStatus) ?? 'requested',
    numero: (raw['numero'] as string) ?? null,
    valorBrutoReais: Number(raw['valorBrutoReais']) || 0,
    tomadorNome: tomador.nome ?? '—',
    tomadorDocumento: tomador.cpfCnpj ?? '',
    pdfUrl: (raw['pdfUrl'] as string) ?? null,
    xmlUrl: (raw['xmlUrl'] as string) ?? null,
    errorMessage: (raw['errorMessage'] as string) ?? null,
    createdAt: toDate(raw['createdAt']),
  };
}
