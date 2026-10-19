import type { StoreOrderView } from './store-checkout-model';
import { formatRating, normalizeSearch, showRating, type ReviewFit, type StoreAxis, type StoreProduct } from './store-showcase-model';

export type { ReviewFit, ReviewStats } from './store-showcase-model';

/**
 * Loja · Avaliação da compra (web 06b) e avaliações na página do produto (02).
 * Regras em `docs/business-rules/loja-avaliacoes.md`; o servidor (`functions/src/store-reviews.ts`)
 * e o app (`store_review_rules.dart`) seguem as mesmas — mudar os três.
 */

type Raw = Record<string, unknown>;

export type ReviewTag = 'qualidade' | 'conforto' | 'tamanho' | 'foto' | 'custo' | 'durabilidade';

/** Ordem dos chips do formulário. */
export const REVIEW_TAGS: ReadonlyArray<{ id: ReviewTag; label: string }> = [
  { id: 'qualidade', label: 'Qualidade' },
  { id: 'conforto', label: 'Conforto' },
  { id: 'tamanho', label: 'Tamanho certo' },
  { id: 'foto', label: 'Igual à foto' },
  { id: 'custo', label: 'Custo-benefício' },
  { id: 'durabilidade', label: 'Durabilidade' },
];
const TAG_IDS = REVIEW_TAGS.map((t) => t.id);

/** "Como ficou o tamanho?" — só produto com eixo Tamanho. */
export const REVIEW_FIT_OPTIONS: ReadonlyArray<{ id: ReviewFit; label: string }> = [
  { id: 'pequeno', label: 'Pequeno' },
  { id: 'certo', label: 'Certo' },
  { id: 'grande', label: 'Grande' },
];
const FIT_IDS = REVIEW_FIT_OPTIONS.map((f) => f.id);
/** Chip do card público. */
export const FIT_CHIP_LABEL: Record<ReviewFit, string> = { pequeno: 'Veste pequeno', certo: 'Tamanho certo', grande: 'Veste grande' };

export const RATING_LABELS = ['', 'Ruim', 'Regular', 'Bom', 'Muito bom', 'Excelente'] as const;

export const MAX_REVIEW_COMMENT = 500;
export const MAX_REVIEW_PHOTOS = 3;
export const MAX_REVIEW_PHOTO_BYTES = 10 * 1024 * 1024;
export const REVIEW_PHOTO_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);
/** Onde o atleta sobe a foto — o `REVIEW_UPLOAD_PREFIX` do servidor e a rule do Storage. */
export const REVIEW_UPLOAD_PREFIX = 'store/review-uploads';
/** Quantas avaliações a página do produto carrega (as mais recentes). */
export const PRODUCT_REVIEWS_LIMIT = 100;
/** Quantas a página mostra antes do "Ver todas". */
export const REVIEWS_PREVIEW = 3;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function rating(v: unknown): number {
  return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5 ? (v as number) : 0;
}

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  const ts = v as { toDate?: () => Date } | null | undefined;
  if (typeof ts?.toDate === 'function') return ts.toDate();
  if (typeof v === 'string' && v) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function tagsOf(v: unknown): ReviewTag[] {
  const list = Array.isArray(v) ? v : [];
  return TAG_IDS.filter((t) => list.includes(t));
}

function fitOf(v: unknown): ReviewFit | null {
  return FIT_IDS.includes(v as ReviewFit) ? (v as ReviewFit) : null;
}

// ── Eixo Tamanho ──────────────────────────────────────────────────

/** O mesmo teste do servidor: rótulo do eixo, sem acento e caixa, é "tamanho". */
export function isSizeAxis(axis: Pick<StoreAxis, 'label'>): boolean {
  return normalizeSearch(axis.label) === 'tamanho';
}

export function sizeAxisOf(product: StoreProduct | null | undefined): StoreAxis | null {
  return product?.axes.find(isSizeAxis) ?? null;
}

// ── Avaliação do pedido (`storeOrderReviews/{orderId}`, só do dono) ──

export interface StoredReviewPhoto {
  /** Caminho do upload — o que volta pra callable na edição. */
  path: string;
  url: string;
}

export interface OrderReviewItem {
  productId: string;
  name: string;
  variantLabel: string;
  imageUrl: string | null;
  rating: number;
  tags: ReviewTag[];
  fit: ReviewFit | null;
  comment: string;
  photos: StoredReviewPhoto[];
}

export interface OrderReview {
  orderId: string;
  anonymous: boolean;
  items: OrderReviewItem[];
  pickup: { placeName: string; rating: number } | null;
  createdAt: Date | null;
  editableUntil: Date | null;
}

