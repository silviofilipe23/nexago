import { skuKey, type StockRow } from './stock';

export type EntrySubtype = 'compra' | 'devolucao' | 'ajuste' | 'producao';

export const ENTRY_SUBTYPES: ReadonlyArray<{ id: EntrySubtype; label: string }> = [
  { id: 'compra', label: 'Compra de fornecedor' },
  { id: 'devolucao', label: 'Devolução de cliente' },
  { id: 'ajuste', label: 'Ajuste de inventário' },
  { id: 'producao', label: 'Produção própria' },
];

/** Igual ao servidor (`COST_ALERT_PERCENT`): acima disso o custo digitado gera alerta. */
export const COST_ALERT_PERCENT = 5;

export interface EntryLine {
  key: string;
  productId: string;
  skuId: string;
  qty: number;
  /** Centavos digitados; padrão = último custo do SKU. */
  unitCostCents: number;
}

export interface EntryAttachment {
  name: string;
  path: string;
  url: string;
  contentType: string;
}

export interface EntryForm {
  entryId: string;
  subtype: EntrySubtype;
  supplier: string;
  nfNumber: string;
  purchaseOrder: string;
  originOrder: string;
  reason: string;
  toLocationId: string;
  receivedAt: string;
  freightCents: number;
  lines: EntryLine[];
  note: string;
  attachments: EntryAttachment[];
  updateAvgCost: boolean;
}

export function todayIso(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function newEntryForm(entryId: string, toLocationId: string, now = new Date()): EntryForm {
  return {
    entryId,
    subtype: 'compra',
    supplier: '',
    nfNumber: '',
    purchaseOrder: '',
    originOrder: '',
    reason: '',
    toLocationId,
    receivedAt: todayIso(now),
    freightCents: 0,
    lines: [],
    note: '',
    attachments: [],
    updateAvgCost: true,
  };
}

/** Custo sugerido ao adicionar: última compra, senão o custo médio/do produto. */
export function defaultCost(row: StockRow): number {
  return row.lastCostCents ?? row.costCents ?? 0;
}

/** Adiciona o SKU ou soma `qty` na linha que já existe (o leitor de código soma +1). */
export function addLine(lines: EntryLine[], row: StockRow, qty = 1): EntryLine[] {
  const key = skuKey(row);
  const existing = lines.find((l) => l.key === key);
  if (existing) {
    return lines.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l));
  }
  return [...lines, { key, productId: row.productId, skuId: row.skuId, qty, unitCostCents: defaultCost(row) }];
}

export interface EntryTotals {
  skus: number;
  units: number;
  itemsCents: number;
  totalCents: number;
}

export function entryTotals(form: EntryForm): EntryTotals {
  const itemsCents = form.lines.reduce((n, l) => n + Math.max(0, l.qty) * l.unitCostCents, 0);
  const freight = form.subtype === 'compra' ? form.freightCents : 0;
  return {
    skus: form.lines.length,
    units: form.lines.reduce((n, l) => n + l.qty, 0),
    itemsCents,
    totalCents: itemsCents + freight,
  };
}

/** % sobre a última compra; `null` sem referência ou abaixo do limite de alerta. */
export function costAlert(line: EntryLine, row: StockRow | undefined): number | null {
  const last = row?.lastCostCents ?? null;
  if (last === null || last <= 0) {
    return null;
  }
  const pct = ((line.unitCostCents - last) / last) * 100;
  return Math.abs(pct) > COST_ALERT_PERCENT ? pct : null;
}

export type EntryErrors = Partial<Record<'supplier' | 'nfNumber' | 'originOrder' | 'reason' | 'toLocationId' | 'receivedAt' | 'lines', string>>;

/** Espelha os obrigatórios do servidor, para mostrar a borda vermelha antes da ida e volta. */
export function entryErrors(form: EntryForm): EntryErrors {
  const e: EntryErrors = {};
  if (!form.toLocationId) e.toLocationId = 'Escolha o local de destino.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.receivedAt)) e.receivedAt = 'Informe a data.';
  if (form.subtype === 'compra') {
    if (!form.supplier.trim()) e.supplier = 'Informe o fornecedor.';
    if (!form.nfNumber.trim()) e.nfNumber = 'Informe o número da nota.';
  }
  if (form.subtype === 'devolucao') {
    if (!form.originOrder.trim()) e.originOrder = 'Informe o pedido de origem.';
    if (!form.reason.trim()) e.reason = 'Informe o motivo.';
  }
  if (form.subtype === 'ajuste' && !form.reason.trim()) e.reason = 'O ajuste exige um motivo.';
  if (form.lines.length === 0) {
    e.lines = 'Adicione ao menos um item.';
  } else if (form.lines.some((l) => (form.subtype === 'ajuste' ? l.qty === 0 : l.qty < 1))) {
    e.lines = form.subtype === 'ajuste' ? 'Quantidade do ajuste não pode ser zero.' : 'Quantidade mínima é 1.';
  }
  return e;
}

