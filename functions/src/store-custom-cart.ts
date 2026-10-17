/**
 * Loja · Personalizar (telas 02b/02c, portal do atleta + app): o lado do CLIENTE da personalização.
 *
 *   storeShowcase/{id}.customization   — o pedaço público da config (via `publicCustomization`).
 *   store/custom-uploads/{uid}/{id}    — imagem enviada pelo atleta (Storage, só o dono).
 *   storeCarts/{uid}.items[]           — linha personalizada com `lineId` + `customization`.
 *
 * A linha personalizada só entra pelo servidor (`addStoreCustomItemToCart`): o nome passa pela
 * lista de bloqueio, a imagem tem formato/peso/resolução conferidos no arquivo, e o adicional é
 * calculado aqui. A rule do carrinho continua deixando o dono escrever — o checkout tem de reler
 * preço, saldo e personalização de novo (como já vale para a linha comum).
 *
 * Regras em `docs/business-rules/loja-personalizar.md`. Puro onde dá, para teste sem banco.
 */
import {randomUUID} from "node:crypto";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {MAX_QTY_PER_ITEM} from "./store-catalog";
import {withCustomizationDefaults, type CustomizationConfig, type FontId, type NamePlacement} from "./store-custom";

type Data = Record<string, unknown>;

const PRODUCTS = "storeProducts";
const CUSTOMIZATION = "storeProductCustomization";
const CARTS = "storeCarts";
const BLOCKLIST_DOC = "storeConfig/blocklist";
/** Teto da rule de `storeCarts.items`. */
const MAX_CART_LINES = 30;
/** Onde o atleta sobe a imagem. A rule do Storage só deixa o dono escrever aqui. */
export const CUSTOM_UPLOAD_PREFIX = "store/custom-uploads";

/** dpi efetivo a partir do qual a imagem é "boa qualidade" na área escolhida. */
export const GOOD_DPI = 300;

// ---------------------------------------------------------------------------
// Config pública (vai para o espelho da vitrine)
// ---------------------------------------------------------------------------

export interface PublicCustomization {
  /** Menor preço entre as opções ligadas ("+ personalização a partir de"). 0 = nenhuma. */
  fromCents: number;
  leadDays: number;
  defectOnlyReturns: boolean;
  /** Muda a cada save da config no backoffice: o carrinho guarda com qual config o item foi feito. */
  version: number;
  name: {
    enabled: boolean;
    maxChars: number;
    placement: NamePlacement;
    /** Só as fontes ligadas, na ordem do backoffice (a primeira é o padrão). */
    fonts: FontId[];
    colors: string[];
  };
  image: {
    enabled: boolean;
    formats: string[];
    maxSizeMb: number;
    minWidthPx: number;
    minHeightPx: number;
    /** Só as áreas ligadas (a primeira é o padrão). */
    areas: {id: string; name: string; widthCm: number; heightCm: number}[];
  };
  price: {nameOnlyCents: number; imageOnlyCents: number; bothCents: number};
}

function toMillis(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  const ts = v as {toMillis?: () => number} | null | undefined;
  return typeof ts?.toMillis === "function" ? ts.toMillis() : 0;
}

/** As opções que o cliente mostra. As costas (imagem/número) ainda não têm tela no cliente. */
export function publicCustomization(raw: Data | null): PublicCustomization | null {
  if (raw?.["active"] !== true) return null;
  const c = withCustomizationDefaults(raw);
  const nameOn = c.name.enabled && c.name.fonts.some((f) => f.enabled) && c.name.colors.length > 0;
  const areas = c.image.areas.filter((a) => a.enabled);
  const imageOn = c.image.enabled && areas.length > 0 && c.image.formats.length > 0;
  const options = [
    nameOn ? c.price.nameOnlyCents : null,
    imageOn ? c.price.imageOnlyCents : null,
  ].filter((n): n is number => n !== null && n > 0);
  return {
    fromCents: options.length > 0 ? Math.min(...options) : 0,
    leadDays: c.production.leadDays,
    defectOnlyReturns: c.defectOnlyReturns === true,
    version: toMillis(raw["updatedAt"]),
    name: {
      enabled: nameOn,
      maxChars: c.name.maxChars,
      placement: c.name.placement,
      fonts: c.name.fonts.filter((f) => f.enabled).map((f) => f.id),
      colors: c.name.colors.map((h) => h.toLowerCase()),
    },
    image: {
      enabled: imageOn,
      formats: [...c.image.formats],
      maxSizeMb: c.image.maxSizeMb,
      minWidthPx: c.image.minWidthPx,
      minHeightPx: c.image.minHeightPx,
      areas: areas.map(({id, name, widthCm, heightCm}) => ({id, name: name.trim(), widthCm, heightCm})),
    },
    price: {
      nameOnlyCents: c.price.nameOnlyCents,
      imageOnlyCents: c.price.imageOnlyCents,
      bothCents: c.price.bothCents,
    },
  };
}