export function orderReviewFromDoc(id: string, data: Raw | undefined): OrderReview | null {
  if (!data) return null;
  const items = (Array.isArray(data['items']) ? (data['items'] as Raw[]) : [])
    .map((i) => ({
      productId: str(i?.['productId']),
      name: str(i?.['name']),
      variantLabel: str(i?.['variantLabel']),
      imageUrl: str(i?.['imageUrl']) || null,
      rating: rating(i?.['rating']),
      tags: tagsOf(i?.['tags']),
      fit: fitOf(i?.['fit']),
      comment: str(i?.['comment']),
      photos: (Array.isArray(i?.['photos']) ? (i['photos'] as Raw[]) : [])
        .map((p) => ({ path: str(p?.['path']), url: str(p?.['url']) }))
        .filter((p) => p.path && p.url),
    }))
    .filter((i) => i.productId && i.rating > 0);
  const pickup = data['pickup'] as Raw | null | undefined;
  return {
    orderId: str(data['orderId']) || id,
    anonymous: data['anonymous'] === true,
    items,
    pickup: pickup && rating(pickup['rating']) ? { placeName: str(pickup['placeName']), rating: rating(pickup['rating']) } : null,
    createdAt: toDate(data['createdAt']),
    editableUntil: toDate(data['editableUntil']),
  };
}

/** Sem botão (pedido em andamento/cancelado) · avaliar · editar (30 dias) · só leitura. */
export type OrderReviewState = 'unavailable' | 'none' | 'editable' | 'locked';

export function orderReviewState(order: Pick<StoreOrderView, 'status'>, review: OrderReview | null | undefined, now: Date): OrderReviewState {
  if (order.status !== 'ent' && order.status !== 'rtd') return 'unavailable';
  if (!review) return 'none';
  return review.editableUntil && now.getTime() <= review.editableUntil.getTime() ? 'editable' : 'locked';
}

export interface ReviewTarget {
  productId: string;
  name: string;
  variantLabel: string;
  imageUrl: string | null;
  /** Produto com eixo Tamanho: pergunta o caimento e tira o chip "Tamanho certo". */
  sized: boolean;
}

/** Um alvo por produto do pedido (a primeira linha dele), como o servidor. */
export function reviewTargets(order: Pick<StoreOrderView, 'items'>, products: ReadonlyMap<string, StoreProduct>): ReviewTarget[] {
  const seen = new Set<string>();
  const out: ReviewTarget[] = [];
  for (const line of order.items) {
    if (!line.productId || seen.has(line.productId)) continue;
    seen.add(line.productId);
    out.push({
      productId: line.productId,
      name: line.name,
      variantLabel: line.customizationLabel ? [line.variantLabel, line.customizationLabel].filter(Boolean).join(' · ') : line.variantLabel,
      imageUrl: line.imageUrl,
      sized: sizeAxisOf(products.get(line.productId)) !== null,
    });
  }
  return out;
}

export function formTags(sized: boolean): ReadonlyArray<{ id: ReviewTag; label: string }> {
  return sized ? REVIEW_TAGS.filter((t) => t.id !== 'tamanho') : REVIEW_TAGS;
}

// ── Rascunho do formulário ─────────────────────────────────────────

export interface DraftPhoto {
  /** Caminho no Storage; vazio enquanto sobe. */
  path: string;
  /** Link (foto já publicada) ou object URL (recém escolhida). */
  preview: string;
  uploading: boolean;
}

export interface ReviewDraftItem {
  productId: string;
  /** 0 = sem nota (pulado). */
  rating: number;
  tags: ReviewTag[];
  fit: ReviewFit | null;
  comment: string;
  photos: DraftPhoto[];
}

export function draftFromReview(targets: readonly ReviewTarget[], review: OrderReview | null | undefined): ReviewDraftItem[] {
  return targets.map((t) => {
    const prev = review?.items.find((i) => i.productId === t.productId);
    return {
      productId: t.productId,
      rating: prev?.rating ?? 0,
      tags: prev ? prev.tags.filter((tag) => !(t.sized && tag === 'tamanho')) : [],
      fit: t.sized ? (prev?.fit ?? null) : null,
      comment: prev?.comment ?? '',
      photos: (prev?.photos ?? []).map((p) => ({ path: p.path, preview: p.url, uploading: false })),
    };
  });
}

