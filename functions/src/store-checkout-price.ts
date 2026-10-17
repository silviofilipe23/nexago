/**
 * Loja · checkout: o preço do carrinho calculado no SERVIDOR (telas web 03/04, app 03/04/06).
 *
 * O carrinho (`storeCarts/{uid}`) é gravável pelo dono e só diz "o que" ele quer: preço, canal,
 * entrega, personalização e cupom são relidos aqui a partir das coleções do backoffice. Tudo
 * puro — quem carrega os docs é `store-checkout.ts`. Contrato em `docs/business-rules/loja-checkout.md`.
 */
import {MAX_QTY_PER_ITEM, variantLabelOf, type Axis} from "./store-catalog";
import {customExtraCents, publicCustomization} from "./store-custom-cart";
import {availableAt} from "./store-stock";
import {MAIN_LOCATION} from "./store-orders";
import type {AutoDiscount} from "./store-coupons";
import type {ShippingConfig} from "./store-pickup";

type Data = Record<string, unknown>;

export type CheckoutChannel = "web" | "app_ios" | "app_android";

export type CheckoutDelivery =
  | {type: "arena"; arenaId: string}
  | {type: "casa"; addressId: string; modeId: string};

/** Linha do carrinho como o dono gravou (comum ou personalizada). */
export interface CartLine {
  productId: string;
  skuId: string;
  qty: number;
  lineId?: string;
  customization?: Data;
}

export interface CatalogProduct {
  data: Data;
  skus: Map<string, Data>;
  /** `storeProductCustomization/{id}` (ou null). */
  customization: Data | null;
}

export interface CheckoutAddress {
  id: string;
  label: string;
  recipient: string;
  phone: string;
  zip: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  uf: string;
}

export interface PickupPoint {
  arenaId: string;
  name: string;
  active: boolean;
  locationId: string | null;
}

export interface CouponDoc {
  id: string;
  data: Data;
  /** O atleta já usou (marcador `storeCouponUses/{couponId}_{uid}`). */
  usedByAthlete: boolean;
}

export interface CheckoutSnapshot {
  cart: CartLine[];
  catalog: Map<string, CatalogProduct>;
  discounts: AutoDiscount[];
  shipping: ShippingConfig;
  pickupPoint: PickupPoint | null;
  address: CheckoutAddress | null;
  coupon: CouponDoc | null;
}

export type LineProblem = "indisponivel" | "esgotado" | "sem_retirada" | "sem_entrega" | "personalizacao_off";

export interface QuoteLine {
  key: string;
  productId: string;
  skuId: string;
  qty: number;
  name: string;
  variantLabel: string;
  imageUrl: string | null;
  category: string;
  collection: string | null;
  /** Preço do SKU (sem o adicional). */
  baseCents: number;
  /** Adicional da personalização por unidade (0 na linha comum). */
  extraCents: number;
  unitCents: number;
  totalCents: number;
  personalized: boolean;
  /** Resumo da personalização para o pedido (nome ou "Imagem"). */
  customizationLabel: string | null;
  problem: LineProblem | null;
}

export type CouponProblem =
  | "nao_existe"
  | "encerrado"
  | "pausado"
  | "agendado"
  | "so_app"
  | "fora_do_escopo"
  | "minimo"
  | "esgotado"
  | "ja_usado";

export interface QuoteCoupon {
  id: string | null;
  code: string;
  discountCents: number;
  stacksWithPix: boolean;
  problem: CouponProblem | null;
  /** Texto pronto pro atleta quando há problema. */
  message: string | null;
}

export type QuoteProblem = "carrinho_vazio" | "entrega_faltando" | "arena_indisponivel" | "endereco_faltando" |
  "modalidade_indisponivel" | "linha_com_problema";

export interface Quote {
  lines: QuoteLine[];
  units: number;
  subtotalCents: number;
  coupon: QuoteCoupon | null;
  pixDiscountPct: number | null;
  pixDiscountCents: number;
  shippingCents: number;
  /** Frete grátis alcançado (casa). */
  freeShipping: boolean;
  totalCents: number;
  problems: QuoteProblem[];
}

