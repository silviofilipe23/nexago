/**
 * Loja › Avaliações: o doc privado `storeOrderReviews/{orderId}` achatado por produto avaliado.
 * Esconder/reexibir só pela callable `moderateStoreReview`; o gatilho tira/devolve o espelho
 * público e refaz a nota. Regras em `docs/business-rules/loja-avaliacoes.md`.
 */
type Raw = Record<string, any>;

export type ReviewFit = 'pequeno' | 'certo' | 'grande';
export type ReviewTab = 'publicadas' | 'escondidas';

/** Rótulos de `REVIEW_TAGS` (functions/src/store-reviews.ts), na ordem do formulário. */
export const TAG_LABEL: Record<string, string> = {
  qualidade: 'Qualidade',
  conforto: 'Conforto',
  tamanho: 'Tamanho certo',
  foto: 'Igual à foto',
  custo: 'Custo-benefício',
  durabilidade: 'Durabilidade',
};

export const FIT_LABEL: Record<ReviewFit, string> = {
  pequeno: 'Veste pequeno',
  certo: 'Tamanho certo',
  grande: 'Veste grande',
};

export const RATING_LABEL = ['Ruim', 'Regular', 'Bom', 'Muito bom', 'Excelente'];

/** Espelho de `MAX_HIDDEN_REASON` (functions/src/store-reviews.ts). */
export const MAX_HIDDEN_REASON = 300;

export const REVIEW_TABS: ReadonlyArray<{ id: ReviewTab; label: string }> = [
  { id: 'publicadas', label: 'Publicadas' },
  { id: 'escondidas', label: 'Escondidas' },
];

export interface ReviewRow {
  /** `orderId/productId` — uma avaliação por produto do pedido. */
  key: string;
  orderId: string;
  orderNumber: string;
  productId: string;
  productName: string;
  variantLabel: string;
  imageUrl: string | null;
  rating: number;
  tags: string[];
  fit: ReviewFit | null;
  comment: string;
  photos: string[];
  authorName: string;
  anonymous: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
  hiddenAt: Date | null;
  hiddenByName: string;
  hiddenReason: string;
}

export interface ReviewFilters {
  /** Só com comentário ou foto — onde mora o que pode precisar sair. */
  content: boolean;
  /** Nota 1 ou 2. */
  low: boolean;
}

const dateOf = (v: any): Date | null => v?.toDate?.() ?? (v instanceof Date ? v : null);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Um doc de pedido vira uma linha por produto avaliado (item sem nota não conta). */
export function rowsFromDoc(id: string, d: Raw): ReviewRow[] {
  const items: Raw[] = Array.isArray(d['items']) ? d['items'] : [];
  return items
    .filter((i) => str(i?.['productId']) && Number.isInteger(i['rating']))
    .map((i) => ({
      key: `${id}/${str(i['productId'])}`,
      orderId: id,
      orderNumber: str(d['number']),
      productId: str(i['productId']),
      productName: str(i['name']) || 'Produto',
      variantLabel: str(i['variantLabel']),
      imageUrl: str(i['imageUrl']) || null,
      rating: i['rating'],
      tags: (Array.isArray(i['tags']) ? i['tags'] : []).filter((t: unknown) => typeof t === 'string' && TAG_LABEL[t]),
      fit: i['fit'] in FIT_LABEL ? (i['fit'] as ReviewFit) : null,
      comment: str(i['comment']),
      photos: (Array.isArray(i['photos']) ? i['photos'] : []).map((p: Raw) => str(p?.['url'])).filter(Boolean),
      authorName: str(d['authorName']) || 'Atleta NexaGO',
      anonymous: d['anonymous'] === true,
      createdAt: dateOf(i['createdAt']),
      updatedAt: dateOf(i['updatedAt']) ?? dateOf(d['updatedAt']),
      hiddenAt: dateOf(i['hiddenAt']),
      hiddenByName: str(i['hiddenBy']?.['name']),
      hiddenReason: str(i['hiddenReason']),
    }));
}

/** Mais recente primeiro (a última edição do autor). */
export function sortRows(rows: ReviewRow[]): ReviewRow[] {
  return [...rows].sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
}

export function tabOf(r: ReviewRow): ReviewTab {
  return r.hiddenAt ? 'escondidas' : 'publicadas';
}

export function hasContent(r: ReviewRow): boolean {
  return r.comment !== '' || r.photos.length > 0;
}

export function matchesFilters(r: ReviewRow, f: ReviewFilters): boolean {
  return (!f.content || hasContent(r)) && (!f.low || r.rating <= 2);
}

/** Contagem das abas com os filtros ligados — o número bate com a lista que a aba mostra. */
export function tabCounts(rows: ReviewRow[], f: ReviewFilters): Record<ReviewTab, number> {
  const counts: Record<ReviewTab, number> = { publicadas: 0, escondidas: 0 };
  for (const r of rows) if (matchesFilters(r, f)) counts[tabOf(r)] += 1;
  return counts;
}

export function rowsFor(rows: ReviewRow[], tab: ReviewTab, f: ReviewFilters): ReviewRow[] {
  return rows.filter((r) => tabOf(r) === tab && matchesFilters(r, f));
}

/** Troca as linhas de um pedido pelas relidas, mantendo a ordem. */
export function replaceOrder(rows: ReviewRow[], orderId: string, fresh: ReviewRow[]): ReviewRow[] {
  return sortRows([...rows.filter((r) => r.orderId !== orderId), ...fresh]);
}