export interface SubmitReviewInput {
  orderId: string;
  anonymous: boolean;
  items: { productId: string; rating: number; tags: ReviewTag[]; fit: ReviewFit | null; comment: string; photos: string[] }[];
  pickupRating: number | null;
}

/** Só vai o que tem nota; foto ainda subindo não vai. */
export function submitPayload(orderId: string, anonymous: boolean, items: readonly ReviewDraftItem[], pickupRating: number): SubmitReviewInput {
  return {
    orderId,
    anonymous,
    items: items
      .filter((i) => i.rating > 0)
      .map((i) => ({
        productId: i.productId,
        rating: i.rating,
        tags: i.tags,
        fit: i.fit,
        comment: i.comment.trim().slice(0, MAX_REVIEW_COMMENT),
        photos: i.photos.filter((p) => !p.uploading && p.path).map((p) => p.path),
      })),
    pickupRating: pickupRating > 0 ? pickupRating : null,
  };
}

export function canPublish(items: readonly ReviewDraftItem[]): boolean {
  return items.some((i) => i.rating > 0) && !items.some((i) => i.photos.some((p) => p.uploading));
}

// ── Avaliação pública (`storeShowcase/{id}/reviews`) ────────────────

export interface PublicReview {
  id: string;
  rating: number;
  tags: ReviewTag[];
  fit: ReviewFit | null;
  comment: string;
  photos: string[];
  variantLabel: string;
  sizeValueId: string | null;
  authorName: string;
  authorInitials: string;
  createdAt: Date | null;
}

export function publicReviewFromDoc(id: string, data: Raw | undefined): PublicReview | null {
  if (!data || !rating(data['rating'])) return null;
  return {
    id,
    rating: rating(data['rating']),
    tags: tagsOf(data['tags']),
    fit: fitOf(data['fit']),
    comment: str(data['comment']),
    photos: (Array.isArray(data['photos']) ? data['photos'] : []).map(str).filter(Boolean),
    variantLabel: str(data['variantLabel']),
    sizeValueId: str(data['sizeValueId']) || null,
    authorName: str(data['authorName']) || 'Atleta NexaGO',
    authorInitials: str(data['authorInitials']) || '··',
    createdAt: toDate(data['createdAt']),
  };
}

/** Etiquetas do card + o caimento. */
export function reviewChips(r: Pick<PublicReview, 'tags' | 'fit'>): string[] {
  const tags = r.tags.filter((t) => !(r.fit && t === 'tamanho')).map((t) => REVIEW_TAGS.find((x) => x.id === t)!.label);
  return r.fit ? [...tags, FIT_CHIP_LABEL[r.fit]] : tags;
}

// ── Resumo do produto ──────────────────────────────────────────────

/** Mínimo de respostas de caimento pra barra aparecer. */
const MIN_FIT_ANSWERS = 3;

export interface ReviewSummary {
  count: number;
  /** "4,8" — só com 3 avaliações ou mais (`showRating`). */
  average: string | null;
  /** Estrelas cheias do resumo (média arredondada). */
  stars: number;
  /** % por estrela, de 5 para 1. */
  distPct: { stars: number; pct: number }[];
  recommendPct: number;
  /** Barra "Pequeno · Veste bem · Grande". */
  fit: { position: number; label: string } | null;
}

export function fitIndicator(fit: Record<ReviewFit, number>): { position: number; label: string } | null {
  const total = fit.pequeno + fit.certo + fit.grande;
  if (total < MIN_FIT_ANSWERS) return null;
  const position = Math.round(50 + (50 * (fit.grande - fit.pequeno)) / total);
  const label = position < 40 ? 'Veste pequeno' : position > 60 ? 'Veste grande' : 'Veste bem';
  return { position, label };
}

export function reviewSummary(product: StoreProduct): ReviewSummary {
  const n = product.ratingCount;
  const stats = product.reviewStats;
  const pct = (x: number) => (n > 0 ? Math.round((x / n) * 100) : 0);
  const visible = showRating(product);
  return {
    count: n,
    average: visible ? formatRating(product.ratingAvg!) : null,
    stars: visible ? Math.round(product.ratingAvg!) : 0,
    distPct: [5, 4, 3, 2, 1].map((s) => ({ stars: s, pct: pct(stats.dist[s - 1]) })),
    recommendPct: pct(stats.recommend),
    fit: sizeAxisOf(product) ? fitIndicator(stats.fit) : null,
  };
}

/** "86 avaliações" / "1 avaliação". */
export function reviewCountLabel(n: number): string {
  return n === 1 ? '1 avaliação' : `${n} avaliações`;
}

// ── Lista: filtros e ordem ─────────────────────────────────────────

