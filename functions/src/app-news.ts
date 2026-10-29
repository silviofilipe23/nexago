/**
 * App do atleta: tela de Novidades e stories pós-atualização (backoffice › App do atleta › Novidades).
 *
 *   appAdminConfig/appNews — a fonte: `{releases, version, updatedAt, updatedBy}`, com os rascunhos;
 *                            só o admin lê.
 *   appConfig/appNews      — o que o app lê (`nexago_app/lib/features/app_news/domain/app_news.dart`):
 *                            só as versões publicadas, sem os estados de bastidor.
 *
 * `saveAppNews` é a única porta de escrita (as rules negam cliente) e grava fonte e espelho na mesma
 * transação, como `saveHomeBanners`. Quem decide quem vê é o app: versão com `build` maior que o
 * instalado fica escondida, então dá para publicar antes de a loja liberar. A data é a do
 * lançamento: os stories só abrem para contas criadas antes dela.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import {callerCanAccessBackoffice} from "./auth-roles";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {HOME_BANNER_DESTINATIONS, type Actor, type HomeBannerDestination} from "./home-banners";
import {saoPauloDate} from "./store-checkout-price";

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

export const APP_NEWS_ADMIN_COLLECTION = "appAdminConfig";
export const APP_NEWS_PUBLIC_COLLECTION = "appConfig";
export const APP_NEWS_DOC = "appNews";

/** Espelha `backoffice/.../app/versoes/data/app-news.ts` — mudar os dois. */
export const MAX_APP_NEWS_RELEASES = 40;
export const MAX_APP_NEWS_FEATURES = 8;
export const MAX_APP_NEWS_STEPS = 4;
export const MAX_APP_NEWS_IMPROVEMENTS = 12;
export const APP_NEWS_TITLE_MAX = 22;
export const APP_NEWS_SUMMARY_MAX = 60;
export const APP_NEWS_DESCRIPTION_MAX = 240;
export const APP_NEWS_STEP_MAX = 80;
export const APP_NEWS_WHERE_MAX = 60;
export const APP_NEWS_CTA_MAX = 16;
export const APP_NEWS_IMPROVEMENT_MAX = 90;
const URL_MAX = 1000;
/** O que o atleta lê: "1.0.15". */
const VERSION_RE = /^\d{1,3}(\.\d{1,3}){1,3}$/;
/** Chave do "Já usou" no aparelho: única entre todas as versões. */
const FEATURE_ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BUILD_MAX = 999_999;

/**
 * Ícone quando o destino sozinho não diz o bastante (`AppNewsIcon` no app). Chave nova aqui exige
 * o app que a conhece: build antigo cai no ícone do destino.
 */
export const APP_NEWS_ICONS = ["map", "invite", "rain"] as const;
export type AppNewsIcon = (typeof APP_NEWS_ICONS)[number];

export interface AppNewsFeatureInput {
  id: string;
  title: string;
  /** Uma linha: lista e stories. */
  summary: string;
  /** O parágrafo do detalhe; vazio, o app usa o resumo. */
  description: string;
  /** "Como funciona", até 4. */
  steps: string[];
  /** "Onde encontrar" (ex.: "Início › Ações rápidas"). */
  where: string;
  ctaLabel: string;
  /** As chaves do banner da Home; `null` = só informativa, sem botão. */
  destination: HomeBannerDestination | null;
  /** Só com `destination: "url"`: endereço https aberto fora do app. */
  url: string | null;
  imageUrl: string | null;
  /** `null` = ícone do destino. */
  icon: AppNewsIcon | null;
  /** `false` = fica só na tela, fora dos stories. */
  stories: boolean;
}

export interface AppNewsReleaseInput {
  version: string;
  /** Build number da loja (o `+N` do pubspec). */
  build: number;
  /** Data civil de São Paulo (YYYY-MM-DD); `null` = a do dia em que for publicada. */
  date: string | null;
  /** `false` = a versão não abre stories depois de atualizar. */
  stories: boolean;
  features: AppNewsFeatureInput[];
  improvements: string[];
  /** `false` = rascunho: guardado, nunca vai ao app. */
  published: boolean;
}

export interface SaveAppNewsInput {
  releases: AppNewsReleaseInput[];
  /** A `version` lida pela tela; outra pessoa salvou no meio = recusa. Doc ausente = 0. */
  version: number;
}

/** Funcionalidade como o app lê: campos opcionais só quando têm valor. */
export interface PublicAppNewsFeature {
  id: string;
  title: string;
  summary: string;
  description: string;
  steps: string[];
  where: string;
  ctaLabel: string;
  destination?: HomeBannerDestination;
  url?: string;
  imageUrl?: string;
  icon?: AppNewsIcon;
  stories: boolean;
}

