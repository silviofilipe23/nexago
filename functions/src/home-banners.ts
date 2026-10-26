/**
 * App do atleta: banner de novidades da Home (tela "App do atleta" do backoffice).
 *
 *   appAdminConfig/homeBanners — a fonte: `{banners, version, updatedAt, updatedBy}`, só o admin lê.
 *   appConfig/homeBanners      — o que o app lê: só os publicados, ativos e ainda não encerrados.
 *   homeBannerStats/{id}       — quantos atletas viram, tocaram e dispensaram (gatilho abaixo).
 *   users/{uid}/homeBanners/{id} — o que AQUELE atleta já fez com o banner (`seenAt`,
 *                                `clickedAt`, `dismissedAt`), gravado pelo app, uma vez cada.
 *
 * A ordem do array é a ordem do carrossel. `saveHomeBanners` é a única porta de escrita (as rules
 * negam cliente) e grava fonte e espelho na mesma transação: sem gatilho de publicação, o que o
 * backoffice relê é exatamente o que o app recebe. Período e público o app confere na hora
 * (`home_banner_logic.dart`), então banner agendado já vai no espelho e entra sozinho na data.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import {callerCanAccessBackoffice} from "./auth-roles";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {saoPauloDate} from "./store-checkout-price";

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

export const HOME_BANNERS_ADMIN_COLLECTION = "appAdminConfig";
export const HOME_BANNERS_PUBLIC_COLLECTION = "appConfig";
export const HOME_BANNERS_DOC = "homeBanners";
export const HOME_BANNER_STATS = "homeBannerStats";

/** Espelha `backoffice/.../app/novidades/data/home-banner.ts` — mudar os dois. */
export const MAX_HOME_BANNERS = 20;
export const HOME_BANNER_TITLE_MAX = 22;
export const HOME_BANNER_DESCRIPTION_MAX = 60;
export const HOME_BANNER_CTA_MAX = 16;
const URL_MAX = 1000;
/** Também é o id do doc em `users/{uid}/homeBanners` e `homeBannerStats` (a rule usa o mesmo). */
const BANNER_ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const HOME_BANNER_FORMATS = ["carousel", "compact"] as const;
/**
 * Telas do app que o botão abre (`home_banner_destination.dart` mapeia para a rota). Chave nova
 * aqui exige o app que a conhece: build antigo esconde o banner com destino desconhecido.
 */
export const HOME_BANNER_DESTINATIONS = [
  "reservar",
  "bora-jogar",
  "peladas",
  "torneios",
  "ranking",
  "duplas",
  "treinos",
  "aulas",
  "loja",
  "indicar",
  "missoes",
  "url",
] as const;
/** Quem vê. O app decide com o que já carrega na Home (conta, reservas, inscrições). */
export const HOME_BANNER_AUDIENCES = ["all", "new", "no-booking", "booked", "no-tournament"] as const;

export type HomeBannerFormat = (typeof HOME_BANNER_FORMATS)[number];
export type HomeBannerDestination = (typeof HOME_BANNER_DESTINATIONS)[number];
export type HomeBannerAudience = (typeof HOME_BANNER_AUDIENCES)[number];

export interface HomeBannerInput {
  id: string;
  format: HomeBannerFormat;
  title: string;
  description: string;
  /** Texto do botão; o compacto não tem botão (a linha inteira é o toque). */
  ctaLabel: string;
  imageUrl: string | null;
  destination: HomeBannerDestination;
  /** Só com `destination: "url"`: endereço https aberto fora do app. */
  url: string | null;
  audience: HomeBannerAudience;
  /** Datas civis de São Paulo (YYYY-MM-DD), inclusivas; `null` = sem limite. */
  startDate: string | null;
  endDate: string | null;
  /** Some para o atleta depois que ele toca no botão uma vez. */
  hideAfterClick: boolean;
  /** Mostra o X; dispensado não volta para aquele atleta. */
  dismissible: boolean;
  /** `false` = rascunho: guardado, nunca vai ao app. */
  published: boolean;
  /** `false` = pausado: publicado, mas fora do app até reativar. */
  active: boolean;
}

export interface SaveHomeBannersInput {
  banners: HomeBannerInput[];
  /** A `version` lida pela tela; outra pessoa salvou no meio = recusa. Doc ausente = 0. */
  version: number;
}

