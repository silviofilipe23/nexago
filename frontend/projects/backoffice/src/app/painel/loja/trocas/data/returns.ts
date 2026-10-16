import type { PillTone } from '../../../ui/pill.component';
import type { StockRow } from '../../estoque/data/stock';

export type ReturnReason = 'tamanho' | 'defeito' | 'nao_gostei' | 'avaria' | 'outro';
export type ReturnResolution = 'troca' | 'reembolso' | 'saldo' | 'reenvio';
export type ReturnStatus = 'analisar' | 'aprovada' | 'em_transito' | 'concluida' | 'recusada';
export type ReturnTab = 'analisar' | 'aguardando' | 'concluidas' | 'recusadas';

export const REASON_LABEL: Record<ReturnReason, string> = {
  tamanho: 'Tamanho errado',
  defeito: 'Defeito',
  nao_gostei: 'Não gostei',
  avaria: 'Avaria no transporte',
  outro: 'Outro',
};

export const RESOLUTION_LABEL: Record<ReturnResolution, string> = {
  troca: 'Troca de tamanho/cor',
  reembolso: 'Reembolso',
  saldo: 'Saldo na carteira',
  reenvio: 'Reenvio',
};

export const STATUS_PILL: Record<ReturnStatus, { tone: PillTone; label: string }> = {
  analisar: { tone: 'orange', label: 'Analisar' },
  aprovada: { tone: 'dim', label: 'Aprovada' },
  em_transito: { tone: 'dim', label: 'Em trânsito' },
  concluida: { tone: 'green', label: 'Concluída' },
  recusada: { tone: 'red', label: 'Recusada' },
};

export const RETURN_TABS: ReadonlyArray<{ id: ReturnTab; label: string; statuses: ReturnStatus[] }> = [
  { id: 'analisar', label: 'Para analisar', statuses: ['analisar'] },
  { id: 'aguardando', label: 'Aguardando produto', statuses: ['aprovada', 'em_transito'] },
  { id: 'concluidas', label: 'Concluídas', statuses: ['concluida'] },
  { id: 'recusadas', label: 'Recusadas', statuses: ['recusada'] },
];

/** Espelho de `DEFAULT_RETURNS_CONFIG` (functions/src/store-returns.ts). */
export interface ReturnsConfig {
  windowDays: number;
  arenaReturnFree: boolean;
  carrierLabelCents: number;
  storePaysReasons: ReturnReason[];
}

export const DEFAULT_RETURNS_CONFIG: ReturnsConfig = {
  windowDays: 30,
  arenaReturnFree: true,
  carrierLabelCents: 2490,
  storePaysReasons: ['defeito', 'avaria'],
};

export interface ReturnItem {
  productId: string;
  skuId: string;
  skuCode: string;
  productName: string;
  variantLabel: string;
}

export interface ReturnRequest {
  id: string;
  code: string;
  status: ReturnStatus;
  version: number;
  customerName: string;
  customerContact: string;
  orderRef: string;
  orderDate: string | null;
  deliveredAt: string | null;
  item: ReturnItem;
  newItem: ReturnItem | null;
  reason: ReturnReason;
  message: string;
  photos: { url: string; path: string }[];
  resolution: ReturnResolution;
  returnMethod: { type: 'arena' | 'correios'; locationId: string | null; costCents: number; paidBy: 'loja' | 'cliente' };
  skipReturn: boolean;
  refusalReason: string | null;
  inspection: 'ok' | 'avariado' | null;
  settlement: { type: string; amountCents: number | null; status: string } | null;
  paidCents: number | null;
  history: { status: ReturnStatus; actorName: string; at: Date | null; note: string }[];
  createdAt: Date | null;
}

type Raw = Record<string, any>;
const dateOf = (v: any): Date | null => v?.toDate?.() ?? (v instanceof Date ? v : null);

/** Documento → o que a tela usa. Tolerante a campo ausente. */
export function returnFromDoc(id: string, d: Raw): ReturnRequest {
  return {
    id,
    code: d['code'] ?? '',
    status: d['status'] ?? 'analisar',
    version: d['version'] ?? 0,
    customerName: d['customer']?.['name'] ?? '',
    customerContact: d['customer']?.['contact'] ?? '',
    orderRef: d['orderRef'] ?? '',
    orderDate: d['orderDate'] ?? null,
    deliveredAt: d['deliveredAt'] ?? null,
    item: d['item'] ?? { productId: '', skuId: '', skuCode: '', productName: '', variantLabel: '' },
    newItem: d['newItem'] ?? null,
    reason: d['reason'] ?? 'outro',
    message: d['message'] ?? '',
    photos: d['photos'] ?? [],
    resolution: d['resolution'] ?? 'reembolso',
    returnMethod: d['returnMethod'] ?? { type: 'arena', locationId: null, costCents: 0, paidBy: 'cliente' },
    skipReturn: d['skipReturn'] === true,
    refusalReason: d['refusalReason'] ?? null,
    inspection: d['inspection'] ?? null,
    settlement: d['settlement'] ?? null,
    paidCents: d['paidCents'] ?? null,
    history: ((d['history'] ?? []) as Raw[]).map((h) => ({
      status: h['status'],
      actorName: h['actor']?.['name'] ?? '',
      at: dateOf(h['at']),
      note: h['note'] ?? '',
    })),
    createdAt: dateOf(d['createdAt']),
  };
}