// ---------------------------------------------------------------------------
// Nome
// ---------------------------------------------------------------------------

/** Letras (com acento), números, espaço, ponto e hífen — depois de ir para maiúsculas. */
const NAME_RE = /^[\p{Lu}0-9 .-]*$/u;

/** O que o campo faz ao digitar: maiúsculas, sem espaço nas pontas nem espaço duplo. */
export function normalizeCustomName(text: unknown): string {
  return typeof text === "string" ? text.toUpperCase().replace(/\s+/g, " ").trim() : "";
}

function foldTerm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Palavra (ou sequência de palavras) da lista de bloqueio dentro do nome, sem acento e sem caixa.
 * Palavra inteira de propósito: "CU" bloqueado não pode derrubar "CUNHA".
 */
export function nameIsBlocked(name: string, terms: readonly string[]): boolean {
  const haystack = ` ${foldTerm(name)} `;
  if (haystack.trim() === "") return false;
  return terms.some((t) => {
    const term = foldTerm(t);
    return term !== "" && haystack.includes(` ${term} `);
  });
}

export type NameProblem = "empty" | "chars" | "length" | "blocked";

export function nameProblem(
  name: string,
  config: {maxChars: number; blockOffensive: boolean},
  terms: readonly string[],
): NameProblem | null {
  if (name === "") return "empty";
  if (!NAME_RE.test(name)) return "chars";
  if ([...name].length > config.maxChars) return "length";
  if (config.blockOffensive && nameIsBlocked(name, terms)) return "blocked";
  return null;
}

// ---------------------------------------------------------------------------
// Preço e qualidade
// ---------------------------------------------------------------------------

/** Nome e imagem juntos têm preço próprio (sai mais barato que somar os dois). */
export function customExtraCents(
  price: {nameOnlyCents: number; imageOnlyCents: number; bothCents: number},
  hasName: boolean,
  hasImage: boolean,
): number {
  if (hasName && hasImage) return price.bothCents;
  if (hasName) return price.nameOnlyCents;
  if (hasImage) return price.imageOnlyCents;
  return 0;
}

/** dpi efetivo = px ÷ (cm ÷ 2,54), no lado mais fraco. Vetor (SVG) não tem limite. */
export function effectiveDpi(
  image: {widthPx: number; heightPx: number} | null,
  area: {widthCm: number; heightCm: number},
): number {
  if (image === null) return Number.POSITIVE_INFINITY;
  return Math.min(image.widthPx / (area.widthCm / 2.54), image.heightPx / (area.heightCm / 2.54));
}

export function imageQuality(dpi: number): "good" | "warn" {
  return dpi >= GOOD_DPI ? "good" : "warn";
}

/**
 * Largura × altura lidas do começo do arquivo: PNG (IHDR), JPEG (marcador SOF) e SVG
 * (`width`/`height` ou `viewBox`). `null` = não deu pra ler.
 */
