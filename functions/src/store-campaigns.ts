/**
 * Loja: banners de campanha da vitrine (tela "Campanhas" do backoffice).
 *
 *   storeConfig/campaigns  — `{banners: [...], version, updatedAt, updatedBy}`.
 *
 * A ordem do array é a ordem da vitrine: ela mostra os 3 primeiros no ar hoje. Banner inativo
 * fica guardado aqui, mas `bannerFromData` não o leva ao espelho público (`storePublic/showcase`,
 * gatilho `onStoreConfigWrittenSyncShowcase`). As rules negam escrita de cliente: esta callable
 * é a única porta. Grava a lista inteira de uma vez — reordenar é salvar a lista na nova ordem.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {assertCatalogAdmin, type Actor} from "./store-catalog-write";
import {STORE_CONFIG} from "./store-pickup";
import {
  BANNER_SUBTITLE_MAX,
  BANNER_TITLE_MAX,
  CAMPAIGNS_CONFIG_ID,
  STORE_CATEGORIES,
  STORE_COLLECTIONS,
  bannerFromData,
  type ShowcaseBanner,
} from "./store-showcase";

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

/** Mais que isso deixa de ser campanha e vira acervo: arquivar é apagar. */
export const MAX_CAMPAIGN_BANNERS = 12;
const KICKER_MAX = 40;
const CTA_LABEL_MAX = 30;
const URL_MAX = 1000;
/** Id vai pro analytics (`loja_banner_click.campanha_id`): legível e estável. */
const BANNER_ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface CampaignBannerInput {
  id: string;
  kicker: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  primary: {label: string; collectionId: string};
  /** Categoria OU link (caminho do portal `/…` ou `https://…`), nunca os dois. */
  secondary: {label: string; categoryId: string | null; url: string | null} | null;
  /** Datas civis de São Paulo (YYYY-MM-DD), inclusivas; `null` = sem limite. */
  startDate: string | null;
  endDate: string | null;
  active: boolean;
}

export interface SaveCampaignsInput {
  banners: CampaignBannerInput[];
  /** A `version` lida pela tela; outra pessoa salvou no meio = recusa. Doc ausente = 0. */
  version: number;
}

export interface StoredCampaignBanner extends ShowcaseBanner {
  active: boolean;
}

function invalidFields(fields: string[]): HttpsError {
  return new HttpsError("invalid-argument", "Dados inválidos.", {fields: [...new Set(fields)].sort()});
}

function text(v: unknown, min: number, max: number): boolean {
  return typeof v === "string" && v.trim().length >= min && v.trim().length <= max;
}

function isDate(v: unknown): v is string {
  return typeof v === "string" && DATE_RE.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
}

