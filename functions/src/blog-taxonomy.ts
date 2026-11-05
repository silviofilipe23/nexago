/**
 * Categorias e autores do blog (backoffice › Conteúdo › Categorias / Autores).
 *
 *   blogCategories/{id} — `{label, color, colorLight, order, active, updatedAt, updatedBy}`. As 6 categorias de
 *                         origem (`BLOG_DEFAULT_CATEGORIES`) valem mesmo sem doc; um doc com o mesmo id muda
 *                         rótulo, cor, ordem ou desativa. Categoria nova ganha doc com id tirado do rótulo.
 *                         Desativar esconde do editor e do feed; post antigo continua com ela.
 *   blogAuthors/{id}    — `{name, role, photoUrl, bio, active, ...}`. O post guarda um retrato
 *                         (`author: {id, name, role, photoUrl}`) no save: trocar o autor depois não reescreve
 *                         posts já salvos.
 *
 * Leitura pública (app, site e backoffice usam rótulo, cor e foto); escrita só por estas callables.
 * `color` é o tom no tema escuro (fundo sempre escuro da capa e dos chips); `colorLight` é o tom de texto
 * no tema claro, escolhido para passar 4,5:1 — o backoffice oferece pares prontos.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, Timestamp, type Firestore, type Transaction} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import {callerCanAccessBackoffice} from "./auth-roles";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import type {Actor} from "./home-banners";

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

export const BLOG_CATEGORIES_COLLECTION = "blogCategories";
export const BLOG_AUTHORS_COLLECTION = "blogAuthors";
export const BLOG_CATEGORY_LABEL_MAX = 24;
export const BLOG_AUTHOR_NAME_MAX = 40;
export const BLOG_AUTHOR_ROLE_MAX = 40;
export const BLOG_AUTHOR_BIO_MAX = 160;
/** Categorias CRIADAS (fora as 6 de origem, que podem ganhar doc ao mudar de nome, cor ou ordem). */
export const BLOG_CATEGORIES_MAX = 30;
export const CATEGORY_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CATEGORY_ID_MAX = 32;
const DOC_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export interface BlogCategoryDef {
  id: string;
  label: string;
  color: string;
  colorLight: string;
  order: number;
  active: boolean;
}

/** As 6 de origem. Mudar aqui exige mudar os padrões do app, do site e do backoffice. */
export const BLOG_DEFAULT_CATEGORIES: readonly BlogCategoryDef[] = [
  {id: "torneios", label: "Torneios", color: "#FF6A1A", colorLight: "#AE3A0A", order: 0, active: true},
  {id: "treino", label: "Treino", color: "#2BD17E", colorLight: "#187345", order: 1, active: true},
  {id: "regras", label: "Regras", color: "#C9A7FF", colorLight: "#6B3FB8", order: 2, active: true},
  {id: "arenas", label: "Arenas", color: "#E3B85C", colorLight: "#7A5A0F", order: 3, active: true},
  {id: "guia", label: "Guia do app", color: "#9AB4FF", colorLight: "#2F55B8", order: 4, active: true},
  {id: "loja", label: "Loja", color: "#FF8A4A", colorLight: "#9A3D0C", order: 5, active: true},
];
export const BLOG_DEFAULT_CATEGORY_IDS = BLOG_DEFAULT_CATEGORIES.map((c) => c.id);

const str = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

export function isCategoryId(v: unknown): v is string {
  return typeof v === "string" && v.length <= CATEGORY_ID_MAX && CATEGORY_ID_RE.test(v);
}

/** "Guia do app" → "guia-do-app" (id de categoria nova). */
export function categoryIdFrom(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, CATEGORY_ID_MAX)
    .replace(/-+$/g, "");
}

