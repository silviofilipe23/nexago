/**
 * App do atleta: Central de ajuda, os guias "como usar" de cada função (backoffice › App do atleta ›
 * Central de ajuda).
 *
 *   appAdminConfig/appGuide — a fonte: `{categories, version, updatedAt, updatedBy}`, com os guias em
 *                             rascunho; só o admin lê.
 *   appConfig/appGuide      — o que o app lê (`nexago_app/lib/features/app_guide/domain/app_guide.dart`):
 *                             só os guias publicados, e só as categorias que têm algum.
 *
 * `saveAppGuide` é a única porta de escrita (as rules negam cliente) e grava fonte e espelho na mesma
 * transação, como `saveAppNews`. O guia tem o formato da funcionalidade das Novidades
 * (`AppNewsFeature.fromMap` com até 6 passos), sem os stories. Antes do primeiro save o conteúdo vem
 * do `seed-app-guide.js`, gravado direto no espelho; o backoffice importa de lá.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import {callerCanAccessBackoffice} from "./auth-roles";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {HOME_BANNER_DESTINATIONS, type Actor, type HomeBannerDestination} from "./home-banners";

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

export const APP_GUIDE_ADMIN_COLLECTION = "appAdminConfig";
export const APP_GUIDE_PUBLIC_COLLECTION = "appConfig";
export const APP_GUIDE_DOC = "appGuide";

/**
 * Espelha `backoffice/.../app/ajuda/data/app-guide.ts` — mudar os dois. Os textos cabem mais que nas
 * Novidades: o guia só aparece em lista e detalhe (sem stories nem destaque) e o seed de 27/10 tem
 * título de 28, passo de 106 e descrição de 211 caracteres.
 */
export const MAX_APP_GUIDE_CATEGORIES = 12;
export const MAX_APP_GUIDE_TOPICS = 12;
/** `AppGuideCategory.maxSteps` no app: passo além disso é cortado. */
export const MAX_APP_GUIDE_STEPS = 6;
export const APP_GUIDE_CATEGORY_TITLE_MAX = 24;
export const APP_GUIDE_TITLE_MAX = 32;
export const APP_GUIDE_SUMMARY_MAX = 90;
export const APP_GUIDE_DESCRIPTION_MAX = 320;
export const APP_GUIDE_STEP_MAX = 140;
export const APP_GUIDE_WHERE_MAX = 80;
export const APP_GUIDE_CTA_MAX = 20;
const URL_MAX = 1000;
/** Categoria e guia: o guia é parâmetro de rota no app (`/athlete/ajuda/:topicId`). */
const ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;

/**
 * Ícone quando o destino sozinho não diz o bastante, ou quando não há destino (`AppNewsIcon` no
 * app). Todo build que tem a Central de ajuda conhece as oito; chave nova aqui exige o app que a
 * conhece (build antigo cai no ícone do destino).
 */
export const APP_GUIDE_ICONS = ["map", "invite", "cancel", "story", "handshake", "focus", "chat", "star"] as const;
export type AppGuideIcon = (typeof APP_GUIDE_ICONS)[number];

export interface AppGuideTopicInput {
  id: string;
  title: string;
  /** Uma linha: lista e busca. */
  summary: string;
  /** O parágrafo do detalhe; vazio, o app usa o resumo. */
  description: string;
  /** "Como funciona", até 6. */
  steps: string[];
  /** "Onde encontrar" (ex.: "Agenda › sua reserva › Ações"). */
  where: string;
  ctaLabel: string;
  /** As chaves do banner da Home; `null` = sem botão. */
  destination: HomeBannerDestination | null;
  /** Só com `destination: "url"`: endereço https aberto fora do app. */
  url: string | null;
  imageUrl: string | null;
  /** `null` = ícone do destino. */
  icon: AppGuideIcon | null;
  /** `false` = rascunho: guardado, nunca vai ao app. */
  published: boolean;
}

export interface AppGuideCategoryInput {
  id: string;
  title: string;
  /** Na ordem da tela do app. */
  topics: AppGuideTopicInput[];
}

export interface SaveAppGuideInput {
  /** Na ordem da tela do app. */
  categories: AppGuideCategoryInput[];
  /** A `version` lida pela tela; outra pessoa salvou no meio = recusa. Doc ausente = 0. */
  version: number;
}

/** Guia como o app lê: campos opcionais só quando têm valor. */
export interface PublicAppGuideTopic {
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
  icon?: AppGuideIcon;
}

