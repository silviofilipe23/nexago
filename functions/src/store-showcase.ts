/**
 * Vitrine da Loja (tela 01, portal do atleta + app): o que o atleta pode ler.
 *
 *   storeShowcase/{productId}  — espelho público de cada produto à venda.
 *   storePublic/showcase       — banners, benefícios, categorias, coleções e arenas de retirada.
 *
 * `storeProducts`, `storeConfig` e `storePickupPoints` seguem só do backoffice: rule não esconde
 * campo, e eles guardam autor da edição, estoque por local, comissão da arena. O espelho leva só
 * o que a vitrine mostra, e é recalculado pelos gatilhos de `store-showcase-sync.ts` a cada
 * escrita da fonte. Aqui ficam as regras, sem banco, para teste direto.
 */
import {badgeIsVisible, type Axis, type ProductBadge} from "./store-catalog";
import {withDiscountDefaults} from "./store-coupons";
import {withReturnsDefaults} from "./store-returns";

export const SHOWCASE_PRODUCTS = "storeShowcase";
export const STORE_PUBLIC = "storePublic";
export const SHOWCASE_CONFIG_ID = "showcase";
/** Banners de campanha. Sem tela no backoffice ainda: `scripts/seed-store-campaigns.js`. */
export const CAMPAIGNS_CONFIG_ID = "campaigns";

/** Ordem dos chips. Espelha `PRODUCT_CATEGORY_LABELS` do backoffice — mudar os dois. */
export const STORE_CATEGORIES: ReadonlyArray<{id: string; label: string}> = [
  {id: "bolas", label: "Bolas"},
  {id: "vestuario", label: "Vestuário"},
  {id: "acessorios", label: "Acessórios"},
  {id: "rede-quadra", label: "Rede & quadra"},
  {id: "kits", label: "Kits"},
];

/** Espelha `PRODUCT_COLLECTIONS` do backoffice — mudar os dois. */
export const STORE_COLLECTIONS: ReadonlyArray<{id: string; label: string}> = [
  {id: "verao-2026", label: "Verão 2026"},
  {id: "linha-pro", label: "Linha Pro"},
];

/** Sem ponto de retirada ativo não há prazo a prometer; com eles, vale o mais lento. */
const DEFAULT_PICKUP_READY_HOURS = 48;

type Data = Record<string, unknown>;

export interface ShowcaseVariant {
  /** Id do doc do SKU (`branco_m`, `unico`). */
  id: string;
  /** Eixo → valor (`{cor: "branco", tam: "m"}`); vazio no produto sem variação. */
  values: Record<string, string>;
  priceCents: number;
  /** Booleano de propósito: o saldo de cada peça não é da conta do público. */
  inStock: boolean;
}

