/**
 * Blog nexaGO (backoffice › Conteúdo › Blog; app do atleta e site leem).
 *
 *   blogPosts/{postId}                         — o post. Leitura pública só publicado; escrita só aqui.
 *   blogSlugs/{slug}                           — reserva do endereço `/blog/{slug}`, na mesma transação.
 *   blogPosts/{postId}/reactions/{uid}         — "Ajudou" do atleta; o gatilho mantém `helpfulCount`.
 *   users/{uid}/blogLibrary/{postId}           — salvo/progresso do atleta; o gatilho mantém `readCount`.
 *
 * `saveBlogPost` é a única porta de escrita do post. "Agendado" é um status de verdade (não "publicado
 * com data futura"), porque a rule pública não consegue comparar `publishAt` com a hora da consulta:
 * `publishScheduledBlogPosts` vira o status quando a hora passa. Spec:
 * `docs/superpowers/specs/2026-11-05-blog-fase-1-design.md`.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import {getFirestore, FieldValue, Timestamp, type Firestore} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import {callerCanAccessBackoffice} from "./auth-roles";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {HOME_BANNER_DESTINATIONS, type Actor, type HomeBannerDestination} from "./home-banners";
import {resolveSport} from "./sports/catalog";

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

export const BLOG_POSTS = "blogPosts";
export const BLOG_SLUGS = "blogSlugs";

/** Espelha `backoffice/.../conteudo/blog/data/blog-post.ts` — mudar os dois. */
export const BLOG_CATEGORIES = ["torneios", "treino", "regras", "arenas", "guia", "loja"] as const;
export const BLOG_STATUSES = ["draft", "review", "scheduled", "published"] as const;
export const BLOG_TITLE_MAX = 90;
export const BLOG_SUBTITLE_MAX = 160;
export const BLOG_SEO_DESCRIPTION_MAX = 155;
export const BLOG_SLUG_MAX = 80;
export const BLOG_TAGS_MAX = 8;
export const BLOG_TAG_MAX = 24;
export const BLOG_AUTHOR_FIELD_MAX = 40;
export const BLOG_BLOCKS_MAX = 80;
export const BLOG_PARAGRAPH_MAX = 2000;
export const BLOG_HEADING_MAX = 90;
export const BLOG_LIST_ITEMS_MAX = 12;
export const BLOG_LIST_ITEM_MAX = 300;
export const BLOG_QUOTE_MAX = 300;
export const BLOG_CAPTION_MAX = 140;
export const BLOG_CTA_LABEL_MAX = 32;
const URL_MAX = 1000;
const WORDS_PER_MINUTE = 200;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];
export type BlogStatus = (typeof BLOG_STATUSES)[number];

export type BlogBlock =
  | {type: "paragraph"; text: string}
  | {type: "heading"; text: string}
  | {type: "list"; items: string[]}
  | {type: "quote"; text: string}
  | {type: "image"; url: string; caption: string};

export interface BlogCta {
  label: string;
  destination: HomeBannerDestination;
  /** Só com `destination: "url"`. */
  url: string | null;
}

export interface BlogPostInput {
  title: string;
  subtitle: string;
  slug: string;
  seoDescription: string;
  coverUrl: string | null;
  category: BlogCategory;
  sport: string;
  tags: string[];
  author: {name: string; role: string};
  body: BlogBlock[];
  cta: BlogCta | null;
  channels: {app: boolean; site: boolean};
  featured: boolean;
  status: BlogStatus;
  /** ISO 8601. Obrigatório só para `scheduled`; ignorado ao publicar agora. */
  publishAt: string | null;
}

export interface SaveBlogPostInput {
  /** `null` = post novo. */
  id: string | null;
  /** A versão que o editor leu (0 para post novo). */
  version: number;
  post: BlogPostInput;
}

