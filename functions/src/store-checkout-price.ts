/**
 * Loja · checkout: o preço do carrinho calculado no SERVIDOR (telas web 03/04, app 03/04/06).
 *
 * O carrinho (`storeCarts/{uid}`) é gravável pelo dono e só diz "o que" ele quer: preço, canal,
 * entrega, personalização e cupom são relidos aqui a partir das coleções do backoffice. Tudo
 * puro — quem carrega os docs é `store-checkout.ts`. Contrato em `docs/business-rules/loja-checkout.md`.
 */
import type {ResolvedAttribution} from "./squad-attribution";
import {MAX_QTY_PER_ITEM, variantLabelOf, type Axis} from "./store-catalog";
import {
  CUSTOM_UPLOAD_PREFIX,
  backNumberOk,
  customExtraCents,
  nameProblem,
  normalizeCustomName,
  publicCustomization,
} from "./store-custom-cart";
import {withCustomizationDefaults} from "./store-custom";
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
  /**
   * Marcador `storeCouponUses/{couponId}_{uid}` do cupom "uma vez por atleta": `reservado` num
   * pedido esperando o Pix, `usado` num pedido pago.
   */
  athleteUse: "reservado" | "usado" | null;
  /** Pedidos esperando o Pix com esse cupom (`storeCouponUses/{couponId}.reserved`). */
  reserved: number;
}

/**
 * Indicação de embaixador que vale nesta compra (resolvida no servidor: código digitado ou link),
 * com o % de desconto que o pagador ganha agora (0 = "só na primeira" já usado).
 */
export interface SquadOffer {
  ambassadorId: string;
  ambassadorName: string;
  code: string;
  origin: "code" | "link" | "qr";
  pct: number;
}