export function imageSizeFromBytes(head: Buffer): {widthPx: number; heightPx: number} | null {
  if (head.length >= 24 && head.readUInt32BE(0) === 0x89504e47 && head.toString("ascii", 12, 16) === "IHDR") {
    return {widthPx: head.readUInt32BE(16), heightPx: head.readUInt32BE(20)};
  }
  if (head.length >= 4 && head[0] === 0xff && head[1] === 0xd8) {
    let i = 2;
    while (i + 9 < head.length) {
      if (head[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = head[i + 1];
      // SOF0..SOF15, menos DHT (C4), JPG (C8) e DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return {heightPx: head.readUInt16BE(i + 5), widthPx: head.readUInt16BE(i + 7)};
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      i += 2 + head.readUInt16BE(i + 2);
    }
    return null;
  }
  const text = head.toString("utf8");
  const svg = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (svg) {
    const num = (attr: string) => {
      const m = new RegExp(`\\b${attr}\\s*=\\s*["']\\s*([0-9.]+)`, "i").exec(svg);
      return m ? Number(m[1]) : NaN;
    };
    let w = num("width");
    let h = num("height");
    if (!(w > 0 && h > 0)) {
      const vb = /\bviewBox\s*=\s*["']\s*[-0-9.]+[\s,]+[-0-9.]+[\s,]+([0-9.]+)[\s,]+([0-9.]+)/i.exec(svg);
      w = vb ? Number(vb[1]) : NaN;
      h = vb ? Number(vb[2]) : NaN;
    }
    return w > 0 && h > 0 ? {widthPx: Math.round(w), heightPx: Math.round(h)} : null;
  }
  return null;
}

const FORMAT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
};

// ---------------------------------------------------------------------------
// Adicionar ao carrinho
// ---------------------------------------------------------------------------

export interface AddCustomItemInput {
  productId: string;
  skuId: string;
  qty: number;
  name?: {text: string; fontId: string; color: string} | null;
  image?: {path: string; areaId: string; transform?: {x: number; y: number; scale: number}} | null;
}

/** O que o Storage diz do arquivo enviado (cabeçalho = primeiros bytes, para medir). */
export interface UploadInfo {
  contentType: string;
  sizeBytes: number;
  head: Buffer;
}

export interface CustomCartLine {
  lineId: string;
  productId: string;
  skuId: string;
  qty: number;
  customization: Data;
}

function invalid(fields: string[], message = "Personalização inválida."): HttpsError {
  return new HttpsError("invalid-argument", message, {fields: [...new Set(fields)].sort()});
}

function clamp01(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

function sumValues(v: unknown): number {
  if (v == null || typeof v !== "object") return 0;
  return Object.values(v as Record<string, unknown>).reduce<number>(
    (t, n) => t + (typeof n === "number" && n > 0 ? Math.floor(n) : 0),
    0,
  );
}

export async function addCustomItemToCartCore(
  db: Firestore,
  uid: string,
  input: AddCustomItemInput,
  readUpload: (path: string) => Promise<UploadInfo | null>,
  now: Date,
  newLineId: () => string = randomUUID,
): Promise<{lineId: string; extraPriceCents: number; unitPriceCents: number; quality: "good" | "warn" | null}> {
  const productId = typeof input?.productId === "string" ? input.productId : "";
  const skuId = typeof input?.skuId === "string" ? input.skuId : "";
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(productId) || !/^[A-Za-z0-9_-]{1,128}$/.test(skuId)) {
    throw invalid(["productId"]);
  }
  const wantsName = input.name != null;
  const wantsImage = input.image != null;
  if (!wantsName && !wantsImage) throw invalid(["name", "image"], "Escolha um nome ou uma imagem.");

  const productRef = db.collection(PRODUCTS).doc(productId);
  const [productSnap, skuSnap, customSnap, blockSnap] = await Promise.all([
    productRef.get(),
    productRef.collection("skus").doc(skuId).get(),
    db.collection(CUSTOMIZATION).doc(productId).get(),
    db.doc(BLOCKLIST_DOC).get(),
  ]);
  const product = productSnap.exists ? productSnap.data()! : null;
  if (!product || product["status"] !== "ativo" || product["active"] !== true) {
    throw new HttpsError("failed-precondition", "Esse produto não está mais à venda.");
  }
  if (!skuSnap.exists) throw invalid(["skuId"]);
  const customRaw = customSnap.exists ? customSnap.data()! : null;
  const pub = publicCustomization(customRaw);
  if (pub === null) throw new HttpsError("failed-precondition", "Esse produto não está mais personalizável.");
  const config: CustomizationConfig = withCustomizationDefaults(customRaw ?? undefined);

  const sku = skuSnap.data()!;
  const available = sumValues(sku["stockByLocation"]) - sumValues(sku["reservedByLocation"]);
  if (available <= 0) throw new HttpsError("failed-precondition", "Acabou o estoque dessa variação.");
  const maxQty = Math.min(available, MAX_QTY_PER_ITEM);
  const qty = Number.isInteger(input.qty) && input.qty > 0 ? Math.min(input.qty, maxQty) : 1;

  const customization: Data = {configVersion: pub.version};

  if (wantsName) {
    if (!pub.name.enabled) throw invalid(["name"], "Esse produto não aceita nome.");
    const text = normalizeCustomName(input.name!.text);
    const terms = Array.isArray(blockSnap.data()?.["terms"]) ? (blockSnap.data()!["terms"] as string[]) : [];
    const problem = nameProblem(text, {maxChars: pub.name.maxChars, blockOffensive: config.name.blockOffensive}, terms);
    if (problem === "blocked") throw invalid(["name"], "Esse nome não pode ser usado.");
    if (problem) throw invalid(["name"]);
    const fontId = input.name!.fontId as FontId;
    const color = typeof input.name!.color === "string" ? input.name!.color.toLowerCase() : "";
    if (!pub.name.fonts.includes(fontId) || !pub.name.colors.includes(color)) throw invalid(["name"]);
    customization["name"] = {text, fontId, color, placement: pub.name.placement};
  }

  let quality: "good" | "warn" | null = null;
  if (wantsImage) {
    if (!pub.image.enabled) throw invalid(["image"], "Esse produto não aceita imagem.");
    const path = typeof input.image!.path === "string" ? input.image!.path : "";
    // Só o próprio arquivo do atleta, e nada de subir pasta.
    if (!path.startsWith(`${CUSTOM_UPLOAD_PREFIX}/${uid}/`) || path.includes("..")) throw invalid(["image"]);
    const area = pub.image.areas.find((a) => a.id === input.image!.areaId);
    if (!area) throw invalid(["image"]);
    const upload = await readUpload(path);
    if (!upload) throw invalid(["image"], "Não achamos a imagem enviada. Envie de novo.");
    const format = FORMAT_BY_CONTENT_TYPE[upload.contentType] ?? "";
    if (!pub.image.formats.includes(format)) throw invalid(["image"], "Formato de imagem não aceito.");
    if (upload.sizeBytes > pub.image.maxSizeMb * 1024 * 1024) throw invalid(["image"], "Imagem maior que o permitido.");
    const size = format === "svg" ? null : imageSizeFromBytes(upload.head);
    if (format !== "svg" && size === null) throw invalid(["image"], "Não deu pra ler a imagem.");
    if (size && (size.widthPx < pub.image.minWidthPx || size.heightPx < pub.image.minHeightPx)) {
      throw invalid(["image"], `Imagem pequena demais · mínimo ${pub.image.minWidthPx} × ${pub.image.minHeightPx} px`);
    }
    quality = imageQuality(effectiveDpi(size, area));
    const t = input.image!.transform;
    customization["image"] = {
      path,
      format,
      sizeBytes: upload.sizeBytes,
      widthPx: size?.widthPx ?? null,
      heightPx: size?.heightPx ?? null,
      areaId: area.id,
      areaName: area.name,
      transform: {x: clamp01(t?.x, 0.5), y: clamp01(t?.y, 0.5), scale: Math.max(0.1, clamp01(t?.scale, 1))},
      quality,
    };
  }

  const extraPriceCents = customExtraCents(pub.price, wantsName, wantsImage);
  customization["extraPriceCents"] = extraPriceCents;
  customization["addedAt"] = now;
  const ownPrice = sku["priceCents"];
  const basePrice = typeof ownPrice === "number" && ownPrice > 0 ? ownPrice : (product["priceCents"] as number) ?? 0;

  const lineId = newLineId();
  const cartRef = db.collection(CARTS).doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(cartRef);
    const items = Array.isArray(snap.data()?.["items"]) ? (snap.data()!["items"] as Data[]) : [];
    if (items.length >= MAX_CART_LINES) {
      throw new HttpsError("resource-exhausted", "Seu carrinho está cheio.");
    }
    // Linha personalizada nunca soma com outra: cada configuração é uma linha.
    const line: CustomCartLine = {lineId, productId, skuId, qty, customization};
    tx.set(cartRef, {items: [...items, line], updatedAt: now});
  });

  return {lineId, extraPriceCents, unitPriceCents: basePrice + extraPriceCents, quality};
}

