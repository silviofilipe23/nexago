import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";

/**
 * Página pública de links (link-in-bio) de arenas e organizadores.
 *
 * Duas escritas passam obrigatoriamente por aqui, e as rules bloqueiam as duas no cliente:
 *
 * 1. `saveLinkPageProfile` — trocar o slug precisa mover o registro `linkPageSlugs/{slug}`
 *    junto com o doc da página, na mesma transação. Sem isso dois donos poderiam reivindicar
 *    o mesmo endereço ao mesmo tempo.
 * 2. `trackLinkPageEvent` — contadores de visita/clique vêm de visitantes anônimos. Deixar o
 *    incremento nas rules significaria abrir escrita pública no documento; aqui a function
 *    escreve só os campos de métrica e ainda mantém a janela de 30/60 dias podada.
 */

const SLUG_MIN = 3;
const SLUG_MAX = 40;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const MAX_HIGHLIGHTS = 3;
const MAX_BIO = 180;

/** Mesma lista do cliente (`RESERVED_LINK_SLUGS`) — rotas do site que não podem virar slug. */
const RESERVED_SLUGS = new Set([
  "a", "o", "api", "app", "admin", "arena", "arenas", "blog", "contato", "ligas",
  "login", "nexago", "organizadores", "privacidade", "rankings", "sobre", "suporte",
  "termos", "torneios"
]);

/** Retenção do histórico diário: 60 dias cobrem a janela de 30d e a comparação anterior. */
const DAILY_RETENTION_DAYS = 60;

type OwnerType = "arena" | "organizer";

interface Highlight {
  value: string;
  label: string;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function pageIdFor(ownerType: OwnerType, ownerId: string): string {
  return `${ownerType}_${ownerId}`;
}

function readString(value: unknown, field: string, {max = 200, required = false} = {}): string {
  if (value == null) {
    if (required) throw new HttpsError("invalid-argument", `Campo obrigatório: ${field}.`);
    return "";
  }
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `Campo inválido: ${field}.`);
  }
  const trimmed = value.trim();
  if (required && !trimmed) {
    throw new HttpsError("invalid-argument", `Campo obrigatório: ${field}.`);
  }
  return trimmed.slice(0, max);
}

function readHighlights(value: unknown): Highlight[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((h): h is Record<string, unknown> => !!h && typeof h === "object")
    .map((h) => ({
      value: readString(h["value"], "highlight.value", {max: 10}),
      label: readString(h["label"], "highlight.label", {max: 16})
    }))
    .filter((h) => h.value !== "")
    .slice(0, MAX_HIGHLIGHTS);
}

function assertValidSlug(slug: string): void {
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX || !SLUG_PATTERN.test(slug)) {
    throw new HttpsError("invalid-argument", "Endereço inválido. Use letras minúsculas, números e hífen.");
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new HttpsError("invalid-argument", "Esse endereço é reservado. Escolha outro.");
  }
}

/** Só o gestor da arena (ou o próprio organizador) mexe na página daquele dono. */
async function assertOwnership(uid: string, ownerType: OwnerType, ownerId: string): Promise<void> {
  if (ownerType === "organizer") {
    if (uid !== ownerId) {
      throw new HttpsError("permission-denied", "Você só pode editar a sua própria página.");
    }
    return;
  }

  const arenaSnap = await getFirestore().doc(`arenas/${ownerId}`).get();
  if (!arenaSnap.exists) {
    throw new HttpsError("not-found", "Arena não encontrada.");
  }
  if (arenaSnap.get("managerUserId") !== uid) {
    throw new HttpsError("permission-denied", "Você não gerencia essa arena.");
  }
}

/**
 * Cria/atualiza o perfil da página e reivindica o slug de forma atômica.
 */
