/**
 * Loja: produtos personalizados — configuração por produto (tela 11) e fila de arte (tela 10).
 *
 *   storeProductCustomization/{productId} — o que o atleta pode personalizar e quanto custa.
 *       Doc à parte do produto: `saveStoreProduct` grava o produto com merge:false.
 *   storeConfig/blocklist                 — palavras bloqueadas no nome (global).
 *   storeCustomItems/{id}                 — um item personalizado de um pedido (kit = 1 item).
 *   storeCustomBatches/{id}               — lote enviado à estamparia.
 *
 * As rules negam escrita de cliente: estas callables são a única porta. A criação do item
 * (checkout) e o reenvio de imagem pelo atleta ficam para quando a Loja tiver pedidos.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {assertCatalogAdmin, type Actor} from "./store-catalog-write";

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

export const CUSTOMIZATION = "storeProductCustomization";
export const CUSTOM_ITEMS = "storeCustomItems";
export const CUSTOM_BATCHES = "storeCustomBatches";
const STORE_CONFIG = "storeConfig";
const BLOCKLIST_ID = "blocklist";

// ---------------------------------------------------------------------------
// Configuração (tela 11)
// ---------------------------------------------------------------------------

export type NamePlacement = "costas_superior" | "costas_inferior" | "frente" | "manga";
export type FontId = "bloco" | "classica" | "mono";
export type ImageFormat = "png" | "jpg" | "svg";

export interface PrintArea {
  id: string;
  name: string;
  widthCm: number;
  heightCm: number;
  enabled: boolean;
}

export interface CustomizationConfig {
  active: boolean;
  name: {
    enabled: boolean;
    maxChars: number;
    placement: NamePlacement;
    fonts: {id: FontId; enabled: boolean}[];
    colors: string[];
    blockOffensive: boolean;
  };
  image: {
    enabled: boolean;
    formats: ImageFormat[];
    maxSizeMb: number;
    minWidthPx: number;
    minHeightPx: number;
    areas: PrintArea[];
    removeBackground: boolean;
  };
  /**
   * Elemento das costas, abaixo do nome: o atleta escolhe imagem OU número entre os que o
   * produto libera. Substitui o antigo `name.allowNumber` (número colado ao nome).
   */
  back: {
    enabled: boolean;
    allowImage: boolean;
    allowNumber: boolean;
    numberMaxDigits: number;
    widthCm: number;
    heightCm: number;
  };
  /** `backCents` soma ao preço de nome/imagem quando o atleta preenche as costas. */
  price: {nameOnlyCents: number; imageOnlyCents: number; bothCents: number; backCents: number};
  production: {leadDays: number; printShop: string; manualApproval: boolean};
  defectOnlyReturns: boolean;
}

const PLACEMENTS: NamePlacement[] = ["costas_superior", "costas_inferior", "frente", "manga"];
const FONTS: FontId[] = ["bloco", "classica", "mono"];
const FORMATS: ImageFormat[] = ["png", "jpg", "svg"];
const HEX_RE = /^#[0-9a-f]{6}$/i;
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** O que um produto sem doc de personalização mostra ao abrir a aba. O backoffice espelha isto. */
export const DEFAULT_CUSTOMIZATION: CustomizationConfig = {
  active: false,
  name: {
    enabled: true,
    maxChars: 12,
    placement: "costas_superior",
    fonts: FONTS.map((id) => ({id, enabled: true})),
    colors: ["#ffffff", "#111111", "#ff6a1a", "#e3b85c"],
    blockOffensive: true,
  },
  image: {
    enabled: true,
    formats: [...FORMATS],
    maxSizeMb: 10,
    minWidthPx: 1000,
    minHeightPx: 1000,
    areas: [
      {id: "peito_esquerdo", name: "Peito esquerdo", widthCm: 9, heightCm: 9, enabled: true},
      {id: "centro_frente", name: "Centro da frente", widthCm: 25, heightCm: 30, enabled: true},
      {id: "manga", name: "Manga", widthCm: 7, heightCm: 7, enabled: false},
    ],
    removeBackground: true,
  },
  back: {enabled: false, allowImage: true, allowNumber: true, numberMaxDigits: 2, widthCm: 25, heightCm: 25},
  price: {nameOnlyCents: 1490, imageOnlyCents: 1990, bothCents: 2490, backCents: 990},
  production: {leadDays: 5, printShop: "", manualApproval: true},
  defectOnlyReturns: true,
};