export function tabOf(status: ReturnStatus): ReturnTab {
  return RETURN_TABS.find((t) => t.statuses.includes(status))!.id;
}

export function tabCounts(list: ReturnRequest[]): Record<ReturnTab, number> {
  const out: Record<ReturnTab, number> = { analisar: 0, aguardando: 0, concluidas: 0, recusadas: 0 };
  for (const r of list) out[tabOf(r.status)]++;
  return out;
}

/** "Para analisar": mais antigas primeiro (fila). Demais abas: mais recentes primeiro. */
export function rowsForTab(list: ReturnRequest[], tab: ReturnTab): ReturnRequest[] {
  const time = (r: ReturnRequest) => r.createdAt?.getTime() ?? 0;
  const rows = list.filter((r) => tabOf(r.status) === tab);
  return rows.sort((a, b) => (tab === 'analisar' ? time(a) - time(b) : time(b) - time(a)));
}

/** "Laranja · P → M" quando é troca; senão a variação. */
export function itemVariantLabel(r: ReturnRequest): string {
  if (r.resolution === 'troca' && r.newItem) {
    const to = r.newItem.variantLabel.split(' · ').filter((p) => !r.item.variantLabel.split(' · ').includes(p)).join(' · ');
    return `${r.item.variantLabel} → ${to || r.newItem.variantLabel}`;
  }
  return r.item.variantLabel || 'único';
}

/** Dia corrido desde a entrega (dia 1 = o próprio dia). */
export function daysSinceDelivery(deliveredAt: string | null, now: Date): number | null {
  if (!deliveredAt || !/^\d{4}-\d{2}-\d{2}$/.test(deliveredAt)) return null;
  const [y, m, d] = deliveredAt.split('-').map(Number);
  const start = Date.UTC(y!, m! - 1, d!);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today - start) / 86_400_000) + 1;
}

export function windowCheck(r: ReturnRequest, now: Date, config: ReturnsConfig): { ok: boolean; label: string } {
  const day = daysSinceDelivery(r.deliveredAt, now);
  if (day === null) return { ok: true, label: 'Sem data de entrega' };
  return day <= config.windowDays ? { ok: true, label: `Dentro (dia ${day})` } : { ok: false, label: `Fora (dia ${day})` };
}

export function daysAgo(date: Date | null, now: Date): string {
  if (!date) return '';
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const n = Math.round((day(now) - day(date)) / 86_400_000);
  return n <= 0 ? 'hoje' : n === 1 ? 'há 1 dia' : `há ${n} dias`;
}

/** Rótulo do botão primário: muda com a resolução e o local. */
export function approveLabel(resolution: ReturnResolution, method: ReturnRequest['returnMethod']): string {
  switch (resolution) {
    case 'troca':
      return method.type === 'arena' ? 'Aprovar troca na arena' : 'Aprovar troca';
    case 'reembolso':
      return 'Aprovar reembolso';
    case 'saldo':
      return 'Aprovar como saldo na carteira';
    case 'reenvio':
      return 'Aprovar reenvio';
  }
}

/** "Na Arena Errejota · sem custo" / "Correios · etiqueta R$ 24,90 (cliente)". */
export function returnMethodLabel(r: ReturnRequest, locationName: (id: string) => string, money: (c: number) => string): string {
  const m = r.returnMethod;
  const who = m.paidBy === 'loja' ? 'por conta da loja' : 'por conta do cliente';
  if (m.type === 'arena') {
    return `Na ${locationName(m.locationId ?? '')} · ${m.costCents === 0 ? 'sem custo' : `${money(m.costCents)} ${who}`}`;
  }
  return `Correios · etiqueta ${money(m.costCents)} ${who}`;
}

/** Linha "Estoque do <nova variação>": total + o que tem no local da devolução. */
export function newVariantStock(r: ReturnRequest, rows: StockRow[]): { total: number; atReturn: number; available: number } | null {
  if (r.resolution !== 'troca' || !r.newItem) return null;
  const row = rows.find((x) => x.productId === r.newItem!.productId && x.skuId === r.newItem!.skuId);
  if (!row) return { total: 0, atReturn: 0, available: 0 };
  const loc = r.returnMethod.type === 'arena' ? (r.returnMethod.locationId ?? 'cd') : 'cd';
  const atReturn = row.byLocation[loc] ?? 0;
  return { total: row.total, atReturn, available: Math.max(0, atReturn - (row.reservedByLocation[loc] ?? 0)) };
}

export function canSkipReturn(reason: ReturnReason, resolution: ReturnResolution): boolean {
  return resolution === 'reenvio' && (reason === 'defeito' || reason === 'avaria');
}

export function shippingFor(type: 'arena' | 'correios', reason: ReturnReason, config: ReturnsConfig): { costCents: number; paidBy: 'loja' | 'cliente' } {
  const paidBy = config.storePaysReasons.includes(reason) ? 'loja' : 'cliente';
  if (type === 'arena') return { costCents: config.arenaReturnFree ? 0 : config.carrierLabelCents, paidBy };
  return { costCents: config.carrierLabelCents, paidBy };
}