export interface SaveBlogPostResult {
  id: string;
  version: number;
  slug: string;
  status: BlogStatus;
  publishAt: string | null;
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isHttps = (v: unknown): v is string => isStr(v) && v.length <= URL_MAX && /^https:\/\/\S+$/.test(v);

/** Tira espaço das pontas e junta espaços repetidos de uma linha. */
function line(v: string): string {
  return v.replace(/\s+/g, " ").trim();
}

/** Texto de parágrafo: preserva quebra de linha, tira espaço das pontas de cada uma. */
function paragraph(v: string): string {
  return v
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** "Liga nexaGO: tudo sobre a 2ª etapa" → "liga-nexago-tudo-sobre-a-2a-etapa". */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ª/g, "a")
    .replace(/º/g, "o")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, BLOG_SLUG_MAX)
    .replace(/-+$/g, "");
}

function blockErrors(block: unknown, n: number): string[] {
  const b = block as Record<string, unknown>;
  const where = `Bloco ${n}`;
  switch (b?.["type"]) {
  case "paragraph":
    if (!isStr(b["text"]) || !paragraph(b["text"])) return [`${where}: parágrafo vazio.`];
    if (paragraph(b["text"]).length > BLOG_PARAGRAPH_MAX) return [`${where}: parágrafo passa de ${BLOG_PARAGRAPH_MAX} caracteres.`];
    return [];
  case "heading":
    if (!isStr(b["text"]) || !line(b["text"])) return [`${where}: subtítulo vazio.`];
    if (line(b["text"]).length > BLOG_HEADING_MAX) return [`${where}: subtítulo passa de ${BLOG_HEADING_MAX} caracteres.`];
    return [];
  case "quote":
    if (!isStr(b["text"]) || !line(b["text"])) return [`${where}: destaque vazio.`];
    if (line(b["text"]).length > BLOG_QUOTE_MAX) return [`${where}: destaque passa de ${BLOG_QUOTE_MAX} caracteres.`];
    return [];
  case "list": {
    const items = b["items"];
    if (!Array.isArray(items) || !items.every(isStr)) return [`${where}: lista inválida.`];
    const filled = items.map(line).filter(Boolean);
    if (filled.length === 0) return [`${where}: lista vazia.`];
    if (filled.length > BLOG_LIST_ITEMS_MAX) return [`${where}: lista passa de ${BLOG_LIST_ITEMS_MAX} itens.`];
    if (filled.some((i) => i.length > BLOG_LIST_ITEM_MAX)) return [`${where}: item passa de ${BLOG_LIST_ITEM_MAX} caracteres.`];
    return [];
  }
  case "image":
    if (!isHttps(b["url"])) return [`${where}: imagem sem endereço https.`];
    if (!isStr(b["caption"])) return [`${where}: legenda inválida.`];
    if (line(b["caption"]).length > BLOG_CAPTION_MAX) return [`${where}: legenda passa de ${BLOG_CAPTION_MAX} caracteres.`];
    return [];
  default:
    return [`${where}: tipo desconhecido.`];
  }
}

