/**
 * Loja · Avaliação da compra (web 06b, app 08b/08c) e avaliações na página do produto (02).
 *
 *   storeOrderReviews/{orderId}                 — o que o comprador avaliou (privado, só o dono lê).
 *   storeShowcase/{productId}/reviews/{id}      — espelho público de cada avaliação visível.
 *   storeProductRatings/{productId}             — agregado do produto, copiado pro espelho dele.
 *
 * Só pedido entregue/retirado, só o dono, uma avaliação por produto do pedido. Regras em
 * `docs/business-rules/loja-avaliacoes.md`. Aqui ficam as regras puras, sem banco, para teste
 * direto; a escrita está em `store-reviews-write.ts`.
 */
type Data = Record<string, unknown>;

export const ORDER_REVIEWS = "storeOrderReviews";
export const PRODUCT_RATINGS = "storeProductRatings";
/** Subcoleção de `storeShowcase/{productId}`. */
export const PUBLIC_REVIEWS = "reviews";
/** Onde o atleta sobe a foto. A rule do Storage só deixa o dono escrever (e ler) aqui. */
export const REVIEW_UPLOAD_PREFIX = "store/review-uploads";
/** Cópia pública, sem o uid no caminho (avaliação anônima continua anônima). */
export const REVIEW_PUBLIC_PREFIX = "store/reviews";

/** Ordem dos chips no formulário. Web e app guardam os rótulos — mudar os três. */
export const REVIEW_TAGS = ["qualidade", "conforto", "tamanho", "foto", "custo", "durabilidade"] as const;
export type ReviewTag = typeof REVIEW_TAGS[number];
export const REVIEW_FITS = ["pequeno", "certo", "grande"] as const;
export type ReviewFit = typeof REVIEW_FITS[number];

export const MAX_REVIEW_COMMENT = 500;
export const MAX_REVIEW_PHOTOS = 3;
export const MAX_REVIEW_PHOTO_BYTES = 10 * 1024 * 1024;
export const REVIEW_PHOTO_TYPES: Record<string, string> = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"};
export const REVIEW_EDIT_DAYS = 30;
/** Entregue em casa ou retirado na arena. */
export const REVIEWABLE_STATUSES: ReadonlySet<string> = new Set(["ent", "rtd"]);
export const ANONYMOUS_AUTHOR = {name: "Atleta NexaGO", initials: "··"};

export interface ReviewItemInput {
  productId: string;
  rating: number;
  tags: ReviewTag[];
  fit: ReviewFit | null;
  comment: string;
  /** Caminhos no Storage (`store/review-uploads/{uid}/…`); o da foto que já estava continua. */
  photos: string[];
}

export interface ReviewInput {
  orderId: string;
  anonymous: boolean;
  items: ReviewItemInput[];
  pickupRating: number | null;
}

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isRating(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5;
}

/** Normaliza o pedido do cliente. `fields` não vazio = recusar com esses campos. */
export function parseReviewInput(raw: unknown): {input: ReviewInput; fields: string[]} {
  const data = (raw ?? {}) as Data;
  const fields: string[] = [];
  const orderId = str(data["orderId"]);
  if (!ID_RE.test(orderId)) fields.push("orderId");

  const rawItems = Array.isArray(data["items"]) ? (data["items"] as Data[]) : [];
  const seen = new Set<string>();
  const items: ReviewItemInput[] = [];
  for (const it of rawItems) {
    const productId = str(it?.["productId"]);
    if (!ID_RE.test(productId) || seen.has(productId)) {
      fields.push("items");
      continue;
    }
    seen.add(productId);
    if (!isRating(it["rating"])) fields.push(`items.${productId}.rating`);
    const tags = Array.isArray(it["tags"]) ? [...new Set(it["tags"] as unknown[])] : [];
    if (tags.some((t) => !(REVIEW_TAGS as readonly unknown[]).includes(t))) fields.push(`items.${productId}.tags`);
    const fitRaw = it["fit"] ?? null;
    if (fitRaw !== null && !(REVIEW_FITS as readonly unknown[]).includes(fitRaw)) fields.push(`items.${productId}.fit`);
    const comment = str(it["comment"]);
    if (comment.length > MAX_REVIEW_COMMENT) fields.push(`items.${productId}.comment`);
    const photos = Array.isArray(it["photos"]) ? [...new Set((it["photos"] as unknown[]).map(str))] : [];
    if (photos.length > MAX_REVIEW_PHOTOS || photos.some((p) => p === "" || p.includes(".."))) {
      fields.push(`items.${productId}.photos`);
    }
    items.push({
      productId,
      rating: it["rating"] as number,
      tags: REVIEW_TAGS.filter((t) => tags.includes(t)),
      fit: (fitRaw as ReviewFit | null),
      comment,
      photos,
    });
  }
  if (items.length === 0) fields.push("items");

  const pickupRaw = data["pickupRating"] ?? null;
  if (pickupRaw !== null && !isRating(pickupRaw)) fields.push("pickupRating");

  return {
    input: {orderId, anonymous: data["anonymous"] === true, items, pickupRating: pickupRaw as number | null},
    fields: [...new Set(fields)].sort(),
  };
}