export interface ShowcaseProduct {
  name: string;
  slug: string;
  category: string;
  collection: string | null;
  brand: string;
  /** Já filtrado pela validade: "nova" vencida chega `null`. */
  badge: ProductBadge | null;
  /** Quando o selo "nova" deixa de valer; `null` = não vence (ou não há selo). */
  badgeExpiresAt: Date | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  /** Menor e maior preço entre as variações à venda (todas, se nenhuma tiver saldo). */
  minPriceCents: number;
  maxPriceCents: number;
  coverUrl: string | null;
  channels: {app: boolean; web: boolean};
  pickup: boolean;
  delivery: boolean;
  axes: Axis[];
  variants: ShowcaseVariant[];
  soldOut: boolean;
  customizable: boolean;
  /** Avaliações ainda não existem: chegam `null`/0 e a vitrine esconde a nota. */
  ratingAvg: number | null;
  ratingCount: number;
  /** Unidades vendidas nos últimos 30 dias — a ordem "Mais vendidos". */
  soldLast30: number;
  publishedAt: Date;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function count(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  const ts = v as {toDate?: () => Date} | null | undefined;
  return typeof ts?.toDate === "function" ? ts.toDate() : null;
}

function sumValues(v: unknown): number {
  if (v == null || typeof v !== "object") return 0;
  return Object.values(v as Record<string, unknown>).reduce<number>((total, n) => total + count(n), 0);
}

const NEW_BADGE_MS = 30 * 86_400_000;

/**
 * Produto da fonte → espelho da vitrine. `null` = não está à venda e o espelho deve sumir:
 * rascunho, arquivado, pausado, sem canal ou sem SKU.
 */
export function buildShowcaseProduct(
  product: Data | null,
  skus: {id: string; data: Data}[],
  customization: Data | null,
  now: Date,
): ShowcaseProduct | null {
  if (product === null) return null;
  if (product["status"] !== "ativo" || product["active"] !== true) return null;
  const channelsRaw = (product["channels"] ?? {}) as Data;
  const channels = {app: channelsRaw["app"] === true, web: channelsRaw["web"] === true};
  if (!channels.app && !channels.web) return null;
  if (skus.length === 0) return null;

  const priceCents = count(product["priceCents"]);
  const axes = Array.isArray(product["axes"]) ? (product["axes"] as Axis[]) : [];
  const variants: ShowcaseVariant[] = skus
    .map(({id, data}) => {
      const own = data["priceCents"];
      const available = sumValues(data["stockByLocation"]) - sumValues(data["reservedByLocation"]);
      return {
        id,
        values: (data["axisValues"] ?? {}) as Record<string, string>,
        priceCents: typeof own === "number" && own > 0 ? own : priceCents,
        inStock: available > 0,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const forSale = variants.some((v) => v.inStock) ? variants.filter((v) => v.inStock) : variants;
  const prices = forSale.map((v) => v.priceCents);

  const rawBadge = (product["badge"] ?? null) as ProductBadge | null;
  const publishedAt = toDate(product["publishedAt"]) ?? now;
  const badge = badgeIsVisible(rawBadge, publishedAt, now) ? rawBadge : null;
  const compareAt = count(product["compareAtPriceCents"]);
  const photos = Array.isArray(product["photos"]) ? (product["photos"] as Data[]) : [];
  const cover = photos.map((p) => str(p?.["url"])).find((url) => url !== "") ?? null;
  const fulfillment = (product["fulfillment"] ?? {}) as Data;
  const rating = product["ratingAvg"];

  return {
    name: str(product["name"]),
    slug: str(product["slug"]),
    category: str(product["category"]),
    collection: str(product["collection"]) || null,
    brand: str(product["brand"]) || "NexaGO",
    badge,
    badgeExpiresAt: badge === "nova" ? new Date(publishedAt.getTime() + NEW_BADGE_MS) : null,
    priceCents,
    compareAtPriceCents: compareAt > priceCents ? compareAt : null,
    minPriceCents: Math.min(...prices),
    maxPriceCents: Math.max(...prices),
    coverUrl: cover,
    channels,
    pickup: fulfillment["pickup"] === true,
    delivery: fulfillment["delivery"] === true,
    axes,
    variants,
    soldOut: !variants.some((v) => v.inStock),
    customizable: customization?.["active"] === true,
    ratingAvg: typeof rating === "number" && Number.isFinite(rating) ? rating : null,
    ratingCount: count(product["ratingCount"]),
    soldLast30: count(product["soldLast30"]),
    publishedAt,
  };
}

/**
 * Preço no Pix em centavos, arredondado ao centavo mais próximo (meio centavo sobe).
 * Web, app e o futuro checkout usam a mesma conta — mudar aqui é mudar nos três.
 */
export function pixPriceCents(priceCents: number, discountPct: number): number {
  return Math.round((priceCents * (100 - discountPct)) / 100);
}

export interface ShowcaseBanner {
  id: string;
  kicker: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  /** CTA principal: abre a vitrine filtrada pela coleção. */
  primary: {label: string; collectionId: string};
  /** CTA secundário (só web): categoria ou link. */
  secondary: {label: string; categoryId: string | null; url: string | null} | null;
  /** Datas civis de São Paulo (YYYY-MM-DD), inclusivas. O cliente filtra pelo dia de hoje. */
  startDate: string | null;
  endDate: string | null;
}

export interface ShowcasePickupArena {
  arenaId: string;
  name: string;
  address: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  readyHours: number;
}

export interface ShowcaseConfig {
  banners: ShowcaseBanner[];
  benefits: {
    /** `null` = desconto do Pix desligado: some o card e o "no Pix" dos preços. */
    pixDiscountPct: number | null;
    /** `null` = nenhum ponto de retirada ativo: some o card. */
    pickupReadyHours: number | null;
    exchangeDays: number;
  };
  categories: {id: string; label: string}[];
  collections: {id: string; label: string}[];
  pickupArenas: ShowcasePickupArena[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TITLE_MAX = 50;
const SUBTITLE_MAX = 90;

function civilDate(v: unknown): string | null {
  const s = str(v);
  return DATE_RE.test(s) ? s : null;
}

/** Banner incompleto é descartado em vez de ir pela metade para a vitrine. */
export function bannerFromData(raw: Data): ShowcaseBanner | null {
  if (raw["active"] === false) return null;
  const id = str(raw["id"]);
  const title = str(raw["title"]);
  const primary = (raw["primary"] ?? {}) as Data;
  const collectionId = str(primary["collectionId"]);
  if (!id || !title || !collectionId) return null;
  const secondaryRaw = raw["secondary"] as Data | null | undefined;
  const secondaryLabel = str(secondaryRaw?.["label"]);
  const secondary = secondaryRaw && secondaryLabel ?
    {
      label: secondaryLabel,
      categoryId: str(secondaryRaw["categoryId"]) || null,
      url: str(secondaryRaw["url"]) || null,
    } :
    null;
  return {
    id,
    kicker: str(raw["kicker"]),
    title: title.slice(0, TITLE_MAX),
    subtitle: str(raw["subtitle"]).slice(0, SUBTITLE_MAX),
    imageUrl: str(raw["imageUrl"]) || null,
    primary: {label: str(primary["label"]) || "Ver coleção", collectionId},
    secondary: secondary && (secondary.categoryId || secondary.url) ? secondary : null,
    startDate: civilDate(raw["startDate"]),
    endDate: civilDate(raw["endDate"]),
  };
}

function coordinate(arena: Data | null, axis: "latitude" | "longitude"): number | null {
  if (arena === null) return null;
  const geo = (arena["location"] ?? arena["geo"] ?? arena["coordinates"]) as Data | undefined;
  const fromGeo = geo?.[axis] ?? geo?.[axis === "latitude" ? "_latitude" : "_longitude"];
  const value = typeof fromGeo === "number" ? fromGeo : arena[axis];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildShowcaseConfig(input: {
  discounts: Data | null;
  returns: Data | null;
  campaigns: Data | null;
  pickupPoints: {arenaId: string; data: Data}[];
  arenas: Map<string, Data>;
}): ShowcaseConfig {
  const pix = withDiscountDefaults(input.discounts ?? undefined).find((d) => d.id === "pix");
  const pixPct = pix?.active === true && typeof pix.percent === "number" && pix.percent > 0 ? pix.percent : null;

  const windowDays = withReturnsDefaults(input.returns ?? undefined).windowDays;

  const pickupArenas = input.pickupPoints
    .filter((p) => p.data["active"] === true)
    .map(({arenaId, data}): ShowcasePickupArena => {
      const arena = input.arenas.get(arenaId) ?? null;
      return {
        arenaId,
        name: str(data["name"]) || str(arena?.["name"]) || arenaId,
        address: str(data["address"]) || str(arena?.["address"]),
        city: str(data["city"]) || str(arena?.["city"]),
        state: str(data["state"]) || str(arena?.["state"]),
        latitude: coordinate(arena, "latitude"),
        longitude: coordinate(arena, "longitude"),
        readyHours: count(data["restockHours"]) || DEFAULT_PICKUP_READY_HOURS,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const rawBanners = Array.isArray(input.campaigns?.["banners"]) ? (input.campaigns!["banners"] as Data[]) : [];
  const banners = rawBanners
    .map((b) => (b && typeof b === "object" ? bannerFromData(b) : null))
    .filter((b): b is ShowcaseBanner => b !== null);

  return {
    banners,
    benefits: {
      pixDiscountPct: pixPct,
      pickupReadyHours: pickupArenas.length > 0 ? Math.max(...pickupArenas.map((a) => a.readyHours)) : null,
      exchangeDays: windowDays,
    },
    categories: STORE_CATEGORIES.map((c) => ({...c})),
    collections: STORE_COLLECTIONS.map((c) => ({...c})),
    pickupArenas,
  };
}