/** A categoria existe (de origem ou com doc)? Lida dentro da transação do save do post. */
export async function categoryExists(tx: Transaction, db: Firestore, id: string): Promise<boolean> {
  if (BLOG_DEFAULT_CATEGORY_IDS.includes(id)) return true;
  const snap = await tx.get(db.collection(BLOG_CATEGORIES_COLLECTION).doc(id));
  return snap.exists;
}

export interface SaveBlogCategoryInput {
  /** `null` = categoria nova (id tirado do rótulo). */
  id: string | null;
  label: string;
  color: string;
  colorLight: string;
  order: number;
  active: boolean;
}

export function blogCategoryErrors(input: unknown): string[] {
  const c = input as Partial<SaveBlogCategoryInput> | null;
  if (!c || typeof c !== "object") return ["Categoria inválida."];
  const errors: string[] = [];
  if (c.id !== null && !isCategoryId(c.id)) errors.push("Categoria inválida.");
  const label = str(c.label);
  if (!label) errors.push("Dê um nome à categoria.");
  else if (label.length > BLOG_CATEGORY_LABEL_MAX) errors.push(`Nome passa de ${BLOG_CATEGORY_LABEL_MAX} caracteres.`);
  else if (c.id === null && !categoryIdFrom(label)) errors.push("Use letras ou números no nome.");
  if (typeof c.color !== "string" || !HEX_RE.test(c.color)) errors.push("Cor do tema escuro inválida.");
  if (typeof c.colorLight !== "string" || !HEX_RE.test(c.colorLight)) errors.push("Cor do tema claro inválida.");
  if (!Number.isInteger(c.order) || (c.order as number) < 0 || (c.order as number) > 999) errors.push("Ordem inválida.");
  if (typeof c.active !== "boolean") errors.push("Situação inválida.");
  return errors;
}

export async function saveBlogCategoryCore(
  db: Firestore,
  input: SaveBlogCategoryInput,
  actor: Actor,
  now: Date,
): Promise<{id: string}> {
  const errors = blogCategoryErrors(input);
  if (errors.length > 0) throw new HttpsError("invalid-argument", errors[0], {errors});
  const col = db.collection(BLOG_CATEGORIES_COLLECTION);
  return db.runTransaction(async (tx) => {
    let id = input.id;
    if (id === null) {
      const base = categoryIdFrom(str(input.label));
      const existing = await tx.get(col);
      const created = existing.docs.filter((d) => !BLOG_DEFAULT_CATEGORY_IDS.includes(d.id)).length;
      if (created >= BLOG_CATEGORIES_MAX) {
        throw new HttpsError("resource-exhausted", `Até ${BLOG_CATEGORIES_MAX} categorias.`);
      }
      const taken = new Set([...BLOG_DEFAULT_CATEGORY_IDS, ...existing.docs.map((d) => d.id)]);
      id = base;
      for (let n = 2; taken.has(id); n++) id = `${base}-${n}`.slice(0, CATEGORY_ID_MAX);
    }
    tx.set(col.doc(id), {
      label: str(input.label),
      color: input.color.toUpperCase(),
      colorLight: input.colorLight.toUpperCase(),
      order: input.order,
      active: input.active,
      updatedAt: Timestamp.fromDate(now),
      updatedBy: actor,
    });
    return {id};
  });
}

export interface BlogAuthorSnapshot {
  id: string | null;
  name: string;
  role: string;
  photoUrl: string | null;
}

export interface SaveBlogAuthorInput {
  id: string | null;
  name: string;
  role: string;
  photoUrl: string | null;
  bio: string;
  active: boolean;
}