/** "tamanho" sem acento e caixa — a mesma conta do portal (`normalizeSearch(axis.label)`). */
export function isSizeAxis(axis: {label?: unknown} | null | undefined): boolean {
  return str(axis?.label).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() === "tamanho";
}

/** Valor do eixo Tamanho no SKU comprado (`"m"`); `null` = produto sem tamanho. */
export function sizeValueOf(axes: unknown, axisValues: unknown): string | null {
  const list = Array.isArray(axes) ? (axes as {id?: unknown; label?: unknown}[]) : [];
  const axis = list.find(isSizeAxis);
  if (!axis) return null;
  const value = str(((axisValues ?? {}) as Data)[str(axis.id)]);
  return value || null;
}

export function hasSizeAxis(axes: unknown): boolean {
  return Array.isArray(axes) && (axes as {label?: unknown}[]).some(isSizeAxis);
}

/** "Rafaela Moreira Souza" → {name: "Rafaela S.", initials: "RS"}. Nome vazio vira o anônimo. */
export function reviewAuthor(fullName: unknown, anonymous: boolean): {name: string; initials: string} {
  const parts = str(fullName).split(/\s+/).filter(Boolean);
  if (anonymous || parts.length === 0) return {...ANONYMOUS_AUTHOR};
  const first = parts[0];
  const firstName = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  if (parts.length === 1) return {name: firstName, initials: first.charAt(0).toUpperCase()};
  const last = parts[parts.length - 1].charAt(0).toUpperCase();
  return {name: `${firstName} ${last}.`, initials: `${first.charAt(0).toUpperCase()}${last}`};
}

export function editableUntil(createdAt: Date): Date {
  return new Date(createdAt.getTime() + REVIEW_EDIT_DAYS * 86_400_000);
}

/** O que a página do produto mostra de uma avaliação — sem uid, pedido nem caminho de upload. */
export function buildPublicReview(review: Data, item: Data): Data {
  const photos = Array.isArray(item["photos"]) ? (item["photos"] as Data[]) : [];
  return {
    rating: item["rating"],
    tags: Array.isArray(item["tags"]) ? item["tags"] : [],
    fit: item["fit"] ?? null,
    comment: str(item["comment"]),
    photos: photos.map((p) => str(p?.["url"])).filter(Boolean),
    variantLabel: str(item["variantLabel"]),
    sizeValueId: item["sizeValueId"] ?? null,
    authorName: str(review["authorName"]) || ANONYMOUS_AUTHOR.name,
    authorInitials: str(review["authorInitials"]) || ANONYMOUS_AUTHOR.initials,
    createdAt: item["createdAt"] ?? null,
    updatedAt: item["updatedAt"] ?? null,
  };
}

export interface RatingStats {
  count: number;
  sum: number;
  /** Índice 0 = 1 estrela … 4 = 5 estrelas. */
  dist: [number, number, number, number, number];
  /** Nota 4 ou 5 — o "X% recomendam". */
  recommend: number;
  withPhotos: number;
  fit: Record<ReviewFit, number>;
}

/** Agregado a partir dos espelhos públicos (só o que está visível conta). */
export function computeRatingStats(reviews: Data[]): RatingStats {
  const stats: RatingStats = {
    count: 0, sum: 0, dist: [0, 0, 0, 0, 0], recommend: 0, withPhotos: 0, fit: {pequeno: 0, certo: 0, grande: 0},
  };
  for (const r of reviews) {
    const rating = r["rating"];
    if (!isRating(rating)) continue;
    stats.count += 1;
    stats.sum += rating;
    stats.dist[rating - 1] += 1;
    if (rating >= 4) stats.recommend += 1;
    if (Array.isArray(r["photos"]) && r["photos"].length > 0) stats.withPhotos += 1;
    const fit = r["fit"];
    if ((REVIEW_FITS as readonly unknown[]).includes(fit)) stats.fit[fit as ReviewFit] += 1;
  }
  return stats;
}

/** Média em 2 casas; `null` sem avaliação. */
export function ratingAverage(stats: Pick<RatingStats, "count" | "sum">): number | null {
  return stats.count > 0 ? Math.round((stats.sum / stats.count) * 100) / 100 : null;
}

/** Agregado guardado → campos do espelho do produto. Doc ausente/antigo = sem avaliação. */
export function showcaseRatingFields(raw: Data | null): {
  ratingAvg: number | null;
  ratingCount: number;
  reviewStats: Omit<RatingStats, "count" | "sum">;
} {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  const distRaw = Array.isArray(raw?.["dist"]) ? (raw!["dist"] as unknown[]) : [];
  const fitRaw = (raw?.["fit"] ?? {}) as Data;
  const count = n(raw?.["count"]);
  return {
    ratingAvg: ratingAverage({count, sum: n(raw?.["sum"])}),
    ratingCount: count,
    reviewStats: {
      dist: [0, 1, 2, 3, 4].map((i) => n(distRaw[i])) as RatingStats["dist"],
      recommend: n(raw?.["recommend"]),
      withPhotos: n(raw?.["withPhotos"]),
      fit: {pequeno: n(fitRaw["pequeno"]), certo: n(fitRaw["certo"]), grande: n(fitRaw["grande"])},
    },
  };
}