const CLIENT_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

/** Validação do nome no blur (o cliente não lê a lista de bloqueio). */
export const checkStoreCustomName = onCall(CLIENT_CALLABLE, async (request) => {
  const data = (request.data ?? {}) as {productId?: unknown; text?: unknown};
  const productId = typeof data.productId === "string" ? data.productId : "";
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(productId)) throw invalid(["productId"]);
  const db = getFirestore();
  const [customSnap, blockSnap] = await Promise.all([
    db.collection(CUSTOMIZATION).doc(productId).get(),
    db.doc(BLOCKLIST_DOC).get(),
  ]);
  const pub = publicCustomization(customSnap.exists ? customSnap.data()! : null);
  if (!pub?.name.enabled) return {ok: false, problem: "disabled"};
  const config = withCustomizationDefaults(customSnap.data());
  const terms = Array.isArray(blockSnap.data()?.["terms"]) ? (blockSnap.data()!["terms"] as string[]) : [];
  const problem = nameProblem(
    normalizeCustomName(data.text),
    {maxChars: pub.name.maxChars, blockOffensive: config.name.blockOffensive},
    terms,
  );
  return problem === null ? {ok: true} : {ok: false, problem};
});

export const addStoreCustomItemToCart = onCall(CLIENT_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta pra usar a Loja.");
  const bucket = getStorage().bucket();
  const readUpload = async (path: string): Promise<UploadInfo | null> => {
    const file = bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [meta] = await file.getMetadata();
    const [head] = await file.download({start: 0, end: 65_535});
    return {contentType: String(meta.contentType ?? ""), sizeBytes: Number(meta.size ?? 0), head};
  };
  return addCustomItemToCartCore(getFirestore(), uid, request.data as AddCustomItemInput, readUpload, new Date());
});