/** Caminho do portal (`/torneios`) ou endereço https. `//host` é link externo disfarçado. */
export function isBannerLink(v: unknown): v is string {
  if (typeof v !== "string" || v.length > URL_MAX || /\s/.test(v)) return false;
  if (v.startsWith("/")) return !v.startsWith("//");
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Só a URL: pixels (recomendado 1600×800, mínimo 1200×600) quem confere é o backoffice antes do
 * upload (`campanhas/data/campaign-image.ts`) — aqui não há a imagem, e a rule do Storage só vê
 * bytes e tipo.
 */
function isImageUrl(v: unknown): boolean {
  if (v === null) return true;
  if (typeof v !== "string" || v.length > 2048) return false;
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}

/** Campos inválidos de um banner, como `banners.<i>.<campo>`. */
export function bannerErrors(b: CampaignBannerInput, index: number): string[] {
  const at = (field: string) => `banners.${index}.${field}`;
  if (b === null || typeof b !== "object") return [at("id")];
  const fields: string[] = [];
  if (typeof b.id !== "string" || !BANNER_ID_RE.test(b.id)) fields.push(at("id"));
  if (!text(b.kicker, 0, KICKER_MAX)) fields.push(at("kicker"));
  if (!text(b.title, 1, BANNER_TITLE_MAX)) fields.push(at("title"));
  if (!text(b.subtitle, 0, BANNER_SUBTITLE_MAX)) fields.push(at("subtitle"));
  if (!isImageUrl(b.imageUrl)) fields.push(at("imageUrl"));

  const primary = b.primary;
  if (!primary || typeof primary !== "object" || !text(primary.label, 1, CTA_LABEL_MAX)) fields.push(at("primary.label"));
  if (!STORE_COLLECTIONS.some((c) => c.id === primary?.collectionId)) fields.push(at("primary.collectionId"));

  const sec = b.secondary;
  if (sec !== null) {
    if (!sec || typeof sec !== "object" || !text(sec.label, 1, CTA_LABEL_MAX)) fields.push(at("secondary.label"));
    const category = sec?.categoryId ?? null;
    const url = sec?.url ?? null;
    const categoryOk = category !== null && STORE_CATEGORIES.some((c) => c.id === category);
    const urlOk = url !== null && isBannerLink(url);
    // Exatamente um destino: a vitrine escolhe a categoria primeiro e ignoraria o link.
    if ((category === null) === (url === null)) {
      fields.push(at("secondary.target"));
    } else if (category !== null && !categoryOk) {
      fields.push(at("secondary.categoryId"));
    } else if (url !== null && !urlOk) {
      fields.push(at("secondary.url"));
    }
  }

  if (b.startDate !== null && !isDate(b.startDate)) fields.push(at("startDate"));
  if (b.endDate !== null && (!isDate(b.endDate) || (isDate(b.startDate) && b.endDate < b.startDate))) {
    fields.push(at("endDate"));
  }
  if (typeof b.active !== "boolean") fields.push(at("active"));
  return fields;
}

export function campaignsErrors(input: SaveCampaignsInput): string[] {
  if (!input || typeof input !== "object") return ["banners"];
  const fields: string[] = [];
  if (typeof input.version !== "number" || !Number.isInteger(input.version) || input.version < 0) {
    fields.push("version");
  }
  if (!Array.isArray(input.banners) || input.banners.length > MAX_CAMPAIGN_BANNERS) {
    return [...fields, "banners"];
  }
  const seen = new Set<string>();
  input.banners.forEach((b, i) => {
    fields.push(...bannerErrors(b, i));
    if (typeof b?.id === "string") {
      if (seen.has(b.id)) fields.push(`banners.${i}.id`);
      seen.add(b.id);
    }
  });
  return fields;
}

/**
 * Banner validado → como fica guardado. Passa por `bannerFromData` (o mesmo corte que o gatilho
 * faz ao publicar), então o que o backoffice relê é exatamente o que a vitrine mostra.
 */
export function storedBanner(b: CampaignBannerInput): StoredCampaignBanner {
  const normalized = bannerFromData({...b, active: true});
  // Inalcançável depois de `campaignsErrors`; se acontecer, é regra que divergiu.
  if (normalized === null) throw new HttpsError("internal", "Banner inválido após validação.");
  return {...normalized, active: b.active};
}

function currentVersion(data: Record<string, unknown> | undefined): number {
  const v = data?.["version"];
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 0;
}

export async function saveCampaignsCore(
  db: Firestore,
  input: SaveCampaignsInput,
  actor: Actor,
  now: Date,
): Promise<{version: number; banners: StoredCampaignBanner[]}> {
  const errors = campaignsErrors(input);
  if (errors.length > 0) throw invalidFields(errors);
  const banners = input.banners.map(storedBanner);
  const ref = db.collection(STORE_CONFIG).doc(CAMPAIGNS_CONFIG_ID);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data()! : undefined;
    if (currentVersion(current) !== input.version) {
      throw new HttpsError(
        "failed-precondition",
        "As campanhas foram alteradas por outra pessoa. Recarregue antes de salvar.",
        {updatedBy: current?.["updatedBy"] ?? null},
      );
    }
    const version = input.version + 1;
    tx.set(ref, {banners, version, updatedAt: now, updatedBy: actor});
    return {version, banners};
  });
}

export const saveStoreCampaigns = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const actor = await assertCatalogAdmin(uid);
  return saveCampaignsCore(getFirestore(), (request.data ?? {}) as SaveCampaignsInput, actor, new Date());
});