function int(v: unknown, min: number, max: number): boolean {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

function bool(v: unknown): boolean {
  return typeof v === "boolean";
}

function invalidFields(fields: string[]): HttpsError {
  return new HttpsError("invalid-argument", "Dados inválidos.", {fields: [...new Set(fields)].sort()});
}

export function customizationErrors(c: CustomizationConfig): string[] {
  const fields: string[] = [];
  if (!bool(c?.active)) fields.push("active");

  const n = c?.name;
  const fonts = Array.isArray(n?.fonts) ? n.fonts : null;
  const colors = Array.isArray(n?.colors) ? n.colors : null;
  if (
    !n || !bool(n.enabled) || !int(n.maxChars, 1, 20) || !PLACEMENTS.includes(n.placement) ||
    !bool(n.blockOffensive) ||
    !fonts || fonts.length !== FONTS.length || fonts.some((f) => !FONTS.includes(f?.id) || !bool(f.enabled)) ||
    new Set(fonts.map((f) => f.id)).size !== FONTS.length ||
    !colors || colors.length > 8 || colors.some((h) => typeof h !== "string" || !HEX_RE.test(h))
  ) {
    fields.push("name");
  } else if (n.enabled && (!fonts.some((f) => f.enabled) || colors.length === 0)) {
    // Nome ligado sem fonte ou sem cor deixa o editor do app sem opção.
    fields.push("name");
  }

  const i = c?.image;
  const formats = Array.isArray(i?.formats) ? i.formats : null;
  const areas = Array.isArray(i?.areas) ? i.areas : null;
  if (
    !i || !bool(i.enabled) || !int(i.maxSizeMb, 1, 50) || !int(i.minWidthPx, 100, 10000) ||
    !int(i.minHeightPx, 100, 10000) || !bool(i.removeBackground) ||
    !formats || formats.some((f) => !FORMATS.includes(f)) || new Set(formats).size !== formats.length ||
    !areas || areas.length === 0 || areas.length > 10 ||
    areas.some((a) =>
      typeof a?.id !== "string" || !ID_RE.test(a.id) || typeof a.name !== "string" || a.name.trim() === "" ||
      a.name.length > 40 || !int(a.widthCm, 1, 100) || !int(a.heightCm, 1, 100) || !bool(a.enabled),
    )
  ) {
    fields.push("image");
  } else if (i.enabled && (formats.length === 0 || !areas.some((a) => a.enabled))) {
    fields.push("image");
  }

  const b = c?.back;
  if (
    !b || !bool(b.enabled) || !bool(b.allowImage) || !bool(b.allowNumber) ||
    !int(b.numberMaxDigits, 1, 3) || !int(b.widthCm, 1, 100) || !int(b.heightCm, 1, 100)
  ) {
    fields.push("back");
  } else if (b.enabled && !b.allowImage && !b.allowNumber) {
    // Costas ligadas sem imagem nem número: o atleta não teria o que escolher.
    fields.push("back");
  }

  const p = c?.price;
  if (
    !p || !int(p.nameOnlyCents, 0, 100000) || !int(p.imageOnlyCents, 0, 100000) || !int(p.bothCents, 0, 100000) ||
    !int(p.backCents, 0, 100000)
  ) {
    fields.push("price");
  }
  const prod = c?.production;
  if (
    !prod || !int(prod.leadDays, 1, 60) || typeof prod.printShop !== "string" ||
    prod.printShop.length > 80 || !bool(prod.manualApproval)
  ) {
    fields.push("production");
  }
  if (!bool(c?.defectOnlyReturns)) fields.push("defectOnlyReturns");

  // Ativa sem nada para personalizar: o app mostraria um editor vazio.
  if (fields.length === 0 && c.active && !c.name.enabled && !c.image.enabled && !c.back.enabled) fields.push("active");
  return fields.sort();
}

/** Doc salvo por cima do padrão — o doc pode ser de versão anterior. */
export function withCustomizationDefaults(data: Record<string, unknown> | undefined): CustomizationConfig {
  const d = (data ?? {}) as Partial<CustomizationConfig> & {name?: {allowNumber?: boolean}};
  // Doc de antes das costas com "número junto com o nome" ligado vira costas só com número.
  // `back: null` (seed/migração antiga) conta como ausente — senão o número sumia do cliente.
  const legacyNumber = d.back == null && d.name?.allowNumber === true;
  const {allowNumber: _legacy, ...name} = (d.name ?? {}) as Record<string, unknown>;
  return {
    ...DEFAULT_CUSTOMIZATION,
    ...d,
    name: {...DEFAULT_CUSTOMIZATION.name, ...name},
    back: legacyNumber
      ? {...DEFAULT_CUSTOMIZATION.back, enabled: true, allowImage: false, allowNumber: true}
      : {...DEFAULT_CUSTOMIZATION.back, ...(d.back ?? {})},
    image: {...DEFAULT_CUSTOMIZATION.image, ...(d.image ?? {})},
    price: {...DEFAULT_CUSTOMIZATION.price, ...(d.price ?? {})},
    production: {...DEFAULT_CUSTOMIZATION.production, ...(d.production ?? {})},
  };
}

export async function saveCustomizationCore(
  db: Firestore,
  input: {productId: string; config: CustomizationConfig},
  actor: Actor,
  now: Date,
): Promise<{productId: string}> {
  if (typeof input?.productId !== "string" || !ID_RE.test(input.productId)) throw invalidFields(["productId"]);
  const errors = customizationErrors(input.config);
  if (errors.length > 0) throw invalidFields(errors);

  const product = await db.collection("storeProducts").doc(input.productId).get();
  if (!product.exists) throw new HttpsError("not-found", "Produto não encontrado.");

  const c = input.config;
  await db.collection(CUSTOMIZATION).doc(input.productId).set({
    active: c.active,
    // Campo a campo: o `allowNumber` antigo, se vier de um cliente desatualizado, não volta ao doc.
    name: {
      enabled: c.name.enabled,
      maxChars: c.name.maxChars,
      placement: c.name.placement,
      fonts: c.name.fonts,
      colors: c.name.colors.map((h) => h.toLowerCase()),
      blockOffensive: c.name.blockOffensive,
    },
    image: {...c.image, areas: c.image.areas.map((a) => ({...a, name: a.name.trim()}))},
    back: {
      enabled: c.back.enabled,
      allowImage: c.back.allowImage,
      allowNumber: c.back.allowNumber,
      numberMaxDigits: c.back.numberMaxDigits,
      widthCm: c.back.widthCm,
      heightCm: c.back.heightCm,
    },
    price: c.price,
    production: {...c.production, printShop: c.production.printShop.trim()},
    defectOnlyReturns: c.defectOnlyReturns,
    updatedAt: now,
    updatedBy: actor,
  });
  return {productId: input.productId};
}

/** Minúsculo, sem acento, sem repetição: é assim que o app compara. */
export function normalizeTerms(terms: unknown): string[] {
  if (!Array.isArray(terms)) return [];
  const clean = terms
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim())
    .filter((t) => t !== "");
  return [...new Set(clean)].sort();
}

