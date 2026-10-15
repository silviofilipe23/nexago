import {
  PRODUCT_COLLECTIONS,
  type ProductCategory,
  type ProductChannel,
  type StoreProduct,
} from './products.repository';

export type StockState = 'esgotado' | 'baixo' | 'ok';
export type ProductTab = 'todos' | 'ativos' | 'rascunhos' | 'esgotados' | 'baixo';

export const PRODUCT_TABS: ReadonlyArray<{ id: ProductTab; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'ativos', label: 'Ativos' },
  { id: 'rascunhos', label: 'Rascunhos' },
  { id: 'esgotados', label: 'Esgotados' },
  { id: 'baixo', label: 'Estoque baixo' },
];

export interface ProductCriteria {
  tab: ProductTab;
  q: string;
  category: ProductCategory | null;
  channel: ProductChannel | null;
  collection: string | null;
}

export const EMPTY_CRITERIA: ProductCriteria = {
  tab: 'todos',
  q: '',
  category: null,
  channel: null,
  collection: null,
};

const CATEGORIES: readonly ProductCategory[] = [
  'bolas',
  'vestuario',
  'acessorios',
  'rede-quadra',
  'kits',
];
const CHANNELS: readonly ProductChannel[] = ['web', 'app'];
const COLLECTION_IDS: readonly string[] = PRODUCT_COLLECTIONS.map((c) => c.id);

/** Minúscula e sem acento, para a busca não depender de como o operador digita. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Derivado de `stock`: nunca é campo gravado, para contador e pill não divergirem. */
export function stockState(product: StoreProduct): StockState {
  if (product.stock === 0) {
    return 'esgotado';
  }
  return product.stock <= product.lowStockThreshold ? 'baixo' : 'ok';
}

export function searchMatches(product: StoreProduct, q: string): boolean {
  const needle = normalize(q);
  if (!needle) {
    return true;
  }
  const haystack = [product.name, product.sku, ...product.barcodes].map(normalize);
  return haystack.some((h) => h.includes(needle));
}

function matchesTab(product: StoreProduct, tab: ProductTab): boolean {
  switch (tab) {
    case 'todos':
      return true;
    case 'ativos':
      return product.active;
    case 'rascunhos':
      return product.status === 'rascunho';
    case 'esgotados':
      return stockState(product) === 'esgotado';
    case 'baixo':
      return stockState(product) === 'baixo';
  }
}

/** Tudo menos a aba: é o que os contadores das abas enxergam. */
function matchesRest(product: StoreProduct, c: ProductCriteria): boolean {
  if (!searchMatches(product, c.q)) {
    return false;
  }
  if (c.category && product.category !== c.category) {
    return false;
  }
  if (c.channel && !product.channels.includes(c.channel)) {
    return false;
  }
  if (c.collection && !product.collections.includes(c.collection)) {
    return false;
  }
  return true;
}

export function filterProducts(rows: StoreProduct[], c: ProductCriteria): StoreProduct[] {
  return rows.filter((p) => matchesRest(p, c) && matchesTab(p, c.tab));
}

/** Conta cada aba sobre os outros filtros, para o número ser o que o clique vai mostrar. */
export function tabCounts(rows: StoreProduct[], c: ProductCriteria): Record<ProductTab, number> {
  const rest = rows.filter((p) => matchesRest(p, c));
  return {
    todos: rest.length,
    ativos: rest.filter((p) => matchesTab(p, 'ativos')).length,
    rascunhos: rest.filter((p) => matchesTab(p, 'rascunhos')).length,
    esgotados: rest.filter((p) => matchesTab(p, 'esgotados')).length,
    baixo: rest.filter((p) => matchesTab(p, 'baixo')).length,
  };
}

type RawParams = Record<string, string | null | undefined>;

function oneOf<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | null {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** Valor estranho na URL cai no padrão: lista vazia sem explicação é pior que ignorar o parâmetro. */
export function criteriaFromParams(params: RawParams): ProductCriteria {
  return {
    tab: oneOf(params['aba'], PRODUCT_TABS.map((t) => t.id)) ?? 'todos',
    q: (params['q'] ?? '').trim(),
    category: oneOf(params['categoria'], CATEGORIES),
    channel: oneOf(params['canal'], CHANNELS),
    collection: oneOf(params['colecao']?.trim(), COLLECTION_IDS),
  };
}

/** `null` apaga o parâmetro: o padrão não suja a URL. */
export function paramsFromCriteria(c: ProductCriteria): Record<string, string | null> {
  return {
    aba: c.tab === 'todos' ? null : c.tab,
    q: c.q.trim() || null,
    categoria: c.category,
    canal: c.channel,
    colecao: c.collection,
  };
}
