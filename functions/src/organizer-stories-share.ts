import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue, Timestamp, type Firestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import * as logger from "firebase-functions/logger";
import {assertCanManageTournament} from "./tournament-acl";
import {deliverNotificationToUser} from "./notification-delivery";
import {organizerTournamentNotificationLinks} from "./organizer-notification-links";
import {CLIENT_FACING_REGIONS} from "./function-regions";

/**
 * "Enviar para o celular" do Compartilhar no Stories (painel do organizador, protótipo 22e).
 *
 * Do computador o Instagram não aceita story. O painel gera as artes (PNG 1080×1920), sobe cada
 * uma para `storyShares/{uid}/{tournamentId}/{shareId}/{n}.png` (regra em storage.rules) e chama
 * esta callable, que:
 *  1. confere que quem pede opera o torneio e que todas as imagens chegaram;
 *  2. grava `users/{uid}/storyShares/{shareId}` — é o que a tela do app lê;
 *  3. manda o push SÓ para os aparelhos do próprio usuário, e só pelo app (sem Web Push: o
 *     navegador de onde ele pediu o envio não é o destino).
 *
 * O `url` do push é a tela do torneio, que existe nos builds da loja anteriores a esta tela; o
 * app novo reconhece o tipo e abre direto a folha de compartilhar (ver
 * `organizer-notification-links.ts`).
 */

export const ORGANIZER_STORIES_READY_TYPE = "organizer_stories_ready";

/** 8 duplas por story: 20 páginas cobrem 160, bem acima da maior categoria. */
export const STORY_SHARE_MAX_PAGES = 20;

/** Depois disso as artes saem do Storage: a lista de inscritos já mudou e o story envelheceu. */
export const STORY_SHARE_TTL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_CATEGORY_NAME = 80;
const MAX_UNIT_LABEL = 24;
const MAX_LINK = 500;

/** Pasta das artes de um envio. A regra do Storage espelha este caminho. */
export function storyShareFolder(uid: string, tournamentId: string, shareId: string): string {
  return `storyShares/${uid}/${tournamentId}/${shareId}/`;
}

/** Página 1-based, na ordem em que vão para o Stories. */
export function storySharePagePath(
  uid: string,
  tournamentId: string,
  shareId: string,
  page: number,
): string {
  return `${storyShareFolder(uid, tournamentId, shareId)}${page}.png`;
}

/** O que a callable usa do bucket — o Admin SDK em produção, um dublê nos testes. */
export interface StoryShareBucket {
  exists(path: string): Promise<boolean>;
  /** Arquivos sob o prefixo, com a data de criação. */
  list(prefix: string): Promise<Array<{path: string; createdAtMs: number}>>;
  remove(path: string): Promise<void>;
}

export interface SendStoriesToPhoneInput {
  tournamentId?: unknown;
  shareId?: unknown;
  pageCount?: unknown;
  categoryName?: unknown;
  unitLabel?: unknown;
  link?: unknown;
}

