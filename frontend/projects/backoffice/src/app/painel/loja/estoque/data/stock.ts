export interface StockLocation {
  id: string;
  name: string;
  type: 'cd' | 'arena';
}

/** Uma linha da tabela: uma variação (SKU) com o saldo por local. */
export interface StockRow {
  productId: string;
  productName: string;
  skuId: string;
  skuCode: string;
  barcode: string;
  /** "Branco areia · M"; "único" quando o produto não tem variação. */
  variantLabel: string;
  category: string;
  imageUrl: string | null;
  byLocation: Partial<Record<string, number>>;
  total: number;
  /** Pedidos pagos ainda não retirados. Zero até a Loja ter pedidos. */
  reserved: number;
  /** Alerta de estoque baixo do produto (tela 05). */
  threshold: number;
  costCents: number | null;
}

export type MovementType = 'entrada' | 'saida' | 'transferencia' | 'ajuste';

export interface StockMovement {
  id: string;
  type: MovementType;
  title: string;
  itemsLabel: string;
  placeLabel: string;
  createdAt: Date | null;
}

export type QtyTone = 'zero' | 'low' | 'ok';

/** 0 vermelho · abaixo do alerta amarelo · resto neutro. Mesma regra da grade da tela 05. */
export function qtyTone(qty: number, threshold: number): QtyTone {
  if (qty <= 0) {
    return 'zero';
  }
  return qty < threshold ? 'low' : 'ok';
}

export function isLow(row: StockRow): boolean {
  return row.total < row.threshold || row.total === 0;
}

/** "Repor" quando o total está abaixo do alerta; senão "Transferir". */
export function rowAction(row: StockRow): 'repor' | 'transferir' {
  return isLow(row) ? 'repor' : 'transferir';
}

export function available(row: StockRow): number {
  return Math.max(0, row.total - row.reserved);
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export interface StockCriteria {
  q: string;
  category: string | null;
  lowFirst: boolean;
}

/** Busca por nome, SKU ou código de barras; todas as palavras precisam casar. */
export function filterRows(rows: StockRow[], criteria: StockCriteria): StockRow[] {
  const tokens = normalize(criteria.q).split(/\s+/).filter(Boolean);
  const filtered = rows.filter((row) => {
    if (criteria.category && row.category !== criteria.category) {
      return false;
    }
    if (tokens.length === 0) {
      return true;
    }
    const hay = normalize(`${row.productName} ${row.variantLabel} ${row.skuCode} ${row.barcode}`);
    return tokens.every((t) => hay.includes(t));
  });
  if (!criteria.lowFirst) {
    return filtered;
  }
  // Estável: dentro de cada grupo mantém a ordem de nome.
  return [...filtered.filter(isLow), ...filtered.filter((r) => !isLow(r))];
}

export interface StockKpis {
  units: number;
  skuCount: number;
  /** `null` quando nenhum SKU com saldo tem custo informado. */
  costValueCents: number | null;
  lowCount: number;
}

export function kpisOf(rows: StockRow[]): StockKpis {
  let costValueCents: number | null = null;
  for (const row of rows) {
    if (row.costCents !== null && row.total > 0) {
      costValueCents = (costValueCents ?? 0) + row.total * row.costCents;
    }
  }
  return {
    units: rows.reduce((n, r) => n + r.total, 0),
    skuCount: rows.length,
    costValueCents,
    lowCount: rows.filter(isLow).length,
  };
}

type Raw = Record<string, any>;

/** Documento de produto + SKUs → linhas. Tolerante a campo ausente (docs antigos). */
export function rowsFromProduct(
  productId: string,
  product: Raw,
  skus: { id: string; data: Raw }[],
  costCents: number | null,
): StockRow[] {
  const axes = (product['axes'] ?? []) as Raw[];
  const label = (axisValues: Record<string, string>) =>
    axes
      .map((axis) => {
        const value = axisValues[axis['id']];
        return ((axis['values'] ?? []) as Raw[]).find((v) => v['id'] === value)?.['label'] ?? value ?? '';
      })
      .filter((l: string) => l !== '')
      .join(' · ');
  return skus.map(({ id, data }) => {
    const byLocation = (data['stockByLocation'] ?? {}) as Record<string, number>;
    return {
      productId,
      productName: product['name'] ?? '',
      skuId: id,
      skuCode: data['code'] ?? '',
      barcode: data['barcode'] ?? '',
      variantLabel: label(data['axisValues'] ?? {}) || 'único',
      category: product['category'] ?? '',
      imageUrl: product['photos']?.[0]?.url ?? null,
      byLocation,
      total: Object.values(byLocation).reduce((n, q) => n + q, 0),
      reserved: 0,
      threshold: product['lowStockThreshold'] ?? 0,
      costCents,
    };
  });
}

/** Movimentação gravada → linha do card. `locationName` traduz id em nome. */
export function movementFromDoc(id: string, data: Raw, locationName: (id: string) => string): StockMovement {
  const items = (data['items'] ?? []) as Raw[];
  const type = (data['type'] ?? 'ajuste') as MovementType;
  const units = items.reduce((n, i) => n + Math.abs(i['delta'] ?? i['qty'] ?? 0), 0);
  const first = items[0];
  const itemName = first ? [first['productName'], first['variantLabel']].filter(Boolean).join(' ') : '';
  const sign = type === 'ajuste' ? (items.reduce((n, i) => n + (i['delta'] ?? 0), 0) >= 0 ? '+' : '−') : type === 'entrada' ? '+' : '';
  const itemsLabel =
    items.length === 1 ? `${sign}${units} ${itemName}`.trim() : `${sign}${units} un. · ${items.length} itens`;
  const from = data['fromLocationId'] ? locationName(data['fromLocationId']) : null;
  const to = data['toLocationId'] ? locationName(data['toLocationId']) : null;
  const touched = [...new Set(items.map((i) => i['locationId']).filter(Boolean))].map((l) => locationName(l));
  const placeLabel = from && to ? `${from} → ${to}` : (to ?? from ?? touched.join(', '));
  const createdAt = data['createdAt']?.toDate?.() ?? (data['createdAt'] instanceof Date ? data['createdAt'] : null);
  return {
    id,
    type,
    title: data['reference'] || data['reason'] || 'Movimentação',
    itemsLabel,
    placeLabel,
    createdAt,
  };
}

/** "Hoje 10:12" · "Ontem 19:44" · "12/10 18:00". */
export function relativeStamp(date: Date | null, now: Date): string {
  if (!date) {
    return '—';
  }
  const hm = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(date)) / 86_400_000);
  if (diff === 0) {
    return `Hoje ${hm}`;
  }
  if (diff === 1) {
    return `Ontem ${hm}`;
  }
  return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hm}`;
}