export const saveLinkPageProfile = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para editar sua página de links.");
  }

  const data = (request.data || {}) as Record<string, unknown>;
  const ownerType = data["ownerType"] === "organizer" ? "organizer" : "arena";
  const ownerId = readString(data["ownerId"], "ownerId", {max: 128, required: true});
  const slug = readString(data["slug"], "slug", {max: SLUG_MAX, required: true}).toLowerCase();
  const title = readString(data["title"], "title", {max: 60, required: true});
  const handle = readString(data["handle"], "handle", {max: 40}).replace(/^@/, "");
  const bio = readString(data["bio"], "bio", {max: MAX_BIO});
  const avatarUrlRaw = data["avatarUrl"];
  const avatarUrl = typeof avatarUrlRaw === "string" && avatarUrlRaw.trim() ? avatarUrlRaw.trim() : null;
  const highlights = readHighlights(data["highlights"]);
  const published = data["published"] !== false;

  assertValidSlug(slug);
  await assertOwnership(uid, ownerType, ownerId);

  const db = getFirestore();
  const pageId = pageIdFor(ownerType, ownerId);
  const pageRef = db.doc(`linkPages/${pageId}`);
  const slugRef = db.doc(`linkPageSlugs/${slug}`);

  await db.runTransaction(async (tx) => {
    const [pageSnap, slugSnap] = await Promise.all([tx.get(pageRef), tx.get(slugRef)]);

    if (slugSnap.exists && slugSnap.get("pageId") !== pageId) {
      throw new HttpsError("already-exists", "Esse endereço já está em uso. Escolha outro.");
    }

    const previousSlug = pageSnap.exists ? (pageSnap.get("slug") as string | undefined) : undefined;

    const payload: Record<string, unknown> = {
      ownerType,
      ownerId,
      slug,
      title,
      handle,
      bio,
      avatarUrl,
      highlights,
      published,
      updatedAt: FieldValue.serverTimestamp()
    };
    if (!pageSnap.exists) {
      payload["views"] = 0;
      payload["dailyViews"] = {};
      payload["createdAt"] = FieldValue.serverTimestamp();
    }

    tx.set(pageRef, payload, {merge: true});
    tx.set(slugRef, {pageId, ownerType, ownerId, updatedAt: FieldValue.serverTimestamp()});

    if (previousSlug && previousSlug !== slug) {
      tx.delete(db.doc(`linkPageSlugs/${previousSlug}`));
    }
  });

  logger.info("linkPage salvo", {pageId, slug});
  return {pageId, slug};
});

/**
 * Registra visita na página ou clique num link. Aberta a visitantes anônimos — é a página
 * pública que chama.
 */
export const trackLinkPageEvent = onCall(async (request) => {
  const data = (request.data || {}) as Record<string, unknown>;
  const pageId = readString(data["pageId"], "pageId", {max: 200, required: true});
  const linkIdRaw = data["linkId"];
  const linkId = typeof linkIdRaw === "string" && linkIdRaw.trim() ? linkIdRaw.trim().slice(0, 200) : null;

  // Ids são gerados pelo Firestore/pela function; recusar o resto evita escrita em caminho arbitrário.
  if (!/^[A-Za-z0-9_-]+$/.test(pageId) || (linkId && !/^[A-Za-z0-9_-]+$/.test(linkId))) {
    throw new HttpsError("invalid-argument", "Identificador inválido.");
  }

  const db = getFirestore();
  const ref = linkId ? db.doc(`linkPages/${pageId}/links/${linkId}`) : db.doc(`linkPages/${pageId}`);
  const counterField = linkId ? "clicks" : "views";
  const dailyField = linkId ? "dailyClicks" : "dailyViews";
  const today = dayKey(new Date());

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new HttpsError("not-found", "Página ou link não encontrado.");
      }

      const daily = (snap.get(dailyField) as Record<string, number> | undefined) ?? {};
      const cutoff = dayKey(new Date(Date.now() - DAILY_RETENTION_DAYS * 24 * 60 * 60 * 1000));

      const next: Record<string, number> = {};
      for (const [key, value] of Object.entries(daily)) {
        if (key >= cutoff && typeof value === "number") next[key] = value;
      }
      next[today] = (next[today] ?? 0) + 1;

      tx.update(ref, {
        [counterField]: FieldValue.increment(1),
        [dailyField]: next,
        lastEventAt: Timestamp.now()
      });
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.warn("Falha ao registrar evento de link", {pageId, linkId, error});
    throw new HttpsError("internal", "Não foi possível registrar o evento.");
  }

  return {ok: true};
});