/** O que vai ao app: sem os estados de bastidor (rascunho, pausa). */
export type PublicHomeBanner = Omit<HomeBannerInput, "published" | "active">;

export interface Actor {
  uid: string;
  name: string;
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

function isHttps(v: unknown, max: number): v is string {
  if (typeof v !== "string" || v.length > max || /\s/.test(v)) return false;
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}

function oneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

/**
 * Campos inválidos de um banner, como `banners.<i>.<campo>`. Rascunho pode ficar incompleto
 * (só os tetos valem); publicar exige título, descrição, botão (no carrossel) e o link do destino.
 */
export function homeBannerErrors(b: HomeBannerInput, index: number): string[] {
  const at = (field: string) => `banners.${index}.${field}`;
  if (b === null || typeof b !== "object") return [at("id")];
  const fields: string[] = [];
  const published = b.published === true;
  const min = published ? 1 : 0;
  if (typeof b.id !== "string" || !BANNER_ID_RE.test(b.id)) fields.push(at("id"));
  if (!oneOf(HOME_BANNER_FORMATS, b.format)) fields.push(at("format"));
  if (!text(b.title, min, HOME_BANNER_TITLE_MAX)) fields.push(at("title"));
  if (!text(b.description, min, HOME_BANNER_DESCRIPTION_MAX)) fields.push(at("description"));
  if (!text(b.ctaLabel, published && b.format === "carousel" ? 1 : 0, HOME_BANNER_CTA_MAX)) {
    fields.push(at("ctaLabel"));
  }
  if (b.imageUrl !== null && !isHttps(b.imageUrl, 2048)) fields.push(at("imageUrl"));
  if (!oneOf(HOME_BANNER_DESTINATIONS, b.destination)) {
    fields.push(at("destination"));
  } else if (b.destination === "url") {
    // Rascunho guarda o destino sem o link ainda; publicado precisa de um https.
    if (b.url === null ? published : !isHttps(b.url, URL_MAX)) fields.push(at("url"));
  } else if (b.url !== null) {
    fields.push(at("url"));
  }
  if (!oneOf(HOME_BANNER_AUDIENCES, b.audience)) fields.push(at("audience"));
  if (b.startDate !== null && !isDate(b.startDate)) fields.push(at("startDate"));
  if (b.endDate !== null && (!isDate(b.endDate) || (isDate(b.startDate) && b.endDate < b.startDate))) {
    fields.push(at("endDate"));
  }
  for (const flag of ["hideAfterClick", "dismissible", "published", "active"] as const) {
    if (typeof b[flag] !== "boolean") fields.push(at(flag));
  }
  return fields;
}

export function homeBannersErrors(input: SaveHomeBannersInput): string[] {
  if (!input || typeof input !== "object") return ["banners"];
  const fields: string[] = [];
  if (typeof input.version !== "number" || !Number.isInteger(input.version) || input.version < 0) {
    fields.push("version");
  }
  if (!Array.isArray(input.banners) || input.banners.length > MAX_HOME_BANNERS) {
    return [...fields, "banners"];
  }
  const seen = new Set<string>();
  input.banners.forEach((b, i) => {
    fields.push(...homeBannerErrors(b, i));
    if (typeof b?.id === "string") {
      if (seen.has(b.id)) fields.push(`banners.${i}.id`);
      seen.add(b.id);
    }
  });
  return fields;
}

/** Banner validado → como fica guardado: só os campos conhecidos, textos aparados. */
export function storedHomeBanner(b: HomeBannerInput): HomeBannerInput {
  return {
    id: b.id,
    format: b.format,
    title: b.title.trim(),
    description: b.description.trim(),
    ctaLabel: b.ctaLabel.trim(),
    imageUrl: b.imageUrl,
    destination: b.destination,
    url: b.destination === "url" ? b.url : null,
    audience: b.audience,
    startDate: b.startDate,
    endDate: b.endDate,
    hideAfterClick: b.hideAfterClick,
    dismissible: b.dismissible,
    published: b.published,
    active: b.active,
  };
}

/**
 * O espelho do app, na ordem: publicado, ativo e não encerrado em `today`. Agendado vai junto —
 * o app só mostra a partir do início, sem precisar de um novo save no dia.
 */
export function publicHomeBanners(banners: readonly HomeBannerInput[], today: string): PublicHomeBanner[] {
  return banners
    .filter((b) => b.published && b.active && (b.endDate === null || b.endDate >= today))
    .map(({published: _p, active: _a, ...rest}) => rest);
}

function currentVersion(data: Record<string, unknown> | undefined): number {
  const v = data?.["version"];
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 0;
}

export async function saveHomeBannersCore(
  db: Firestore,
  input: SaveHomeBannersInput,
  actor: Actor,
  now: Date,
): Promise<{version: number; banners: HomeBannerInput[]}> {
  const errors = homeBannersErrors(input);
  if (errors.length > 0) throw invalidFields(errors);
  const banners = input.banners.map(storedHomeBanner);
  const source = db.collection(HOME_BANNERS_ADMIN_COLLECTION).doc(HOME_BANNERS_DOC);
  const mirror = db.collection(HOME_BANNERS_PUBLIC_COLLECTION).doc(HOME_BANNERS_DOC);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(source);
    const current = snap.exists ? snap.data()! : undefined;
    if (currentVersion(current) !== input.version) {
      throw new HttpsError(
        "failed-precondition",
        "Os banners foram alterados por outra pessoa. Recarregue antes de salvar.",
        {updatedBy: current?.["updatedBy"] ?? null},
      );
    }
    const version = input.version + 1;
    tx.set(source, {banners, version, updatedAt: now, updatedBy: actor});
    tx.set(mirror, {banners: publicHomeBanners(banners, saoPauloDate(now)), version, updatedAt: now});
    return {version, banners};
  });
}