/** Erros de validação em português, um por problema. Vazio = válido. */
export function blogPostErrors(input: unknown, now: Date): string[] {
  const p = input as Partial<BlogPostInput> | null;
  if (!p || typeof p !== "object") return ["Post inválido."];
  const errors: string[] = [];

  if (!isStr(p.title) || !line(p.title)) errors.push("Dê um título ao post.");
  else if (line(p.title).length > BLOG_TITLE_MAX) errors.push(`Título passa de ${BLOG_TITLE_MAX} caracteres.`);
  if (!isStr(p.subtitle)) errors.push("Subtítulo inválido.");
  else if (line(p.subtitle).length > BLOG_SUBTITLE_MAX) errors.push(`Subtítulo passa de ${BLOG_SUBTITLE_MAX} caracteres.`);
  if (!isStr(p.slug) || !SLUG_RE.test(p.slug) || p.slug.length > BLOG_SLUG_MAX) {
    errors.push("Endereço inválido: use letras minúsculas, números e hífen.");
  }
  if (!isStr(p.seoDescription)) errors.push("Descrição inválida.");
  else if (line(p.seoDescription).length > BLOG_SEO_DESCRIPTION_MAX) {
    errors.push(`Descrição passa de ${BLOG_SEO_DESCRIPTION_MAX} caracteres.`);
  }
  if (p.coverUrl !== null && !isHttps(p.coverUrl)) errors.push("Capa sem endereço https.");
  if (!BLOG_CATEGORIES.includes(p.category as BlogCategory)) errors.push("Escolha uma categoria.");
  if (p.sport !== "all" && !resolveSport(p.sport)) errors.push("Esporte desconhecido.");

  if (!Array.isArray(p.tags) || !p.tags.every(isStr)) errors.push("Tags inválidas.");
  else {
    const tags = p.tags.map(line).filter(Boolean);
    if (tags.length > BLOG_TAGS_MAX) errors.push(`Até ${BLOG_TAGS_MAX} tags.`);
    if (tags.some((t) => t.length > BLOG_TAG_MAX)) errors.push(`Tag passa de ${BLOG_TAG_MAX} caracteres.`);
  }

  const author = p.author as {name?: unknown; role?: unknown} | undefined;
  if (!author || !isStr(author.name) || !line(author.name)) errors.push("Informe o autor.");
  else if (line(author.name).length > BLOG_AUTHOR_FIELD_MAX) errors.push(`Nome do autor passa de ${BLOG_AUTHOR_FIELD_MAX} caracteres.`);
  if (author && (!isStr(author.role) || line(author.role).length > BLOG_AUTHOR_FIELD_MAX)) {
    errors.push(`Função do autor passa de ${BLOG_AUTHOR_FIELD_MAX} caracteres.`);
  }

  if (!Array.isArray(p.body) || p.body.length === 0) errors.push("Escreva o corpo do post.");
  else if (p.body.length > BLOG_BLOCKS_MAX) errors.push(`Até ${BLOG_BLOCKS_MAX} blocos.`);
  else p.body.forEach((b, i) => errors.push(...blockErrors(b, i + 1)));

  if (p.cta !== null) {
    const cta = p.cta as Partial<BlogCta> | undefined;
    if (!cta || !isStr(cta.label) || !line(cta.label)) errors.push("Chamada sem texto.");
    else if (line(cta.label).length > BLOG_CTA_LABEL_MAX) errors.push(`Texto da chamada passa de ${BLOG_CTA_LABEL_MAX} caracteres.`);
    if (!cta || !HOME_BANNER_DESTINATIONS.includes(cta.destination as HomeBannerDestination)) {
      errors.push("Escolha para onde a chamada leva.");
    } else if (cta.destination === "url" && !isHttps(cta.url)) {
      errors.push("Chamada para link precisa de endereço https.");
    }
  }

  const ch = p.channels as {app?: unknown; site?: unknown} | undefined;
  if (!ch || typeof ch.app !== "boolean" || typeof ch.site !== "boolean") errors.push("Canais inválidos.");
  if (typeof p.featured !== "boolean") errors.push("Destaque inválido.");

  if (!BLOG_STATUSES.includes(p.status as BlogStatus)) errors.push("Status inválido.");
  const at = p.publishAt === null || p.publishAt === undefined ? null : new Date(p.publishAt as string);
  if (at && Number.isNaN(at.getTime())) errors.push("Data de publicação inválida.");
  if (p.status === "scheduled") {
    if (!at) errors.push("Escolha data e hora para agendar.");
    else if (at.getTime() <= now.getTime()) errors.push("A data do agendamento já passou.");
  }
  if ((p.status === "scheduled" || p.status === "published") && ch && ch.app === false && ch.site === false) {
    errors.push("Escolha onde o post aparece: app, site ou os dois.");
  }
  return errors;
}

function storedBlock(b: BlogBlock): BlogBlock {
  switch (b.type) {
  case "paragraph":
    return {type: "paragraph", text: paragraph(b.text)};
  case "heading":
  case "quote":
    return {type: b.type, text: line(b.text)};
  case "list":
    return {type: "list", items: b.items.map(line).filter(Boolean)};
  case "image":
    return {type: "image", url: b.url, caption: line(b.caption)};
  }
}

function blockWords(b: BlogBlock): string {
  if (b.type === "list") return b.items.join(" ");
  if (b.type === "image") return b.caption;
  return b.text;
}