const COUPON_MESSAGES: Record<CouponProblem, string> = {
  nao_existe: "Cupom não encontrado",
  encerrado: "Esse cupom já foi encerrado",
  pausado: "Esse cupom está pausado",
  agendado: "Esse cupom ainda não começou",
  so_app: "Esse cupom vale só no app",
  fora_do_escopo: "Esse cupom não vale para os itens do carrinho",
  minimo: "Falta pouco para o valor mínimo do cupom",
  esgotado: "Esse cupom chegou ao limite de usos",
  ja_usado: "Você já usou esse cupom",
};

export function couponMessage(problem: CouponProblem, minCents?: number | null): string {
  if (problem === "minimo" && minCents) return `Cupom vale a partir de ${brl(minCents)} em produtos`;
  return COUPON_MESSAGES[problem];
}

function brl(cents: number): string {
  const reais = cents / 100;
  return Number.isInteger(reais) ?
    `R$ ${reais.toLocaleString("pt-BR")}` :
    `R$ ${reais.toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function cents(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

/** "web" ou "app" — o canal do produto (`channels.web` / `channels.app`). */
export function channelKind(channel: CheckoutChannel): "web" | "app" {
  return channel === "web" ? "web" : "app";
}

/** `YYYY-MM-DD` em São Paulo: as datas de cupom são civis de lá. */
export function saoPauloDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {timeZone: "America/Sao_Paulo"}).format(now);
}

/** Igual ao `pixPriceCents` da vitrine: o desconto é o que sobra do arredondamento. */
export function pixDiscountOf(baseCents: number, pct: number | null): number {
  if (!pct || pct <= 0 || baseCents <= 0) return 0;
  return baseCents - Math.round((baseCents * (100 - pct)) / 100);
}

export function pixPercent(discounts: AutoDiscount[]): number | null {
  const pix = discounts.find((d) => d.id === "pix");
  return pix?.active && pix.percent && pix.percent > 0 ? pix.percent : null;
}

/** Disponível para a linha: a arena da retirada sozinha ou o CD (a reserva não divide). */
function availableFor(sku: Data, arenaLocation: string | null): number {
  const s = sku as {stockByLocation?: Record<string, number>; reservedByLocation?: Record<string, number>};
  const cd = availableAt(s, MAIN_LOCATION);
  return arenaLocation ? Math.max(cd, availableAt(s, arenaLocation)) : cd;
}

function priceLine(
  line: CartLine,
  catalog: Map<string, CatalogProduct>,
  channel: CheckoutChannel,
  delivery: CheckoutDelivery | null,
  arenaLocation: string | null,
): QuoteLine {
  const entry = catalog.get(line.productId);
  const p = entry?.data ?? {};
  const sku = entry?.skus.get(line.skuId) ?? null;
  const qty = Math.min(Math.max(1, Math.floor(line.qty)), MAX_QTY_PER_ITEM);
  const baseCents = cents(sku?.["priceCents"]) || cents(p["priceCents"]);
  const custom = line.customization ?? null;
  const name = custom?.["name"] as Data | undefined;
  const image = custom?.["image"] as Data | undefined;
  const personalized = custom !== null;

  let extraCents = 0;
  let problem: LineProblem | null = null;
  const channels = (p["channels"] ?? {}) as Data;
  const fulfillment = (p["fulfillment"] ?? {}) as Data;
  if (!entry || !sku || p["status"] !== "ativo" || p["active"] !== true || channels[channelKind(channel)] !== true) {
    problem = "indisponivel";
  } else if (delivery?.type === "arena" && fulfillment["pickup"] !== true) {
    problem = "sem_retirada";
  } else if (delivery?.type === "casa" && fulfillment["delivery"] !== true) {
    problem = "sem_entrega";
  } else if (availableFor(sku, arenaLocation) < qty) {
    problem = "esgotado";
  }
  if (personalized && problem === null) {
    const config = publicCustomization(entry?.customization ?? null);
    const hasName = !!name && config?.name.enabled === true;
    const hasImage = !!image && config?.image.enabled === true;
    if (!config || (!!name && !hasName) || (!!image && !hasImage)) {
      problem = "personalizacao_off";
    } else {
      extraCents = customExtraCents(config.price, hasName, hasImage);
    }
  }

  const unitCents = baseCents + extraCents;
  const photos = (p["photos"] ?? []) as {url?: string}[];
  return {
    key: line.lineId ?? `${line.productId}/${line.skuId}`,
    productId: line.productId,
    skuId: line.skuId,
    qty,
    name: str(p["name"]) || "Produto",
    variantLabel: sku ?
      variantLabelOf((sku["axisValues"] ?? {}) as Record<string, string>, (p["axes"] ?? []) as Axis[]) : "",
    imageUrl: photos[0]?.url ?? (str(p["coverUrl"]) || null),
    category: str(p["category"]),
    collection: str(p["collection"]) || null,
    baseCents,
    extraCents,
    unitCents,
    totalCents: unitCents * qty,
    personalized,
    customizationLabel: personalized ? (str(name?.["text"]) || (image ? "Imagem" : "Personalizada")) : null,
    problem,
  };
}

/**
 * Validação do cupom na ordem da spec 08: existe → status → canal → escopo → mínimo → limite →
 * por atleta. Devolve o desconto sobre os itens do escopo (% com teto, ou fixo até o elegível).
 */
export function priceCoupon(
  code: string,
  coupon: CouponDoc | null,
  lines: QuoteLine[],
  channel: CheckoutChannel,
  delivery: CheckoutDelivery | null,
  now: Date,
): QuoteCoupon {
  const normalized = code.trim().toUpperCase();
  const fail = (problem: CouponProblem, minCents?: number | null): QuoteCoupon => ({
    id: coupon?.id ?? null, code: normalized, discountCents: 0, stacksWithPix: true, problem,
    message: couponMessage(problem, minCents),
  });
  if (!coupon) return fail("nao_existe");
  const c = coupon.data;
  const today = saoPauloDate(now);
  const startDate = str(c["startDate"]);
  const endDate = str(c["endDate"]) || null;
  if (c["endedAt"] || (endDate !== null && endDate < today)) return fail("encerrado");
  if (c["paused"] === true) return fail("pausado");
  if (startDate && startDate > today) return fail("agendado");
  if (c["appOnly"] === true && channel === "web") return fail("so_app");

  const scope = (c["scope"] ?? {}) as {type?: string; ids?: string[]};
  const ids = new Set(Array.isArray(scope.ids) ? scope.ids : []);
  const ok = lines.filter((l) => l.problem === null);
  let eligible: QuoteLine[];
  switch (scope.type) {
  case "store":
    eligible = ok;
    break;
  case "category":
    eligible = ok.filter((l) => ids.has(l.category));
    break;
  case "collection":
    eligible = ok.filter((l) => l.collection !== null && ids.has(l.collection));
    break;
  case "products":
    eligible = ok.filter((l) => ids.has(l.productId));
    break;
  case "arena":
    eligible = delivery?.type === "arena" && ids.has(delivery.arenaId) ? ok : [];
    break;
  default:
    // "tournament" (inscritos de um torneio) ainda não vale na Loja.
    eligible = [];
  }
  const eligibleCents = eligible.reduce((n, l) => n + l.totalCents, 0);
  if (eligibleCents === 0) return fail("fora_do_escopo");

  const subtotal = ok.reduce((n, l) => n + l.totalCents, 0);
  const minCents = cents(c["minOrderCents"]) || null;
  if (minCents !== null && subtotal < minCents) return fail("minimo", minCents);
  const limit = cents(c["usageLimit"]) || null;
  if (limit !== null && cents(c["uses"]) >= limit) return fail("esgotado");
  if (c["onePerAthlete"] === true && coupon.usedByAthlete) return fail("ja_usado");

  const value = cents(c["value"]);
  let discount: number;
  if (c["type"] === "fixed") {
    discount = Math.min(value, eligibleCents);
  } else {
    discount = Math.round((eligibleCents * value) / 100);
    const max = cents(c["maxDiscountCents"]) || null;
    if (max !== null) discount = Math.min(discount, max);
  }
  return {
    id: coupon.id, code: normalized, discountCents: discount, stacksWithPix: c["stacksWithPix"] !== false,
    problem: null, message: null,
  };
}

/** Frete da casa: modo ativo de preço fixo; grátis quando os produtos alcançam o mínimo. */
export function shippingFor(
  shipping: ShippingConfig,
  modeId: string,
  subtotalCents: number,
): {cents: number; free: boolean; modeName: string} | null {
  const mode = shipping.modes.find((m) => m.id === modeId);
  if (!mode || !mode.active || mode.priceType !== "fixo" || !mode.priceCents) return null;
  const freeAbove = shipping.freeShippingAboveCents;
  const free = typeof freeAbove === "number" && freeAbove > 0 && subtotalCents >= freeAbove;
  return {cents: free ? 0 : mode.priceCents, free, modeName: mode.name};
}

/**
 * O preço do checkout. Pagamento em Pix: o desconto Pix vale sobre (produtos − cupom), a não ser
 * que o cupom não acumule com Pix. Frete por último, fora de qualquer desconto.
 */
export function priceCheckout(
  snap: CheckoutSnapshot,
  input: {channel: CheckoutChannel; delivery: CheckoutDelivery | null; couponCode: string | null},
  now: Date,
): Quote {
  const problems: QuoteProblem[] = [];
  const delivery = input.delivery;
  const arenaLocation = delivery?.type === "arena" && snap.pickupPoint?.active ? snap.pickupPoint.locationId : null;
  const lines = snap.cart.map((l) => priceLine(l, snap.catalog, input.channel, delivery, arenaLocation));
  if (lines.length === 0) problems.push("carrinho_vazio");
  if (lines.some((l) => l.problem !== null)) problems.push("linha_com_problema");

  const okLines = lines.filter((l) => l.problem === null);
  const subtotalCents = okLines.reduce((n, l) => n + l.totalCents, 0);
  const units = okLines.reduce((n, l) => n + l.qty, 0);

  const code = input.couponCode?.trim() ?? "";
  const coupon = code ? priceCoupon(code, snap.coupon, lines, input.channel, delivery, now) : null;
  const couponCents = coupon?.problem === null ? coupon.discountCents : 0;

  const pct = pixPercent(snap.discounts);
  const pixApplies = couponCents === 0 || coupon?.stacksWithPix !== false;
  const pixDiscountCents = pixApplies ? pixDiscountOf(subtotalCents - couponCents, pct) : 0;

  let shippingCents = 0;
  let freeShipping = false;
  if (!delivery) {
    problems.push("entrega_faltando");
  } else if (delivery.type === "arena") {
    if (!snap.pickupPoint?.active || !snap.pickupPoint.locationId) problems.push("arena_indisponivel");
  } else {
    if (!snap.address) problems.push("endereco_faltando");
    const ship = shippingFor(snap.shipping, delivery.modeId, subtotalCents);
    if (!ship) problems.push("modalidade_indisponivel");
    else {
      shippingCents = ship.cents;
      freeShipping = ship.free;
    }
  }

  return {
    lines,
    units,
    subtotalCents,
    coupon,
    pixDiscountPct: pct,
    pixDiscountCents,
    shippingCents,
    freeShipping,
    totalCents: Math.max(0, subtotalCents - couponCents - pixDiscountCents + shippingCents),
    problems,
  };
}

/** "Rua T-37, 1240 · Ap 802 · Setor Bueno" — a linha única que o pedido guarda. */
export function addressLine(a: CheckoutAddress): string {
  return [`${a.street}, ${a.number}`, a.complement, a.district].filter((s) => s.trim() !== "").join(" · ");
}