async function assertHomeBannersAdmin(uid: string): Promise<Actor> {
  let caller;
  try {
    caller = await getAuth().getUser(uid);
  } catch (err: unknown) {
    if ((err as {code?: string})?.code === "auth/user-not-found") {
      throw new HttpsError("unauthenticated", "Sua sessão expirou. Entre novamente para continuar.");
    }
    throw err;
  }
  if (!callerCanAccessBackoffice(caller)) {
    throw new HttpsError("permission-denied", "Apenas administradores da plataforma podem editar os banners do app.");
  }
  return {uid, name: caller.displayName ?? caller.email ?? uid};
}

export const saveHomeBanners = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const actor = await assertHomeBannersAdmin(uid);
  return saveHomeBannersCore(getFirestore(), (request.data ?? {}) as SaveHomeBannersInput, actor, new Date());
});

/** Marca do atleta → contador do banner. */
const STAT_OF = {seenAt: "seen", clickedAt: "clicked", dismissedAt: "dismissed"} as const;
export type HomeBannerStat = (typeof STAT_OF)[keyof typeof STAT_OF];

/**
 * O que somar ao contador: cada marca conta uma vez, quando aparece. A rule só deixa gravar a
 * marca uma vez e nunca apagar, então um atleta conta no máximo 1 em cada número.
 */
export function homeBannerStatDeltas(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): HomeBannerStat[] {
  if (!after) return [];
  return (Object.keys(STAT_OF) as Array<keyof typeof STAT_OF>)
    .filter((mark) => after[mark] != null && before?.[mark] == null)
    .map((mark) => STAT_OF[mark]);
}

export const onHomeBannerStateWritten = onDocumentWritten("users/{uid}/homeBanners/{bannerId}", async (event) => {
  const stats = homeBannerStatDeltas(event.data?.before.data(), event.data?.after.data());
  if (stats.length === 0) return;
  const db = getFirestore();
  const bannerId = event.params.bannerId;
  // A rule aceita qualquer id bem formado: só conta banner que existe na fonte.
  const source = await db.collection(HOME_BANNERS_ADMIN_COLLECTION).doc(HOME_BANNERS_DOC).get();
  const known = (source.data()?.["banners"] as Array<{id?: unknown}> | undefined) ?? [];
  if (!known.some((b) => b?.id === bannerId)) return;
  const update: Record<string, unknown> = {updatedAt: new Date()};
  for (const stat of stats) update[stat] = FieldValue.increment(1);
  await db.collection(HOME_BANNER_STATS).doc(bannerId).set(update, {merge: true});
});