export interface CheckoutSnapshot {
  /** O dono do carrinho: a arte da linha personalizada tem de ser dele. */
  uid: string;
  /** Lista de bloqueio dos nomes (a mesma do "Adicionar" personalizado). */
  blockedTerms: string[];
  cart: CartLine[];
  catalog: Map<string, CatalogProduct>;
  discounts: AutoDiscount[];
  shipping: ShippingConfig;
  pickupPoint: PickupPoint | null;
  address: CheckoutAddress | null;
  coupon: CouponDoc | null;
  /** Indicação que vale na Loja; ausente = nenhuma. */
  squad?: SquadOffer | null;
  /** Código de embaixador digitado que não vale aqui (texto pronto para o campo). */
  squadError?: {code: string; message: string} | null;
  /** A atribuição por trás de `squad` (para registrar desconto e comissão no pedido). */
  squadAttribution?: ResolvedAttribution | null;
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
  | "ja_usado"
  | "reservado"
  /** O desconto do embaixador é maior: o cupom fica de fora (não trava o checkout). */
  | "nao_acumula";

export interface QuoteCoupon {
  id: string | null;
  code: string;
  discountCents: number;
  stacksWithPix: boolean;
  problem: CouponProblem | null;
  /** Texto pronto pro atleta quando há problema. */
  message: string | null;
}

/** `cupom_maior`: o cupom da Loja deu mais e o pedido sai sem embaixador; `invalido`: o código não vale. */
export type QuoteSquadReason = "cupom_maior" | "invalido";

export interface QuoteSquad {
  code: string;
  ambassadorName: string | null;
  origin: "code" | "link" | "qr";
  pct: number;
  /** O desconto que o embaixador daria (aplicado ou não). */
  discountCents: number;
  /** O pedido sai com este embaixador (desconto, registro e comissão). */
  applied: boolean;
  reason: QuoteSquadReason | null;
  message: string | null;
}

export type QuoteProblem = "carrinho_vazio" | "entrega_faltando" | "arena_indisponivel" | "endereco_faltando" |
  "modalidade_indisponivel" | "linha_com_problema";

/** Forma de pagamento do checkout. Ausente = Pix (clientes anteriores ao cartão). */
export type CheckoutPaymentMethod = "pix" | "cartao";
export const CHECKOUT_PAYMENT_METHODS: CheckoutPaymentMethod[] = ["pix", "cartao"];

export interface Quote {
  /** A forma que este total cobra. */
  paymentMethod: CheckoutPaymentMethod;
  lines: QuoteLine[];
  units: number;
  subtotalCents: number;
  coupon: QuoteCoupon | null;
  /** Indicação de embaixador desta compra; `null` = nenhuma. */
  squad: QuoteSquad | null;
  /** Desconto do embaixador aplicado neste total (0 quando o cupom vence ou não há). */
  squadDiscountCents: number;
  pixDiscountPct: number | null;
  /** Desconto Pix aplicado NESTE total (0 no cartão). */
  pixDiscountCents: number;
  /** Acréscimo do cartão aplicado neste total (0 no Pix; hoje a Loja absorve a taxa). */
  cardFeeCents: number;
  shippingCents: number;
  /** Frete grátis alcançado (casa). */
  freeShipping: boolean;
  totalCents: number;
  /** Os dois totais, para a tela comparar as formas sem cotar de novo. */
  pixTotalCents: number;
  cardTotalCents: number;
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
  reservado: "Esse cupom está num pedido seu esperando o Pix",
  nao_acumula: "O desconto da indicação é maior que este cupom",
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
/** O Asaas não cobra abaixo disto: o desconto do embaixador nunca deixa os produtos menores. */
const SQUAD_MIN_CHARGE_CENTS = 5_00;

/** % do embaixador sobre os produtos, arredondado, sem deixar os produtos abaixo do mínimo. */
export function squadDiscountOf(productsCents: number, pct: number): number {
  if (!(pct > 0) || !(productsCents > 0)) return 0;
  const raw = Math.round((productsCents * pct) / 100);
  return Math.max(0, Math.min(raw, productsCents - SQUAD_MIN_CHARGE_CENTS));
}

/**
 * Um desconto só por pedido: entre o cupom da Loja (válido) e o embaixador, vale o maior; empate
 * fica com o cupom. Devolve o que entra no total e como cupom/indicação aparecem na cotação.
 */
export function pickPromo(
  coupon: QuoteCoupon | null,
  snap: Pick<CheckoutSnapshot, "squad" | "squadError">,
  productsCents: number,
): {coupon: QuoteCoupon | null; couponCents: number; squad: QuoteSquad | null; squadCents: number} {
  const couponCents = coupon?.problem === null ? coupon.discountCents : 0;
  if (snap.squadError) {
    return {
      coupon, couponCents, squadCents: 0,
      squad: {
        code: snap.squadError.code, ambassadorName: null, origin: "code", pct: 0, discountCents: 0,
        applied: false, reason: "invalido", message: snap.squadError.message,
      },
    };
  }
  const offer = snap.squad;
  if (!offer) return {coupon, couponCents, squad: null, squadCents: 0};
  const squadCents = squadDiscountOf(productsCents, offer.pct);
  const base = {code: offer.code, ambassadorName: offer.ambassadorName, origin: offer.origin, pct: offer.pct, discountCents: squadCents};
  if (couponCents > 0 && squadCents <= couponCents) {
    return {
      coupon, couponCents, squadCents: 0,
      squad: {...base, applied: false, reason: "cupom_maior", message: "O cupom da Loja dá mais desconto que a indicação"},
    };
  }
  const losing = couponCents > 0 && coupon ?
    {...coupon, problem: "nao_acumula" as const, message: `O desconto da indicação de ${offer.ambassadorName} é maior que este cupom`} :
    coupon;
  return {coupon: losing, couponCents: 0, squadCents, squad: {...base, applied: true, reason: null, message: null}};
}

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

/** "ANA · 10", "Imagem", "Nº 10", "Imagem nas costas": o que a linha leva, curto. */
function customLabel(
  name: Data | undefined,
  image: Data | undefined,
  back: Data | undefined,
  areaText?: Data | undefined,
): string {
  const number = back?.["type"] === "numero" ? str(back["number"]) : "";
  const text = str(name?.["text"]);
  if (text) return number ? `${text} · ${number}` : text;
  if (image) return "Imagem";
  const written = str(areaText?.["text"]);
  if (written) return `“${written}”`;
  if (number) return `Nº ${number}`;
  return back ? "Imagem nas costas" : "Personalizada";
}

type StockSku = {stockByLocation?: Record<string, number>; reservedByLocation?: Record<string, number>};

/**
 * A mesma conta da reserva do `createOrderCore`: tudo na arena da retirada quando ela cobre o
 * pedido inteiro (o mesmo SKU de linhas diferentes soma), senão tudo no CD. Linha que a reserva
 * recusaria sai "esgotado" já na cotação — antes de cobrar o Pix.
 */
export function markShortStock(
  lines: QuoteLine[],
  catalog: Map<string, CatalogProduct>,
  arenaLocation: string | null,
): QuoteLine[] {
  const key = (l: QuoteLine) => `${l.productId}/${l.skuId}`;
  const sku = (l: QuoteLine) => (catalog.get(l.productId)?.skus.get(l.skuId) ?? {}) as StockSku;
  const need = new Map<string, {qty: number; sku: StockSku}>();
  for (const l of lines) {
    if (l.problem !== null) continue;
    const cur = need.get(key(l));
    need.set(key(l), {qty: (cur?.qty ?? 0) + l.qty, sku: sku(l)});
  }
  const fromArena = arenaLocation !== null &&
    [...need.values()].every((n) => availableAt(n.sku, arenaLocation) >= n.qty);
  const at = fromArena ? arenaLocation! : MAIN_LOCATION;
  return lines.map((l) => {
    const n = need.get(key(l));
    return l.problem === null && n && availableAt(n.sku, at) < n.qty ? {...l, problem: "esgotado" as const} : l;
  });
}

/**
 * A linha personalizada como o dono gravou no carrinho (gravável por ele): o checkout refaz o que
 * o "Adicionar" conferiu — nome na lista de bloqueio, fonte e cor da config, arte dele mesmo.
 */
function customizationValid(
  custom: Data,
  config: NonNullable<ReturnType<typeof publicCustomization>>,
  raw: Data | null,
  uid: string,
  blockedTerms: readonly string[],
): boolean {
  const name = custom["name"] as Data | undefined;
  const image = custom["image"] as Data | undefined;
  if (name) {
    const text = normalizeCustomName(name["text"]);
    const block = withCustomizationDefaults(raw ?? undefined).name.blockOffensive;
    if (nameProblem(text, {maxChars: config.name.maxChars, blockOffensive: block}, blockedTerms) !== null) return false;
    if (!config.name.fonts.includes(str(name["fontId"]) as never)) return false;
    if (!config.name.colors.includes(str(name["color"]).toLowerCase())) return false;
  }
  if (image) {
    const path = str(image["path"]);
    if (!path.startsWith(`${CUSTOM_UPLOAD_PREFIX}/${uid}/`) || path.includes("..")) return false;
    if (!config.image.areas.some((a) => a.id === image["areaId"])) return false;
  }
  const areaText = custom["areaText"] as Data | undefined;
  if (areaText) {
    if (image) return false;
    const area = config.areas.find((a) => a.id === areaText["areaId"] && a.text);
    if (!area) return false;
    const block = withCustomizationDefaults(raw ?? undefined).name.blockOffensive;
    const text = normalizeCustomName(areaText["text"]);
    if (nameProblem(text, {maxChars: area.textMaxChars, blockOffensive: block}, blockedTerms) !== null) return false;
    if (!config.name.fonts.includes(str(areaText["fontId"]) as never)) return false;
    if (!config.name.colors.includes(str(areaText["color"]).toLowerCase())) return false;
  }
  const back = custom["back"] as Data | undefined;
  if (back) {
    if (!config.back.enabled) return false;
    if (back["type"] === "numero") {
      if (!config.back.allowNumber || !backNumberOk(back["number"], config.back.numberMaxDigits)) return false;
    } else if (back["type"] === "imagem") {
      const path = str(back["path"]);
      if (!config.back.allowImage || !path.startsWith(`${CUSTOM_UPLOAD_PREFIX}/${uid}/`) || path.includes("..")) return false;
    } else {
      return false;
    }
  }
  return true;
}

function priceLine(
  line: CartLine,
  catalog: Map<string, CatalogProduct>,
  channel: CheckoutChannel,
  delivery: CheckoutDelivery | null,
  owner: {uid: string; blockedTerms: readonly string[]},
): QuoteLine {
  const entry = catalog.get(line.productId);
  const p = entry?.data ?? {};
  const sku = entry?.skus.get(line.skuId) ?? null;
  const qty = Math.min(Math.max(1, Math.floor(line.qty)), MAX_QTY_PER_ITEM);
  const baseCents = cents(sku?.["priceCents"]) || cents(p["priceCents"]);
  const custom = line.customization ?? null;
  const name = custom?.["name"] as Data | undefined;
  const image = custom?.["image"] as Data | undefined;
  const areaText = custom?.["areaText"] as Data | undefined;
  const back = custom?.["back"] as Data | undefined;
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
  }
  if (personalized && problem === null) {
    const config = publicCustomization(entry?.customization ?? null);
    const hasName = !!name && config?.name.enabled === true;
    const hasImage = !!image && config?.image.enabled === true;
    const hasAreaText = !!areaText && (config?.areas.length ?? 0) > 0;
    if (!config || (!!name && !hasName) || (!!image && !hasImage) || (!!areaText && !hasAreaText) ||
      !customizationValid(custom!, config, entry?.customization ?? null, owner.uid, owner.blockedTerms)) {
      problem = "personalizacao_off";
    } else {
      // Texto na área custa o mesmo que a imagem.
      extraCents = customExtraCents(config.price, hasName, hasImage || hasAreaText, !!back);
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
    customizationLabel: personalized ? customLabel(name, image, back, areaText) : null,
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
  // Pedido esperando o Pix segura o uso: senão N pedidos pendentes furam o limite.
  const limit = cents(c["usageLimit"]) || null;
  if (limit !== null && cents(c["uses"]) + coupon.reserved >= limit) return fail("esgotado");
  if (c["onePerAthlete"] === true && coupon.athleteUse === "usado") return fail("ja_usado");
  if (c["onePerAthlete"] === true && coupon.athleteUse === "reservado") return fail("reservado");

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
 * que o cupom não acumule com Pix. Cartão: sem desconto Pix, mais o acréscimo `cardFeeOf` sobre
 * (produtos − cupom + frete) — hoje zero, a Loja absorve a taxa. Frete fora de qualquer desconto.
 */
export function priceCheckout(
  snap: CheckoutSnapshot,
  input: {
    channel: CheckoutChannel; delivery: CheckoutDelivery | null; couponCode: string | null;
    paymentMethod?: CheckoutPaymentMethod | null;
  },
  now: Date,
  cardFeeOf: (baseCents: number) => number = () => 0,
): Quote {
  const paymentMethod: CheckoutPaymentMethod = input.paymentMethod === "cartao" ? "cartao" : "pix";
  const problems: QuoteProblem[] = [];
  const delivery = input.delivery;
  const arenaLocation = delivery?.type === "arena" && snap.pickupPoint?.active ? snap.pickupPoint.locationId : null;
  const owner = {uid: snap.uid, blockedTerms: snap.blockedTerms};
  const lines = markShortStock(
    snap.cart.map((l) => priceLine(l, snap.catalog, input.channel, delivery, owner)),
    snap.catalog,
    arenaLocation,
  );
  if (lines.length === 0) problems.push("carrinho_vazio");
  if (lines.some((l) => l.problem !== null)) problems.push("linha_com_problema");

  const okLines = lines.filter((l) => l.problem === null);
  const subtotalCents = okLines.reduce((n, l) => n + l.totalCents, 0);
  const units = okLines.reduce((n, l) => n + l.qty, 0);

  const code = input.couponCode?.trim() ?? "";
  const priced = code ? priceCoupon(code, snap.coupon, lines, input.channel, delivery, now) : null;
  const {coupon, couponCents, squad, squadCents} = pickPromo(priced, snap, subtotalCents);
  const promoCents = couponCents + squadCents;

  const pct = pixPercent(snap.discounts);
  // O embaixador acumula com o Pix; o cupom, conforme a regra dele.
  const pixApplies = couponCents === 0 || coupon?.stacksWithPix !== false;
  const pixDiscountCents = pixApplies ? pixDiscountOf(subtotalCents - promoCents, pct) : 0;

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

  const pixTotalCents = Math.max(0, subtotalCents - promoCents - pixDiscountCents + shippingCents);
  const cardBaseCents = Math.max(0, subtotalCents - promoCents + shippingCents);
  const cardFeeCents = cardBaseCents > 0 ? Math.max(0, Math.round(cardFeeOf(cardBaseCents))) : 0;
  const cardTotalCents = cardBaseCents + cardFeeCents;
  const card = paymentMethod === "cartao";

  return {
    paymentMethod,
    lines,
    units,
    subtotalCents,
    coupon,
    squad,
    squadDiscountCents: squadCents,
    pixDiscountPct: pct,
    pixDiscountCents: card ? 0 : pixDiscountCents,
    cardFeeCents: card ? cardFeeCents : 0,
    shippingCents,
    freeShipping,
    totalCents: card ? cardTotalCents : pixTotalCents,
    pixTotalCents,
    cardTotalCents,
    problems,
  };
}

/** "Rua T-37, 1240 · Ap 802 · Setor Bueno" — a linha única que o pedido guarda. */
export function addressLine(a: CheckoutAddress): string {
  return [`${a.street}, ${a.number}`, a.complement, a.district].filter((s) => s.trim() !== "").join(" · ");
}