export function blogAuthorErrors(input: unknown): string[] {
  const a = input as Partial<SaveBlogAuthorInput> | null;
  if (!a || typeof a !== "object") return ["Autor inválido."];
  const errors: string[] = [];
  if (a.id !== null && (typeof a.id !== "string" || !DOC_ID_RE.test(a.id))) errors.push("Autor inválido.");
  const name = str(a.name);
  if (!name) errors.push("Informe o nome do autor.");
  else if (name.length > BLOG_AUTHOR_NAME_MAX) errors.push(`Nome passa de ${BLOG_AUTHOR_NAME_MAX} caracteres.`);
  if (typeof a.role !== "string" || str(a.role).length > BLOG_AUTHOR_ROLE_MAX) {
    errors.push(`Função passa de ${BLOG_AUTHOR_ROLE_MAX} caracteres.`);
  }
  if (a.photoUrl !== null && (typeof a.photoUrl !== "string" || !/^https:\/\/\S+$/.test(a.photoUrl) || a.photoUrl.length > 1000)) {
    errors.push("Foto sem endereço https.");
  }
  if (typeof a.bio !== "string" || str(a.bio).length > BLOG_AUTHOR_BIO_MAX) errors.push(`Bio passa de ${BLOG_AUTHOR_BIO_MAX} caracteres.`);
  if (typeof a.active !== "boolean") errors.push("Situação inválida.");
  return errors;
}

export async function saveBlogAuthorCore(
  db: Firestore,
  input: SaveBlogAuthorInput,
  actor: Actor,
  now: Date,
): Promise<{id: string}> {
  const errors = blogAuthorErrors(input);
  if (errors.length > 0) throw new HttpsError("invalid-argument", errors[0], {errors});
  const col = db.collection(BLOG_AUTHORS_COLLECTION);
  const ref = input.id ? col.doc(input.id) : col.doc();
  const stamp = Timestamp.fromDate(now);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (input.id && !snap.exists) throw new HttpsError("not-found", "Este autor não existe mais.");
    tx.set(ref, {
      name: str(input.name),
      role: str(input.role),
      photoUrl: input.photoUrl,
      bio: str(input.bio),
      active: input.active,
      createdAt: snap.data()?.["createdAt"] ?? stamp,
      updatedAt: stamp,
      updatedBy: actor,
    });
    return {id: ref.id};
  });
}

/**
 * Retrato do autor que vai no post. Com `id`, nome/função/foto vêm do cadastro (o que o editor mandou é
 * ignorado); sem `id`, é o texto livre de antes.
 */
export async function authorSnapshot(
  tx: Transaction,
  db: Firestore,
  author: {id?: string | null; name: string; role: string},
): Promise<BlogAuthorSnapshot> {
  if (!author.id) return {id: null, name: str(author.name), role: str(author.role), photoUrl: null};
  if (!DOC_ID_RE.test(author.id)) throw new HttpsError("invalid-argument", "Autor inválido.");
  const snap = await tx.get(db.collection(BLOG_AUTHORS_COLLECTION).doc(author.id));
  const d = snap.data();
  if (!d) throw new HttpsError("failed-precondition", "O autor escolhido não existe mais. Escolha outro.");
  return {
    id: author.id,
    name: str(d["name"]),
    role: str(d["role"]),
    photoUrl: typeof d["photoUrl"] === "string" ? d["photoUrl"] : null,
  };
}

async function assertBlogAdmin(uid: string): Promise<Actor> {
  const caller = await getAuth().getUser(uid).catch(() => null);
  if (!caller) throw new HttpsError("unauthenticated", "Sua sessão expirou. Entre novamente para continuar.");
  if (!callerCanAccessBackoffice(caller)) {
    throw new HttpsError("permission-denied", "Apenas administradores da plataforma podem editar o blog.");
  }
  return {uid, name: caller.displayName ?? caller.email ?? uid};
}

export const saveBlogCategory = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const actor = await assertBlogAdmin(uid);
  return saveBlogCategoryCore(getFirestore(), (request.data ?? {}) as SaveBlogCategoryInput, actor, new Date());
});

export const saveBlogAuthor = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const actor = await assertBlogAdmin(uid);
  return saveBlogAuthorCore(getFirestore(), (request.data ?? {}) as SaveBlogAuthorInput, actor, new Date());
});
