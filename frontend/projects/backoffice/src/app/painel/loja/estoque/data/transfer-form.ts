import { skuKey, type StockRow } from './stock';

/** Dias de giro que a sugestão cobre no destino (igual ao servidor). */
export const COVERAGE_DAYS = 14;

export interface TransferLine {
  key: string;
  productId: string;
  skuId: string;
  qty: number;
}

export interface TransferForm {
  fromLocationId: string;
  toLocationId: string;
  lines: TransferLine[];
  transport: string;
  departAt: string;
  arriveAt: string;
  receiver: string;
  note: string;
}

export function newTransferForm(fromLocationId: string, toLocationId: string): TransferForm {
  return { fromLocationId, toLocationId, lines: [], transport: '', departAt: '', arriveAt: '', receiver: '', note: '' };
}

/** Disponível para sair da origem: saldo menos reservado ali. */
export function availableAt(row: StockRow, locationId: string): number {
  return Math.max(0, (row.byLocation[locationId] ?? 0) - (row.reservedByLocation[locationId] ?? 0));
}

/**
 * Sugerido: `max(0, ceil(saídaDiária × 14) + reservadosPendentes − qtdDestino)`, limitado à origem.
 * Sem saídas nem pedidos ainda, cobre só até o alerta do produto no destino.
 */
export function suggestedQty(row: StockRow, form: TransferForm, dailyOut = 0, reservedPending = 0): number {
  const dest = row.byLocation[form.toLocationId] ?? 0;
  const target = dailyOut > 0 ? Math.ceil(dailyOut * COVERAGE_DAYS) : row.threshold;
  const need = Math.max(0, target + reservedPending - dest);
  return Math.min(need, availableAt(row, form.fromLocationId));
}

export function addTransferLine(lines: TransferLine[], row: StockRow, qty = 1): TransferLine[] {
  const key = skuKey(row);
  if (lines.some((l) => l.key === key)) {
    return lines.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l));
  }
  return [...lines, { key, productId: row.productId, skuId: row.skuId, qty }];
}

/** "Preencher com sugerido": copia o sugerido para cada linha; linha sem sugestão fica como está. */
export function fillSuggested(form: TransferForm, rowOf: (key: string) => StockRow | undefined): TransferLine[] {
  return form.lines.map((l) => {
    const row = rowOf(l.key);
    const s = row ? suggestedQty(row, form) : 0;
    return s > 0 ? { ...l, qty: s } : l;
  });
}

/** SKUs do catálogo com sugestão positiva, para semear uma transferência vazia. */
export function suggestedRows(rows: StockRow[], form: TransferForm): StockRow[] {
  return rows.filter((r) => suggestedQty(r, form) > 0);
}

export interface TransferTotals {
  skus: number;
  units: number;
  costCents: number | null;
}

export function transferTotals(form: TransferForm, rowOf: (key: string) => StockRow | undefined): TransferTotals {
  let cost: number | null = null;
  for (const l of form.lines) {
    const c = rowOf(l.key)?.costCents;
    if (c !== null && c !== undefined) cost = (cost ?? 0) + c * l.qty;
  }
  return { skus: form.lines.length, units: form.lines.reduce((n, l) => n + l.qty, 0), costCents: cost };
}

export type TransferErrors = Partial<Record<'fromLocationId' | 'toLocationId' | 'lines', string>>;

export function transferErrors(form: TransferForm, rowOf: (key: string) => StockRow | undefined, submit: boolean): TransferErrors {
  const e: TransferErrors = {};
  if (!form.fromLocationId) e.fromLocationId = 'Escolha a origem.';
  if (!form.toLocationId) e.toLocationId = 'Escolha o destino.';
  if (form.fromLocationId && form.fromLocationId === form.toLocationId) e.toLocationId = 'Destino igual à origem.';
  if (submit && form.lines.length === 0) e.lines = 'Adicione SKUs ou use Preencher com sugerido.';
  const over = form.lines.find((l) => {
    const row = rowOf(l.key);
    return !row || l.qty < 1 || (submit && l.qty > availableAt(row, form.fromLocationId));
  });
  if (over) e.lines = e.lines ?? 'Há quantidade acima do disponível na origem.';
  return e;
}

/** Linhas que ficam abaixo do alerta na origem depois da transferência (alerta vermelho da 06b). */
export function lowAfter(form: TransferForm, rowOf: (key: string) => StockRow | undefined): { row: StockRow; after: number }[] {
  return form.lines
    .map((l) => ({ row: rowOf(l.key), after: 0, qty: l.qty }))
    .filter((x): x is { row: StockRow; after: number; qty: number } => x.row !== undefined)
    .map((x) => ({ row: x.row, after: (x.row.byLocation[form.fromLocationId] ?? 0) - x.qty }))
    .filter((x) => x.after < x.row.threshold);
}

export function toTransferInput(form: TransferForm, meta: { transferId: string | null; version: number | null }, submit: boolean) {
  return {
    ...(meta.transferId ? { transferId: meta.transferId, version: meta.version } : {}),
    fromLocationId: form.fromLocationId,
    toLocationId: form.toLocationId,
    items: form.lines.map((l) => ({ productId: l.productId, skuId: l.skuId, qty: l.qty })),
    transport: form.transport,
    departAt: form.departAt,
    arriveAt: form.arriveAt,
    receiver: form.receiver,
    note: form.note,
    submit,
  };
}

/** "2026-10-17T08:00" → "17/10 · 08:00". */
export function formatStamp(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (!m) {
    return value;
  }
  return m[4] ? `${m[3]}/${m[2]} · ${m[4]}:${m[5]}` : `${m[3]}/${m[2]}`;
}