export interface PublicAppGuideCategory {
  id: string;
  title: string;
  topics: PublicAppGuideTopic[];
}

function invalidFields(fields: string[]): HttpsError {
  return new HttpsError("invalid-argument", "Dados inválidos.", {fields: [...new Set(fields)].sort()});
}

function text(v: unknown, min: number, max: number): boolean {
  return typeof v === "string" && v.trim().length >= min && v.trim().length <= max;
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
 * Campos inválidos de um guia, como `<at>.<campo>`. Rascunho pode ficar incompleto (só os tetos
 * valem); publicado exige título, o texto do botão quando há destino e o link do destino externo —
 * sem isso o app esconde o guia ou mostra sem botão.
 */
export function appGuideTopicErrors(t: AppGuideTopicInput, at: string): string[] {
  const field = (name: string) => `${at}.${name}`;
  if (t === null || typeof t !== "object") return [field("id")];
  const fields: string[] = [];
  const published = t.published === true;
  if (typeof t.id !== "string" || !ID_RE.test(t.id)) fields.push(field("id"));
  if (!text(t.title, published ? 1 : 0, APP_GUIDE_TITLE_MAX)) fields.push(field("title"));
  if (!text(t.summary, 0, APP_GUIDE_SUMMARY_MAX)) fields.push(field("summary"));
  if (!text(t.description, 0, APP_GUIDE_DESCRIPTION_MAX)) fields.push(field("description"));
  if (
    !Array.isArray(t.steps) ||
    t.steps.length > MAX_APP_GUIDE_STEPS ||
    t.steps.some((s) => !text(s, 0, APP_GUIDE_STEP_MAX))
  ) {
    fields.push(field("steps"));
  }
  if (!text(t.where, 0, APP_GUIDE_WHERE_MAX)) fields.push(field("where"));
  const hasDestination = t.destination !== null;
  if (!text(t.ctaLabel, published && hasDestination ? 1 : 0, APP_GUIDE_CTA_MAX)) fields.push(field("ctaLabel"));
  if (hasDestination && !oneOf(HOME_BANNER_DESTINATIONS, t.destination)) {
    fields.push(field("destination"));
  } else if (t.destination === "url") {
    // Rascunho guarda o destino sem o link ainda; publicado precisa de um https.
    if (t.url === null ? published : !isHttps(t.url, URL_MAX)) fields.push(field("url"));
  } else if (t.url !== null) {
    fields.push(field("url"));
  }
  if (t.imageUrl !== null && !isHttps(t.imageUrl, 2048)) fields.push(field("imageUrl"));
  if (t.icon !== null && !oneOf(APP_GUIDE_ICONS, t.icon)) fields.push(field("icon"));
  if (typeof t.published !== "boolean") fields.push(field("published"));
  return fields;
}

/** Campos inválidos de uma categoria, como `categories.<i>.<campo>`. Categoria pode ficar vazia. */
export function appGuideCategoryErrors(c: AppGuideCategoryInput, index: number): string[] {
  const at = (name: string) => `categories.${index}.${name}`;
  if (c === null || typeof c !== "object") return [at("id")];
  const fields: string[] = [];
  if (typeof c.id !== "string" || !ID_RE.test(c.id)) fields.push(at("id"));
  if (!text(c.title, 1, APP_GUIDE_CATEGORY_TITLE_MAX)) fields.push(at("title"));
  if (!Array.isArray(c.topics) || c.topics.length > MAX_APP_GUIDE_TOPICS) {
    fields.push(at("topics"));
  } else {
    c.topics.forEach((t, j) => fields.push(...appGuideTopicErrors(t, at(`topics.${j}`))));
  }
  return fields;
}

/**
 * Todos os campos inválidos. Id de categoria não repete, e o de guia não repete nem entre categorias:
 * o app abre o guia pelo id, em qualquer categoria, e o primeiro achado ganharia.
 */
export function appGuideErrors(input: SaveAppGuideInput): string[] {
  if (!input || typeof input !== "object") return ["categories"];
  const fields: string[] = [];
  if (typeof input.version !== "number" || !Number.isInteger(input.version) || input.version < 0) {
    fields.push("version");
  }
  if (!Array.isArray(input.categories) || input.categories.length > MAX_APP_GUIDE_CATEGORIES) {
    return [...fields, "categories"];
  }
  const categoryIds = new Set<string>();
  const topicIds = new Set<string>();
  input.categories.forEach((c, i) => {
    fields.push(...appGuideCategoryErrors(c, i));
    if (typeof c?.id === "string") {
      if (categoryIds.has(c.id)) fields.push(`categories.${i}.id`);
      categoryIds.add(c.id);
    }
    if (Array.isArray(c?.topics)) {
      c.topics.forEach((t, j) => {
        if (typeof t?.id !== "string") return;
        if (topicIds.has(t.id)) fields.push(`categories.${i}.topics.${j}.id`);
        topicIds.add(t.id);
      });
    }
  });
  return fields;
}

/** Guia validado → como fica guardado: só os campos conhecidos, textos aparados. */
export function storedAppGuideTopic(t: AppGuideTopicInput): AppGuideTopicInput {
  return {
    id: t.id,
    title: t.title.trim(),
    summary: t.summary.trim(),
    description: t.description.trim(),
    steps: t.steps.map((s) => s.trim()).filter((s) => s.length > 0),
    where: t.where.trim(),
    // Sem destino o app não mostra botão: texto guardado só confundiria a próxima edição.
    ctaLabel: t.destination === null ? "" : t.ctaLabel.trim(),
    destination: t.destination,
    url: t.destination === "url" ? t.url : null,
    imageUrl: t.imageUrl,
    icon: t.icon,
    published: t.published,
  };
}

export function storedAppGuideCategory(c: AppGuideCategoryInput): AppGuideCategoryInput {
  return {id: c.id, title: c.title.trim(), topics: c.topics.map(storedAppGuideTopic)};
}

function publicTopic(t: AppGuideTopicInput): PublicAppGuideTopic {
  return {
    id: t.id,
    title: t.title,
    summary: t.summary,
    description: t.description,
    steps: t.steps,
    where: t.where,
    ctaLabel: t.ctaLabel,
    ...(t.destination !== null ? {destination: t.destination} : {}),
    ...(t.url !== null ? {url: t.url} : {}),
    ...(t.imageUrl !== null ? {imageUrl: t.imageUrl} : {}),
    ...(t.icon !== null ? {icon: t.icon} : {}),
  };
}

/** O espelho do app: só os guias publicados, na ordem; categoria sem nenhum fica de fora. */
export function publicAppGuide(categories: readonly AppGuideCategoryInput[]): PublicAppGuideCategory[] {
  return categories
    .map((c) => ({id: c.id, title: c.title, topics: c.topics.filter((t) => t.published).map(publicTopic)}))
    .filter((c) => c.topics.length > 0);
}

function currentVersion(data: Record<string, unknown> | undefined): number {
  const v = data?.["version"];
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 0;
}

export async function saveAppGuideCore(
  db: Firestore,
  input: SaveAppGuideInput,
  actor: Actor,
  now: Date,
): Promise<{version: number; categories: AppGuideCategoryInput[]}> {
  const errors = appGuideErrors(input);
  if (errors.length > 0) throw invalidFields(errors);
  const categories = input.categories.map(storedAppGuideCategory);
  const source = db.collection(APP_GUIDE_ADMIN_COLLECTION).doc(APP_GUIDE_DOC);
  const mirror = db.collection(APP_GUIDE_PUBLIC_COLLECTION).doc(APP_GUIDE_DOC);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(source);
    const current = snap.exists ? snap.data()! : undefined;
    if (currentVersion(current) !== input.version) {
      throw new HttpsError(
        "failed-precondition",
        "A Central de ajuda foi alterada por outra pessoa. Recarregue antes de salvar.",
        {updatedBy: current?.["updatedBy"] ?? null},
      );
    }
    const version = input.version + 1;
    tx.set(source, {categories, version, updatedAt: now, updatedBy: actor});
    tx.set(mirror, {categories: publicAppGuide(categories), updatedAt: now});
    return {version, categories};
  });
}

async function assertAppGuideAdmin(uid: string): Promise<Actor> {
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
    throw new HttpsError("permission-denied", "Apenas administradores da plataforma podem editar a Central de ajuda.");
  }
  return {uid, name: caller.displayName ?? caller.email ?? uid};
}

export const saveAppGuide = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const actor = await assertAppGuideAdmin(uid);
  return saveAppGuideCore(getFirestore(), (request.data ?? {}) as SaveAppGuideInput, actor, new Date());
});