/** Payload das callables `saveStockEntryDraft` / `confirmStockEntry`. */
export function toEntryInput(form: EntryForm) {
  return {
    entryId: form.entryId,
    subtype: form.subtype,
    supplier: form.supplier,
    nfNumber: form.nfNumber,
    purchaseOrder: form.purchaseOrder,
    originOrder: form.originOrder,
    reason: form.reason,
    toLocationId: form.toLocationId,
    receivedAt: form.receivedAt,
    freightCents: form.subtype === 'compra' ? form.freightCents : 0,
    items: form.lines.map((l) => ({ productId: l.productId, skuId: l.skuId, qty: l.qty, unitCostCents: l.unitCostCents })),
    note: form.note,
    attachments: form.attachments,
    options: { updateAvgCost: form.updateAvgCost },
  };
}

/** Rascunho salvo → formulário. Tolerante: o rascunho pode ser de uma versão anterior. */
export function formFromDraft(d: Record<string, any>, fallbackLocation: string): EntryForm {
  const base = newEntryForm(d['entryId'], d['toLocationId'] || fallbackLocation);
  return {
    ...base,
    subtype: d['subtype'] ?? 'compra',
    supplier: d['supplier'] ?? '',
    nfNumber: d['nfNumber'] ?? '',
    purchaseOrder: d['purchaseOrder'] ?? '',
    originOrder: d['originOrder'] ?? '',
    reason: d['reason'] ?? '',
    receivedAt: d['receivedAt'] || base.receivedAt,
    freightCents: d['freightCents'] ?? 0,
    lines: ((d['items'] ?? []) as Record<string, any>[]).map((i) => ({
      key: `${i['productId']}/${i['skuId']}`,
      productId: i['productId'],
      skuId: i['skuId'],
      qty: i['qty'] ?? 1,
      unitCostCents: i['unitCostCents'] ?? 0,
    })),
    note: d['note'] ?? '',
    attachments: d['attachments'] ?? [],
    updateAvgCost: d['options']?.['updateAvgCost'] !== false,
  };
}

// ---------------------------------------------------------------------------
// XML da NF-e
// ---------------------------------------------------------------------------

export interface NfeItem {
  code: string;
  ean: string;
  name: string;
  qty: number;
  unitCostCents: number;
}

export interface NfeData {
  supplier: string;
  nfNumber: string;
  issuedAt: string;
  freightCents: number;
  items: NfeItem[];
}

const cents = (v: string | null | undefined) => Math.round(Number(v ?? 0) * 100) || 0;

/**
 * Lê o XML da NF-e (layout 4.00): emitente, número, data de emissão, frete e
 * produtos. Ignora namespace de propósito — o XML vem com e sem `nfeProc`.
 * Devolve `null` quando não é uma NF-e.
 */
export function parseNfeXml(xml: string): NfeData | null {
  const docXml = new DOMParser().parseFromString(xml, 'application/xml');
  if (docXml.getElementsByTagName('parsererror').length > 0) {
    return null;
  }
  const first = (root: Element | Document, tag: string) => root.getElementsByTagNameNS('*', tag)[0] ?? null;
  const textOf = (root: Element | Document | null, tag: string) => (root ? (first(root, tag)?.textContent ?? '').trim() : '');
  const infNFe = first(docXml, 'infNFe');
  if (!infNFe) {
    return null;
  }
  const emit = first(infNFe, 'emit');
  const ide = first(infNFe, 'ide');
  const total = first(infNFe, 'ICMSTot');
  const dets = Array.from(infNFe.getElementsByTagNameNS('*', 'det'));
  const issued = textOf(ide, 'dhEmi') || textOf(ide, 'dEmi');
  return {
    supplier: textOf(emit, 'xFant') || textOf(emit, 'xNome'),
    nfNumber: textOf(ide, 'nNF'),
    issuedAt: issued.slice(0, 10),
    freightCents: cents(textOf(total, 'vFrete')),
    items: dets.map((det) => {
      const prod = first(det, 'prod');
      const ean = textOf(prod, 'cEAN');
      return {
        code: textOf(prod, 'cProd'),
        // "SEM GTIN" é o valor oficial de quem não tem código de barras.
        ean: /^\d+$/.test(ean) ? ean : '',
        name: textOf(prod, 'xProd'),
        qty: Math.round(Number(textOf(prod, 'qCom') || '0')),
        unitCostCents: cents(textOf(prod, 'vUnCom')),
      };
    }),
  };
}

/** Casa os itens da NF com os SKUs: EAN no código de barras, senão o código do fornecedor no SKU. */
export function matchNfeItems(items: NfeItem[], rows: StockRow[]): { matched: { item: NfeItem; row: StockRow }[]; unmatched: NfeItem[] } {
  const matched: { item: NfeItem; row: StockRow }[] = [];
  const unmatched: NfeItem[] = [];
  for (const item of items) {
    const row =
      (item.ean && rows.find((r) => r.barcode === item.ean)) ||
      (item.code && rows.find((r) => r.skuCode.toUpperCase() === item.code.toUpperCase())) ||
      null;
    if (row) {
      matched.push({ item, row });
    } else {
      unmatched.push(item);
    }
  }
  return { matched, unmatched };
}