export async function saveBlocklistCore(
  db: Firestore,
  input: {terms: string[]},
  actor: Actor,
  now: Date,
): Promise<{count: number}> {
  const terms = normalizeTerms(input?.terms);
  if (!Array.isArray(input?.terms) || terms.length > 2000 || terms.some((t) => t.length > 40)) {
    throw invalidFields(["terms"]);
  }
  await db.collection(STORE_CONFIG).doc(BLOCKLIST_ID).set({terms, updatedAt: now, updatedBy: actor});
  return {count: terms.length};
}

// ---------------------------------------------------------------------------
// Fila de arte (tela 10)
// ---------------------------------------------------------------------------

export type CustomItemStatus = "aprovar" | "nova_imagem" | "producao" | "pronto" | "reprovado";
export type ReviewAction = "aprovar" | "nova_imagem" | "reprovar" | "pronto";
export type NewImageReason = "baixa_resolucao" | "marca_terceiros" | "conteudo_improprio" | "outro";
export type RefundScope = "personalizacao" | "item";

const REASONS: NewImageReason[] = ["baixa_resolucao", "marca_terceiros", "conteudo_improprio", "outro"];

const TRANSITIONS: Record<ReviewAction, {from: CustomItemStatus[]; to: CustomItemStatus}> = {
  aprovar: {from: ["aprovar"], to: "producao"},
  nova_imagem: {from: ["aprovar"], to: "nova_imagem"},
  reprovar: {from: ["aprovar", "nova_imagem"], to: "reprovado"},
  pronto: {from: ["producao"], to: "pronto"},
};