export type ReviewFilter = 'todas' | 'foto' | 'cinco' | 'tamanho';
export type ReviewSort = 'recentes' | 'melhor' | 'pior';

export const REVIEW_SORT_OPTIONS: ReadonlyArray<{ id: ReviewSort; label: string }> = [
  { id: 'recentes', label: 'Mais recentes' },
  { id: 'melhor', label: 'Melhor nota' },
  { id: 'pior', label: 'Pior nota' },
];

export function matchesReviewFilter(r: PublicReview, filter: ReviewFilter, sizeValueId: string | null): boolean {
  switch (filter) {
    case 'foto':
      return r.photos.length > 0;
    case 'cinco':
      return r.rating === 5;
    case 'tamanho':
      return sizeValueId !== null && r.sizeValueId === sizeValueId;
    default:
      return true;
  }
}

export interface ReviewFilterChip {
  id: ReviewFilter;
  label: string;
  count: number;
}

/**
 * Todas · Com foto · 5 estrelas · "Tamanho M" (só com tamanho escolhido e avaliação nele). A
 * contagem é do que o filtro mostra (as carregadas), não do agregado do produto.
 */
export function reviewFilterChips(list: readonly PublicReview[], size: { valueId: string; label: string } | null): ReviewFilterChip[] {
  const chips: ReviewFilterChip[] = [
    { id: 'todas', label: 'Todas', count: list.length },
    { id: 'foto', label: 'Com foto', count: list.filter((r) => r.photos.length > 0).length },
    { id: 'cinco', label: '5 estrelas', count: list.filter((r) => r.rating === 5).length },
  ];
  if (size) {
    const n = list.filter((r) => r.sizeValueId === size.valueId).length;
    if (n > 0) chips.push({ id: 'tamanho', label: `Tamanho ${size.label}`, count: n });
  }
  return chips;
}

export function sortReviews(list: readonly PublicReview[], sort: ReviewSort): PublicReview[] {
  const time = (r: PublicReview) => r.createdAt?.getTime() ?? 0;
  const byDate = (a: PublicReview, b: PublicReview) => time(b) - time(a);
  const out = [...list];
  if (sort === 'melhor') return out.sort((a, b) => b.rating - a.rating || byDate(a, b));
  if (sort === 'pior') return out.sort((a, b) => a.rating - b.rating || byDate(a, b));
  return out.sort(byDate);
}

// ── Datas ──────────────────────────────────────────────────────────

const SAO_PAULO_OFFSET_MS = 3 * 3_600_000;
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "12 out" (· "12 out 2025" em outro ano), no relógio de São Paulo. */
export function formatReviewDate(at: Date | null, now: Date): string {
  if (!at) return '';
  const w = new Date(at.getTime() - SAO_PAULO_OFFSET_MS);
  const n = new Date(now.getTime() - SAO_PAULO_OFFSET_MS);
  const base = `${w.getUTCDate()} ${MONTHS[w.getUTCMonth()]}`;
  return w.getUTCFullYear() === n.getUTCFullYear() ? base : `${base} ${w.getUTCFullYear()}`;
}

// ── Erros ──────────────────────────────────────────────────────────

/** Mensagem do `HttpsError` (o servidor manda pronta em português) ou a genérica. */
export function reviewErrorMessage(e: unknown): string {
  const err = e as { code?: unknown; message?: unknown } | null;
  const code = typeof err?.code === 'string' ? err.code.replace(/^(functions|storage)\//, '') : '';
  const raw = typeof err?.message === 'string' ? err.message : '';
  const detail = raw.replace(/^Firebase:\s*/i, '').replace(/\s*\((functions|storage)\/[^)]+\)\.?\s*$/i, '').trim();
  switch (code) {
    case 'unauthenticated':
      return 'Sua sessão expirou. Entre de novo para continuar.';
    // Callable ainda não deployada: "not-found" cru, sem mensagem do servidor.
    case 'not-found':
      return detail && detail.toLowerCase() !== 'not-found' && detail.toLowerCase() !== 'not found'
        ? detail
        : 'A avaliação ainda não está disponível. Tente de novo em instantes.';
    case 'invalid-argument':
    case 'failed-precondition':
    case 'aborted':
    case 'permission-denied':
      return detail || 'Não deu pra publicar a avaliação. Tente de novo.';
    case 'unauthorized':
      return 'Não deu pra enviar a foto. Entre de novo e tente outra vez.';
    default:
      return 'Não deu pra publicar a avaliação. Tente de novo em instantes.';
  }
}