export interface StoryShareCreated {
  shareId: string;
  tournamentId: string;
  pageCount: number;
  title: string;
  body: string;
  data: Record<string, string>;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function storyCountLabel(pageCount: number): string {
  return pageCount === 1 ? "1 story" : `${pageCount} stories`;
}

/** Só link de verdade vai pra figurinha do Instagram; o resto vira `null` e o app esconde o botão. */
function signupLink(value: unknown): string | null {
  const raw = text(value, MAX_LINK + 1);
  if (!raw || raw.length > MAX_LINK) return null;
  try {
    return new URL(raw).protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Valida, autoriza, confere as imagens e grava o envio. Não manda push: o wrapper `onCall`
 * cuida disso (mantém a lógica testável sem FCM).
 */
export async function createStoryShareCore(
  db: Firestore,
  bucket: StoryShareBucket,
  uid: string,
  input: SendStoriesToPhoneInput,
  nowMs: number = Date.now(),
): Promise<StoryShareCreated> {
  const tournamentId = text(input.tournamentId, 128);
  const shareId = text(input.shareId, 64);
  const pageCount = input.pageCount;
  const categoryName = text(input.categoryName, MAX_CATEGORY_NAME);
  if (!tournamentId || tournamentId.includes("/") || !SHARE_ID_PATTERN.test(shareId)) {
    throw new HttpsError("invalid-argument", "Envio inválido.");
  }
  if (
    typeof pageCount !== "number" ||
    !Number.isInteger(pageCount) ||
    pageCount < 1 ||
    pageCount > STORY_SHARE_MAX_PAGES
  ) {
    throw new HttpsError("invalid-argument", "Número de imagens inválido.");
  }
  if (!categoryName) {
    throw new HttpsError("invalid-argument", "Categoria obrigatória.");
  }

  const tournament = await assertCanManageTournament(db, uid, tournamentId);
  const tournamentName = text(tournament["name"], 120) || "Torneio";

  const pagePaths = Array.from({length: pageCount}, (_, i) =>
    storySharePagePath(uid, tournamentId, shareId, i + 1));
  const found = await Promise.all(pagePaths.map((path) => bucket.exists(path)));
  if (found.some((ok) => !ok)) {
    throw new HttpsError(
      "failed-precondition",
      "As imagens não chegaram ao servidor. Tente enviar de novo.",
    );
  }

  const shareRef = db.doc(`users/${uid}/storyShares/${shareId}`);
  if ((await shareRef.get()).exists) {
    throw new HttpsError("already-exists", "Este envio já foi feito.");
  }
  await shareRef.set({
    tournamentId,
    tournamentName,
    categoryName,
    unitLabel: text(input.unitLabel, MAX_UNIT_LABEL) || "duplas",
    pageCount,
    pagePaths,
    link: signupLink(input.link),
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(nowMs + STORY_SHARE_TTL_DAYS * DAY_MS),
  });

  const links = organizerTournamentNotificationLinks(tournamentId);
  return {
    shareId,
    tournamentId,
    pageCount,
    title: "Stories prontos para postar",
    body:
      `${categoryName} · ${tournamentName}: ${storyCountLabel(pageCount)}. ` +
      "Toque para abrir no Instagram.",
    data: {tournamentId, shareId, url: links.url, webUrl: links.webUrl},
  };
}

/**
 * Apaga os envios vencidos do usuário: os docs pelo `expiresAt` e as imagens pela data de
 * criação — que também pega as que subiram e nunca viraram envio (a callable falhou depois do
 * upload). Roda a cada envio novo, então o Storage de cada organizador fica limitado à semana.
 */
export async function cleanupExpiredStoryShares(
  db: Firestore,
  bucket: StoryShareBucket,
  uid: string,
  nowMs: number = Date.now(),
): Promise<{docs: number; files: number}> {
  const cutoffMs = nowMs - STORY_SHARE_TTL_DAYS * DAY_MS;

  const expired = await db
    .collection(`users/${uid}/storyShares`)
    .where("expiresAt", "<=", Timestamp.fromMillis(nowMs))
    .get();
  await Promise.all(expired.docs.map((doc) => doc.ref.delete()));

  const files = await bucket.list(`storyShares/${uid}/`);
  const stale = files.filter((f) => f.createdAtMs <= cutoffMs);
  await Promise.all(stale.map((f) => bucket.remove(f.path)));

  return {docs: expired.size, files: stale.length};
}

function adminStoryShareBucket(): StoryShareBucket {
  const bucket = getStorage().bucket();
  return {
    async exists(path) {
      const [exists] = await bucket.file(path).exists();
      return exists;
    },
    async list(prefix) {
      const [files] = await bucket.getFiles({prefix});
      return files.map((file) => ({
        path: file.name,
        createdAtMs: Date.parse(String(file.metadata.timeCreated ?? "")) || 0,
      }));
    },
    async remove(path) {
      await bucket.file(path).delete({ignoreNotFound: true});
    },
  };
}

export const sendStoriesToPhone = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const db = getFirestore();
  const bucket = adminStoryShareBucket();
  const share = await createStoryShareCore(
    db,
    bucket,
    uid,
    (request.data ?? {}) as SendStoriesToPhoneInput,
  );

  // Fica no inbox do app mesmo sem aparelho conectado agora: ao entrar no app com esta conta,
  // o organizador acha as artes em Notificações.
  const {sent} = await deliverNotificationToUser({
    userId: uid,
    title: share.title,
    body: share.body,
    type: ORGANIZER_STORIES_READY_TYPE,
    data: share.data,
    skipWebPush: true,
  });

  await cleanupExpiredStoryShares(db, bucket, uid).catch((error) => {
    logger.warn(`Limpeza de storyShares falhou user=${uid}`, error);
  });

  return {shareId: share.shareId, pageCount: share.pageCount, devices: sent};
});
