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
import {withCustomizationDefaults} from "./store-custom";
import {withShippingDefaults} from "./store-pickup";
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

/** Teto de unidades de um SKU por compra (página do produto). Acima disso o saldo não é exposto. */
export const MAX_QTY_PER_ITEM = 10;

/** Mesmo teto do backoffice (`MAX_PHOTOS_PER_PRODUCT`). */
const MAX_SHOWCASE_PHOTOS = 10;

type Data = Record<string, unknown>;

export interface ShowcaseVariant {
  /** Id do doc do SKU (`branco_m`, `unico`). */
  id: string;
  /** Eixo → valor (`{cor: "branco", tam: "m"}`); vazio no produto sem variação. */
  values: Record<string, string>;
  priceCents: number;
  inStock: boolean;
  /**
   * Quanto cabe numa compra: o saldo livre, até [MAX_QTY_PER_ITEM]; 0 = esgotado. O saldo de
   * verdade não é da conta do público — acima do teto ele só sabe que "tem".
   */
  maxQty: number;
  /** Saldo livre no alerta de estoque baixo do produto: "Só 2 no tamanho M". */
  lowStock: boolean;
}

/** Foto da galeria, na ordem do backoffice (a primeira é a capa). */
export interface ShowcasePhoto {
  url: string;
  /** Valor do primeiro eixo (cor) a que a foto pertence; `null` = vale para todas. */
  colorValueId: string | null;
}

/** "Tecido · Poliamida dry com elastano". */
export interface ShowcaseDetail {
  label: string;
  value: string;
}

/** O pedaço público da personalização (o resto — fontes, áreas, gráfica — é do backoffice). */
export interface ShowcaseCustomization {
  /** Menor preço entre as opções ligadas: "+ personalização a partir de R$ 14,90". 0 = nenhuma. */
  fromCents: number;
  /** Dias úteis de produção — somam ao prazo de retirada/entrega. */
  leadDays: number;
  /** Peça personalizada só troca por defeito. */
  defectOnlyReturns: boolean;
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
  photos: ShowcasePhoto[];
  description: string;
  details: ShowcaseDetail[];
  channels: {app: boolean; web: boolean};
  pickup: boolean;
  delivery: boolean;
  axes: Axis[];
  variants: ShowcaseVariant[];
  soldOut: boolean;
  customizable: boolean;
  /** Só com a personalização ativa. */
  customization: ShowcaseCustomization | null;
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

function photosOf(raw: unknown): ShowcasePhoto[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Data[])
    .map((p) => ({url: str(p?.["url"]), colorValueId: str(p?.["colorValueId"]) || null}))
    .filter((p) => p.url !== "")
    .slice(0, MAX_SHOWCASE_PHOTOS);
}

function detailsOf(raw: unknown): ShowcaseDetail[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Data[])
    .map((d) => ({label: str(d?.["label"]), value: str(d?.["value"])}))
    .filter((d) => d.label !== "" && d.value !== "");
}

/** Preço "a partir de": a opção mais barata entre nome e imagem; costas sozinhas só sem as duas. */
export function customizationSummary(raw: Data | null): ShowcaseCustomization | null {
  if (raw?.["active"] !== true) return null;
  const c = withCustomizationDefaults(raw);
  const options = [
    c.name.enabled ? c.price.nameOnlyCents : null,
    c.image.enabled ? c.price.imageOnlyCents : null,
  ].filter((n): n is number => n !== null && n > 0);
  if (options.length === 0 && c.back.enabled && c.price.backCents > 0) options.push(c.price.backCents);
  return {
    fromCents: options.length > 0 ? Math.min(...options) : 0,
    leadDays: count(c.production.leadDays),
    defectOnlyReturns: c.defectOnlyReturns === true,
  };
}

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
  const lowStockThreshold = count(product["lowStockThreshold"]);
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
        maxQty: Math.max(0, Math.min(available, MAX_QTY_PER_ITEM)),
        lowStock: available > 0 && available <= lowStockThreshold,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const forSale = variants.some((v) => v.inStock) ? variants.filter((v) => v.inStock) : variants;
  const prices = forSale.map((v) => v.priceCents);

  const rawBadge = (product["badge"] ?? null) as ProductBadge | null;
  const publishedAt = toDate(product["publishedAt"]) ?? now;
  const badge = badgeIsVisible(rawBadge, publishedAt, now) ? rawBadge : null;
  const compareAt = count(product["compareAtPriceCents"]);
  const photos = photosOf(product["photos"]);
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
    coverUrl: photos[0]?.url ?? null,
    photos,
    description: str(product["description"]),
    details: detailsOf(product["technicalDetails"]),
    channels,
    pickup: fulfillment["pickup"] === true,
    delivery: fulfillment["delivery"] === true,
    axes,
    variants,
    soldOut: !variants.some((v) => v.inStock),
    customizable: customization?.["active"] === true,
    customization: customizationSummary(customization),
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

export interface ShowcaseDeliveryMode {
  id: string;
  name: string;
  /** Texto do backoffice com prazo e transportadora ("Loggi · Goiânia e região em 24 h"). */
  description: string;
  /** `null` = calculado no checkout (só com a integração de frete ligada). */
  priceCents: number | null;
}

export interface ShowcaseDelivery {
  /** Pedido a partir daqui não paga frete; `null` = sem frete grátis. */
  freeAboveCents: number | null;
  /** Só as modalidades que o checkout aceita hoje — vazio = sem entrega. */
  modes: ShowcaseDeliveryMode[];
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
  delivery: ShowcaseDelivery;
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

/**
 * A modalidade "calculada" só vale com a integração de frete ligada (o checkout recusa sem ela);
 * as de preço fixo valem com preço.
 */
export function buildShowcaseDelivery(shipping: Data | null): ShowcaseDelivery {
  const config = withShippingDefaults(shipping ?? undefined);
  const modes = config.modes
    .filter((m) => m.active === true)
    .map((m): ShowcaseDeliveryMode | null => {
      if (m.priceType === "calculado") {
        return config.melhorEnvioConnected === true ?
          {id: m.id, name: str(m.name), description: str(m.description), priceCents: null} :
          null;
      }
      const price = count(m.priceCents);
      return price > 0 ? {id: m.id, name: str(m.name), description: str(m.description), priceCents: price} : null;
    })
    .filter((m): m is ShowcaseDeliveryMode => m !== null);
  return {freeAboveCents: count(config.freeShippingAboveCents) || null, modes};
}

export function buildShowcaseConfig(input: {
  discounts: Data | null;
  returns: Data | null;
  campaigns: Data | null;
  /** `storeConfig/shipping`; omitido = padrão. */
  shipping?: Data | null;
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
    delivery: buildShowcaseDelivery(input.shipping ?? null),
  };
}