/** Minutos de leitura: título + corpo a 200 palavras/min, nunca menos de 1. */
export function readMinutes(title: string, body: BlogBlock[]): number {
  const text = [title, ...body.map(blockWords)].join(" ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** O que vai para o doc (sem datas, contadores e autoria do save). */
export function storedBlogPost(p: BlogPostInput) {
  const body = p.body.map(storedBlock);
  const title = line(p.title);
  return {
    title,
    subtitle: line(p.subtitle),
    slug: p.slug,
    seoDescription: line(p.seoDescription),
    coverUrl: p.coverUrl,
    category: p.category,
    sport: p.sport === "all" ? "all" : resolveSport(p.sport)!.code,
    tags: [...new Set(p.tags.map((t) => line(t).toLowerCase()).filter(Boolean))],
    author: {name: line(p.author.name), role: line(p.author.role)},
    body,
    cta: p.cta ? {
      label: line(p.cta.label),
      destination: p.cta.destination,
      url: p.cta.destination === "url" ? p.cta.url : null,
    } : null,
    channels: {app: p.channels.app, site: p.channels.site},
    featured: p.featured,
    readMinutes: readMinutes(title, body),
  };
}

/**
 * `publishAt` que fica gravado. Publicar agora: mantém a data de quem já estava no ar (republicar não
 * joga o post para o topo), senão agora. Rascunho/revisão: a data planejada, se houver.
 */
export function resolvedPublishAt(
  status: BlogStatus,
  requested: string | null,
  previous: {status: BlogStatus; publishAt: Timestamp | null} | null,
  now: Date,
): Timestamp | null {
  if (status === "published") {
    if (previous?.status === "published" && previous.publishAt) return previous.publishAt;
    return Timestamp.fromDate(now);
  }
  return requested ? Timestamp.fromDate(new Date(requested)) : null;
}

export async function saveBlogPostCore(
  db: Firestore,
  input: SaveBlogPostInput,
  actor: Actor,
  now: Date,
): Promise<SaveBlogPostResult> {
  if (!input || typeof input !== "object") throw new HttpsError("invalid-argument", "Post inválido.");
  if (input.id !== null && (!isStr(input.id) || !/^[A-Za-z0-9_-]{1,64}$/.test(input.id))) {
    throw new HttpsError("invalid-argument", "Post inválido.");
  }
  if (!Number.isInteger(input.version) || input.version < 0) {
    throw new HttpsError("invalid-argument", "Versão inválida. Recarregue o post.");
  }
  const errors = blogPostErrors(input.post, now);
  if (errors.length > 0) throw new HttpsError("invalid-argument", errors[0], {errors});

  const data = storedBlogPost(input.post);
  const posts = db.collection(BLOG_POSTS);
  const ref = input.id ? posts.doc(input.id) : posts.doc();
  const slugRef = db.collection(BLOG_SLUGS).doc(data.slug);

  return db.runTransaction(async (tx) => {
    const [snap, slugSnap] = await Promise.all([tx.get(ref), tx.get(slugRef)]);
    const current = snap.exists ? snap.data()! : null;
    if (input.id && !current) throw new HttpsError("not-found", "Este post não existe mais.");
    const currentVersion = typeof current?.["version"] === "number" ? current["version"] : 0;
    if (currentVersion !== input.version) {
      throw new HttpsError(
        "failed-precondition",
        "O post foi alterado por outra pessoa. Recarregue antes de salvar.",
        {updatedBy: current?.["updatedBy"] ?? null},
      );
    }
    const slugOwner = slugSnap.exists ? slugSnap.data()?.["postId"] : null;
    if (slugOwner && slugOwner !== ref.id) {
      throw new HttpsError("already-exists", "Já existe um post com esse endereço. Troque o endereço.");
    }

    const previous = current ? {
      status: current["status"] as BlogStatus,
      publishAt: (current["publishAt"] as Timestamp | null) ?? null,
    } : null;
    const publishAt = resolvedPublishAt(input.post.status, input.post.publishAt, previous, now);
    const version = input.version + 1;
    const stamp = Timestamp.fromDate(now);

    const oldSlug = current?.["slug"];
    if (isStr(oldSlug) && oldSlug !== data.slug) tx.delete(db.collection(BLOG_SLUGS).doc(oldSlug));
    if (!slugOwner) tx.set(slugRef, {postId: ref.id});

    tx.set(ref, {
      ...data,
      status: input.post.status,
      publishAt,
      helpfulCount: current?.["helpfulCount"] ?? 0,
      readCount: current?.["readCount"] ?? 0,
      createdAt: current?.["createdAt"] ?? stamp,
      updatedAt: stamp,
      updatedBy: actor,
      version,
    });
    return {
      id: ref.id,
      version,
      slug: data.slug,
      status: input.post.status,
      publishAt: publishAt ? publishAt.toDate().toISOString() : null,
    };
  });
}

export async function deleteBlogPostCore(db: Firestore, id: unknown): Promise<{deleted: true}> {
  if (!isStr(id) || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new HttpsError("invalid-argument", "Post inválido.");
  const ref = db.collection(BLOG_POSTS).doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const slug = snap.data()?.["slug"];
    if (isStr(slug)) {
      const slugRef = db.collection(BLOG_SLUGS).doc(slug);
      const slugSnap = await tx.get(slugRef);
      if (slugSnap.data()?.["postId"] === id) tx.delete(slugRef);
    }
    tx.delete(ref);
  });
  return {deleted: true};
}

/** Agendados cuja hora passou viram publicados. Devolve quantos. */
export async function publishDueBlogPosts(db: Firestore, now: Date): Promise<number> {
  const snap = await db
    .collection(BLOG_POSTS)
    .where("status", "==", "scheduled")
    .where("publishAt", "<=", Timestamp.fromDate(now))
    .limit(50)
    .get();
  for (const doc of snap.docs) {
    await doc.ref.update({status: "published", updatedAt: Timestamp.fromDate(now)});
  }
  return snap.size;
}

async function assertBlogAdmin(uid: string): Promise<Actor> {
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
    throw new HttpsError("permission-denied", "Apenas administradores da plataforma podem editar o blog.");
  }
  return {uid, name: caller.displayName ?? caller.email ?? uid};
}