export function nextCustomStatus(current: CustomItemStatus, action: ReviewAction): CustomItemStatus | null {
  const t = TRANSITIONS[action];
  return t && t.from.includes(current) ? t.to : null;
}

export interface ReviewInput {
  itemId: string;
  version: number;
  action: ReviewAction;
  reason?: NewImageReason;
  note?: string;
  refundScope?: RefundScope;
}

export async function reviewCustomItemCore(
  db: Firestore,
  input: ReviewInput,
  actor: Actor,
  now: Date,
): Promise<{status: CustomItemStatus; version: number}> {
  const fields: string[] = [];
  if (typeof input?.itemId !== "string" || !ID_RE.test(input.itemId)) fields.push("itemId");
  if (!(input?.action in TRANSITIONS)) fields.push("action");
  const note = typeof input?.note === "string" ? input.note.trim().slice(0, 300) : "";
  if (input?.action === "nova_imagem" && (!REASONS.includes(input.reason as NewImageReason) || (input.reason === "outro" && note === ""))) {
    fields.push("reason");
  }
  if (input?.action === "reprovar" && input.refundScope !== "personalizacao" && input.refundScope !== "item") {
    fields.push("refundScope");
  }
  if (fields.length > 0) throw invalidFields(fields);

  const ref = db.collection(CUSTOM_ITEMS).doc(input.itemId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Item não encontrado.");
    const item = snap.data()!;
    if ((item["version"] ?? 0) !== input.version) {
      throw new HttpsError("failed-precondition", "Este item foi alterado por outra pessoa. Recarregue a fila.", {
        updatedBy: item["updatedBy"] ?? null,
      });
    }
    const status = nextCustomStatus(item["status"] as CustomItemStatus, input.action);
    if (!status) {
      throw new HttpsError("failed-precondition", "Esta ação não vale para o status atual do item.", {
        current: item["status"],
      });
    }
    const version = input.version + 1;
    const extra: Record<string, unknown> =
      input.action === "aprovar" ? {approvedAt: now, approvedBy: actor} :
        input.action === "nova_imagem" ? {request: {reason: input.reason, note, at: now, by: actor}} :
          input.action === "reprovar" ?
            // O estorno de verdade depende dos pedidos da Loja; aqui fica registrado como pendente.
            {refund: {scope: input.refundScope, status: "pendente", at: now, by: actor}, rejectedAt: now} :
            {readyAt: now};
    tx.set(ref, {
      ...extra,
      status,
      history: [...((item["history"] ?? []) as unknown[]), {status, action: input.action, actor, at: now}],
      version,
      updatedAt: now,
      updatedBy: actor,
    }, {merge: true});
    return {status, version};
  });
}