export interface PublicAppNewsRelease {
  version: string;
  build: number;
  date: string;
  stories: boolean;
  features: PublicAppNewsFeature[];
  improvements: string[];
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
 * Campos inválidos de uma funcionalidade, como `<at>.<campo>`. Rascunho pode ficar incompleto (só
 * os tetos valem); publicada exige título, o texto do botão quando há destino e o link do destino
 * externo — o que falta disso o app esconde ou mostra sem botão.
 */
export function appNewsFeatureErrors(f: AppNewsFeatureInput, at: string, published: boolean): string[] {
  const field = (name: string) => `${at}.${name}`;
  if (f === null || typeof f !== "object") return [field("id")];
  const fields: string[] = [];
  if (typeof f.id !== "string" || !FEATURE_ID_RE.test(f.id)) fields.push(field("id"));
  if (!text(f.title, published ? 1 : 0, APP_NEWS_TITLE_MAX)) fields.push(field("title"));
  if (!text(f.summary, 0, APP_NEWS_SUMMARY_MAX)) fields.push(field("summary"));
  if (!text(f.description, 0, APP_NEWS_DESCRIPTION_MAX)) fields.push(field("description"));
  if (
    !Array.isArray(f.steps) ||
    f.steps.length > MAX_APP_NEWS_STEPS ||
    f.steps.some((s) => !text(s, 0, APP_NEWS_STEP_MAX))
  ) {
    fields.push(field("steps"));
  }
  if (!text(f.where, 0, APP_NEWS_WHERE_MAX)) fields.push(field("where"));
  const hasDestination = f.destination !== null;
  if (!text(f.ctaLabel, published && hasDestination ? 1 : 0, APP_NEWS_CTA_MAX)) fields.push(field("ctaLabel"));
  if (hasDestination && !oneOf(HOME_BANNER_DESTINATIONS, f.destination)) {
    fields.push(field("destination"));
  } else if (f.destination === "url") {
    // Rascunho guarda o destino sem o link ainda; publicada precisa de um https.
    if (f.url === null ? published : !isHttps(f.url, URL_MAX)) fields.push(field("url"));
  } else if (f.url !== null) {
    fields.push(field("url"));
  }
  if (f.imageUrl !== null && !isHttps(f.imageUrl, 2048)) fields.push(field("imageUrl"));
  if (f.icon !== null && !oneOf(APP_NEWS_ICONS, f.icon)) fields.push(field("icon"));
  if (typeof f.stories !== "boolean") fields.push(field("stories"));
  return fields;
}

/** Campos inválidos de uma versão, como `releases.<i>.<campo>`. Publicada precisa de funcionalidade. */
export function appNewsReleaseErrors(r: AppNewsReleaseInput, index: number): string[] {
  const at = (name: string) => `releases.${index}.${name}`;
  if (r === null || typeof r !== "object") return [at("version")];
  const fields: string[] = [];
  const published = r.published === true;
  if (typeof r.version !== "string" || !VERSION_RE.test(r.version.trim())) fields.push(at("version"));
  if (typeof r.build !== "number" || !Number.isInteger(r.build) || r.build < 1 || r.build > BUILD_MAX) {
    fields.push(at("build"));
  }
  if (r.date !== null && !isDate(r.date)) fields.push(at("date"));
  if (typeof r.stories !== "boolean") fields.push(at("stories"));
  if (typeof r.published !== "boolean") fields.push(at("published"));
  if (
    !Array.isArray(r.features) ||
    r.features.length > MAX_APP_NEWS_FEATURES ||
    (published && r.features.length === 0)
  ) {
    fields.push(at("features"));
  } else {
    r.features.forEach((f, j) => fields.push(...appNewsFeatureErrors(f, at(`features.${j}`), published)));
  }
  if (!Array.isArray(r.improvements) || r.improvements.length > MAX_APP_NEWS_IMPROVEMENTS) {
    fields.push(at("improvements"));
  } else {
    r.improvements.forEach((item, k) => {
      if (!text(item, 1, APP_NEWS_IMPROVEMENT_MAX)) fields.push(at(`improvements.${k}`));
    });
  }
  return fields;
}

/**
 * Todos os campos inválidos. Versão e build não repetem (os stories saem uma vez por versão; o app
 * ordena por build) e o id da funcionalidade não repete entre versões (é a chave do "Já usou").
 */
export function appNewsErrors(input: SaveAppNewsInput): string[] {
  if (!input || typeof input !== "object") return ["releases"];
  const fields: string[] = [];
  if (typeof input.version !== "number" || !Number.isInteger(input.version) || input.version < 0) {
    fields.push("version");
  }
  if (!Array.isArray(input.releases) || input.releases.length > MAX_APP_NEWS_RELEASES) {
    return [...fields, "releases"];
  }
  const versions = new Set<string>();
  const builds = new Set<number>();
  const featureIds = new Set<string>();
  input.releases.forEach((r, i) => {
    fields.push(...appNewsReleaseErrors(r, i));
    if (typeof r?.version === "string") {
      if (versions.has(r.version.trim())) fields.push(`releases.${i}.version`);
      versions.add(r.version.trim());
    }
    if (typeof r?.build === "number") {
      if (builds.has(r.build)) fields.push(`releases.${i}.build`);
      builds.add(r.build);
    }
    if (Array.isArray(r?.features)) {
      r.features.forEach((f, j) => {
        if (typeof f?.id !== "string") return;
        if (featureIds.has(f.id)) fields.push(`releases.${i}.features.${j}.id`);
        featureIds.add(f.id);
      });
    }
  });
  return fields;
}

/** Funcionalidade validada → como fica guardada: só os campos conhecidos, textos aparados. */
export function storedAppNewsFeature(f: AppNewsFeatureInput): AppNewsFeatureInput {
  return {
    id: f.id,
    title: f.title.trim(),
    summary: f.summary.trim(),
    description: f.description.trim(),
    steps: f.steps.map((s) => s.trim()).filter((s) => s.length > 0),
    where: f.where.trim(),
    // Sem destino o app não mostra botão: texto guardado só confundiria a próxima edição.
    ctaLabel: f.destination === null ? "" : f.ctaLabel.trim(),
    destination: f.destination,
    url: f.destination === "url" ? f.url : null,
    imageUrl: f.imageUrl,
    icon: f.icon,
    stories: f.stories,
  };
}

/** Versão validada → como fica guardada. Publicada sem data ganha a de `today` e não muda mais. */
export function storedAppNewsRelease(r: AppNewsReleaseInput, today: string): AppNewsReleaseInput {
  return {
    version: r.version.trim(),
    build: r.build,
    date: r.date ?? (r.published ? today : null),
    stories: r.stories,
    features: r.features.map(storedAppNewsFeature),
    improvements: r.improvements.map((item) => item.trim()),
    published: r.published,
  };
}

function publicFeature(f: AppNewsFeatureInput): PublicAppNewsFeature {
  return {
    id: f.id,
    title: f.title,
    summary: f.summary,
    description: f.description,
    steps: f.steps,
    where: f.where,
    ctaLabel: f.ctaLabel,
    ...(f.destination !== null ? {destination: f.destination} : {}),
    ...(f.url !== null ? {url: f.url} : {}),
    ...(f.imageUrl !== null ? {imageUrl: f.imageUrl} : {}),
    ...(f.icon !== null ? {icon: f.icon} : {}),
    stories: f.stories,
  };
}

/** O espelho do app: só as publicadas (já guardadas, com data), da mais nova para a mais antiga. */
export function publicAppNews(releases: readonly AppNewsReleaseInput[]): PublicAppNewsRelease[] {
  return releases
    .filter((r) => r.published && r.date !== null)
    .sort((a, b) => b.build - a.build)
    .map((r) => ({
      version: r.version,
      build: r.build,
      date: r.date!,
      stories: r.stories,
      features: r.features.map(publicFeature),
      improvements: r.improvements,
    }));
}

function currentVersion(data: Record<string, unknown> | undefined): number {
  const v = data?.["version"];
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 0;
}

export async function saveAppNewsCore(
  db: Firestore,
  input: SaveAppNewsInput,
  actor: Actor,
  now: Date,
): Promise<{version: number; releases: AppNewsReleaseInput[]}> {
  const errors = appNewsErrors(input);
  if (errors.length > 0) throw invalidFields(errors);
  const today = saoPauloDate(now);
  const releases = input.releases.map((r) => storedAppNewsRelease(r, today)).sort((a, b) => b.build - a.build);
  const source = db.collection(APP_NEWS_ADMIN_COLLECTION).doc(APP_NEWS_DOC);
  const mirror = db.collection(APP_NEWS_PUBLIC_COLLECTION).doc(APP_NEWS_DOC);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(source);
    const current = snap.exists ? snap.data()! : undefined;
    if (currentVersion(current) !== input.version) {
      throw new HttpsError(
        "failed-precondition",
        "As novidades foram alteradas por outra pessoa. Recarregue antes de salvar.",
        {updatedBy: current?.["updatedBy"] ?? null},
      );
    }
    const version = input.version + 1;
    tx.set(source, {releases, version, updatedAt: now, updatedBy: actor});
    tx.set(mirror, {releases: publicAppNews(releases), updatedAt: now});
    return {version, releases};
  });
}

async function assertAppNewsAdmin(uid: string): Promise<Actor> {
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
    throw new HttpsError("permission-denied", "Apenas administradores da plataforma podem editar as novidades do app.");
  }
  return {uid, name: caller.displayName ?? caller.email ?? uid};
}

export const saveAppNews = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const actor = await assertAppNewsAdmin(uid);
  return saveAppNewsCore(getFirestore(), (request.data ?? {}) as SaveAppNewsInput, actor, new Date());
});