export const saveBlogPost = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const actor = await assertBlogAdmin(uid);
  return saveBlogPostCore(getFirestore(), (request.data ?? {}) as SaveBlogPostInput, actor, new Date());
});

export const deleteBlogPost = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  await assertBlogAdmin(uid);
  return deleteBlogPostCore(getFirestore(), (request.data as {id?: unknown} | null)?.id);
});

export const publishScheduledBlogPosts = onSchedule({schedule: "every 5 minutes"}, async () => {
  const count = await publishDueBlogPosts(getFirestore(), new Date());
  if (count > 0) logger.info("publishScheduledBlogPosts: posts publicados", {count});
});

/** +1/-1 conforme o doc passou a existir ou deixou de existir. */
export function existenceDelta(before: boolean, after: boolean): number {
  if (!before && after) return 1;
  if (before && !after) return -1;
  return 0;
}

export const onBlogReactionWritten = onDocumentWritten(
  "blogPosts/{postId}/reactions/{uid}",
  async (event) => {
    const delta = existenceDelta(!!event.data?.before.exists, !!event.data?.after.exists);
    if (delta === 0) return;
    try {
      await getFirestore().collection(BLOG_POSTS).doc(event.params.postId)
        .update({helpfulCount: FieldValue.increment(delta)});
    } catch (error) {
      // Post apagado: não há contador para manter.
      logger.warn("onBlogReactionWritten: post sem doc", {postId: event.params.postId, error});
    }
  },
);

/** Conta um leitor quando `readStartedAt` aparece pela primeira vez na biblioteca do atleta. */
export function startedReading(before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined): boolean {
  return !before?.["readStartedAt"] && !!after?.["readStartedAt"];
}

export const onBlogLibraryWritten = onDocumentWritten(
  "users/{uid}/blogLibrary/{postId}",
  async (event) => {
    if (!startedReading(event.data?.before.data(), event.data?.after.data())) return;
    try {
      await getFirestore().collection(BLOG_POSTS).doc(event.params.postId)
        .update({readCount: FieldValue.increment(1)});
    } catch (error) {
      logger.warn("onBlogLibraryWritten: post sem doc", {postId: event.params.postId, error});
    }
  },
);