export interface BatchRow {
  itemId: string;
  orderCode: string;
  productName: string;
  variantLabel: string;
  names: string[];
  font: string | null;
  nameColor: string | null;
  namePlacement: string | null;
  imageArea: string | null;
  imageUrl: string | null;
  /** "nº 10" ou a URL da imagem das costas; `null` sem costas. */
  back: string | null;
  /** Número das costas de cada unidade do kit (mesma ordem de `names`). */
  numbers: string[];
  files: {name: string; url: string}[];
}

/** Um Firestore batch comporta 500 escritas; o lote grava o doc do lote + 1 por item. */
const MAX_BATCH_ITEMS = 400;

/**
 * Fecha um lote com as artes aprovadas que ainda não foram à estamparia e devolve as linhas
 * da planilha. Itens já em outro lote não entram de novo.
 */
export async function createCustomBatchCore(
  db: Firestore,
  actor: Actor,
  now: Date,
): Promise<{batchId: string; rows: BatchRow[]}> {
  const snap = await db.collection(CUSTOM_ITEMS).where("status", "==", "producao").get();
  const pending = snap.docs.filter((d) => !d.data()["batchId"]).slice(0, MAX_BATCH_ITEMS);
  if (pending.length === 0) {
    throw new HttpsError("failed-precondition", "Nenhuma arte aprovada esperando lote.");
  }

  const batchRef = db.collection(CUSTOM_BATCHES).doc();
  const rows: BatchRow[] = pending.map((d) => {
    const it = d.data();
    const units = Array.isArray(it["units"]) ? (it["units"] as {name?: string; number?: string}[]) : [];
    const back = it["back"] as {type?: string; number?: string; image?: {url?: string}} | undefined;
    const names = units.length > 0 ? units.map((u) => u.name ?? "") : it["name"] ? [it["name"] as string] : [];
    return {
      itemId: d.id,
      orderCode: String(it["orderCode"] ?? ""),
      productName: String(it["productName"] ?? ""),
      variantLabel: String(it["variantLabel"] ?? ""),
      names,
      font: (it["font"] as string) ?? null,
      nameColor: (it["nameColor"] as string) ?? null,
      namePlacement: (it["namePlacement"] as string) ?? null,
      imageArea: (it["imageArea"] as string) ?? null,
      imageUrl: (it["image"]?.["url"] as string) ?? null,
      back: back?.type === "numero" ? `nº ${back.number ?? ""}` : back?.type === "imagem" ? (back.image?.url ?? "imagem") : null,
      numbers: units.map((u) => u.number ?? ""),
      files: Array.isArray(it["finalFiles"]) ? it["finalFiles"] : [],
    };
  });

  const writes = db.batch();
  writes.set(batchRef, {itemIds: pending.map((d) => d.id), count: pending.length, sentAt: now, createdBy: actor});
  for (const d of pending) {
    writes.set(d.ref, {batchId: batchRef.id, batchedAt: now, updatedAt: now, updatedBy: actor}, {merge: true});
  }
  await writes.commit();
  return {batchId: batchRef.id, rows};
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

async function actorOf(uid: string | undefined): Promise<Actor> {
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return assertCatalogAdmin(uid);
}

export const saveStoreCustomization = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth?.uid);
  const input = (request.data ?? {}) as {productId: string; config: CustomizationConfig};
  return saveCustomizationCore(getFirestore(), input, actor, new Date());
});

export const saveStoreBlocklist = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth?.uid);
  return saveBlocklistCore(getFirestore(), (request.data ?? {}) as {terms: string[]}, actor, new Date());
});

export const reviewStoreCustomItem = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth?.uid);
  return reviewCustomItemCore(getFirestore(), (request.data ?? {}) as ReviewInput, actor, new Date());
});

export const createStoreCustomBatch = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth?.uid);
  return createCustomBatchCore(getFirestore(), actor, new Date());
});
