/**
 * Push do blog no horário da publicação (backoffice › Blog › editor › "Notificação push").
 *
 * Quem recebe: atleta (sem conta de seed/QA) que bate com o filtro do post (cidade e esporte),
 * não desligou o push nas Configurações, não silenciou a categoria (`blogNotifyPrefs/{uid}.muted`)
 * e tem ao menos um aparelho com o app que conhece a rota do blog (`users/{uid}/tokens` com
 * `buildNumber >= appConfig/blog.pushMinBuild`). O último corte é o que evita mandar a quem está
 * num build sem `/athlete/blog/:postId`: o app navega para `data.url` como está e o router não tem
 * tela de erro. Sem token novo o atleta também não ganha o item no inbox, pelo mesmo motivo.
 *
 * Dispara uma vez por post, quando ele vira `published` (publicar agora ou a agendada): o gatilho
 * marca `pushSentAt` numa transação antes de enviar, e o save do editor preserva a marca.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import {getFirestore, Timestamp, type DocumentData, type Firestore} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import {callerCanAccessBackoffice} from "./auth-roles";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {deliverNotificationToUser} from "./notification-delivery";
import {BLOG_POSTS, type BlogCategory, type BlogPushSettings} from "./blog";
import {isCategoryId} from "./blog-taxonomy";
import {resolveSport} from "./sports/catalog";

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

export const BLOG_NOTIFY_PREFS = "blogNotifyPrefs";
export const BLOG_PUSH_TYPE = "blog_post";
/** O 117 foi cortado em 03/11, antes do blog (#1105): o primeiro build com a rota é o 118. */
export const BLOG_PUSH_MIN_BUILD_DEFAULT = 118;
const DELIVERY_CONCURRENCY = 10;
const GET_ALL_CHUNK = 100;
const TEST_EMAIL_SUFFIXES = ["@nexago.test", "@nexago.dev", "@example.com"];

/** "Goiânia " → "goiania": compara cidade digitada no backoffice com a do perfil. */
export function normalizeCity(v: string): string {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isAthlete(d: DocumentData): boolean {
  const roles = d["roles"];
  if (Array.isArray(roles)) return roles.includes("athlete");
  return d["role"] === "athlete";
}

/** Seed e QA nunca recebem campanha (mesma regra dos scripts de disparo em massa). */
export function isTestAccount(d: DocumentData): boolean {
  if (d["seedTestAthlete"] === true) return true;
  const email = typeof d["email"] === "string" ? d["email"].toLowerCase() : "";
  return TEST_EMAIL_SUFFIXES.some((s) => email.endsWith(s));
}

function pushChannelOn(d: DocumentData): boolean {
  const prefs = d["notificationPreferences"] as {channels?: Record<string, unknown>} | undefined;
  return prefs?.channels?.["push"] !== false;
}

/** O atleta joga o esporte (tem nível declarado nele). Chave do mapa é o `code` ou o `appId`. */
function playsSport(d: DocumentData, sportCode: string): boolean {
  const levels = (d["sportOnboarding"] as {levelsBySport?: Record<string, unknown>} | undefined)?.levelsBySport;
  if (!levels || typeof levels !== "object") return false;
  return Object.keys(levels).some((k) => resolveSport(k)?.code === sportCode);
}

/** O filtro do post (cidade e esporte), sem olhar aparelho nem preferência. */
export function matchesAudience(d: DocumentData, push: Pick<BlogPushSettings, "city" | "sport">): boolean {
  if (!isAthlete(d) || isTestAccount(d)) return false;
  if (push.city !== null) {
    const city = typeof d["city"] === "string" ? d["city"] : "";
    if (normalizeCity(city) !== normalizeCity(push.city)) return false;
  }
  if (push.sport !== "all" && !playsSport(d, push.sport)) return false;
  return true;
}

export async function blogPushMinBuild(db: Firestore): Promise<number> {
  const snap = await db.collection("appConfig").doc("blog").get();
  const v = snap.data()?.["pushMinBuild"];
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : BLOG_PUSH_MIN_BUILD_DEFAULT;
}

/** Uids com algum aparelho no build mínimo ou acima (só tokens de `users/{uid}/tokens`). */
async function uidsWithBlogApp(db: Firestore, minBuild: number): Promise<Set<string>> {
  const snap = await db.collectionGroup("tokens").where("buildNumber", ">=", minBuild).get();
  const uids = new Set<string>();
  for (const doc of snap.docs) {
    const parts = doc.ref.path.split("/");
    if (parts.length === 4 && parts[0] === "users" && parts[2] === "tokens") uids.add(parts[1]);
  }
  return uids;
}

async function mutedUids(db: Firestore, category: BlogCategory): Promise<Set<string>> {
  const snap = await db.collection(BLOG_NOTIFY_PREFS).where("muted", "array-contains", category).get();
  return new Set(snap.docs.map((d) => d.id));
}

/** Quem recebe o push deste post. */
export async function blogPushRecipients(
  db: Firestore,
  push: Pick<BlogPushSettings, "city" | "sport">,
  category: BlogCategory,
  minBuild: number,
): Promise<string[]> {
  const [withApp, muted] = await Promise.all([uidsWithBlogApp(db, minBuild), mutedUids(db, category)]);
  const candidates = [...withApp].filter((uid) => !muted.has(uid));
  const recipients: string[] = [];
  for (let i = 0; i < candidates.length; i += GET_ALL_CHUNK) {
    const refs = candidates.slice(i, i + GET_ALL_CHUNK).map((uid) => db.collection("users").doc(uid));
    const snaps = await db.getAll(...refs);
    for (const s of snaps) {
      const d = s.data();
      if (d && matchesAudience(d, push) && pushChannelOn(d)) recipients.push(s.id);
    }
  }
  return recipients;
}

export interface BlogPushReach {
  /** Recebem o push hoje (filtro + preferências + app atualizado). */
  reachable: number;
  /** Atletas no filtro de cidade e esporte, com ou sem o app atualizado. */
  athletes: number;
  minBuild: number;
  /** Cidades dos atletas no filtro de esporte, mais frequentes primeiro (até 30). */
  cities: Array<{city: string; count: number}>;
}

export async function estimateBlogPushReachCore(
  db: Firestore,
  push: Pick<BlogPushSettings, "city" | "sport">,
  category: BlogCategory,
): Promise<BlogPushReach> {
  const minBuild = await blogPushMinBuild(db);
  const [reachable, users] = await Promise.all([
    blogPushRecipients(db, push, category, minBuild),
    db.collection("users").get(),
  ]);
  let athletes = 0;
  const cities = new Map<string, {city: string; count: number}>();
  for (const doc of users.docs) {
    const d = doc.data();
    if (matchesAudience(d, push)) athletes += 1;
    if (!matchesAudience(d, {city: null, sport: push.sport})) continue;
    const city = typeof d["city"] === "string" ? d["city"].trim() : "";
    if (!city) continue;
    const key = normalizeCity(city);
    const entry = cities.get(key) ?? {city, count: 0};
    entry.count += 1;
    cities.set(key, entry);
  }
  return {
    reachable: reachable.length,
    athletes,
    minBuild,
    cities: [...cities.values()].sort((a, b) => b.count - a.count || a.city.localeCompare(b.city)).slice(0, 30),
  };
}

/** O post acabou de ir ao ar com push ligado e ainda não enviado. */
export function shouldSendBlogPush(before: DocumentData | undefined, after: DocumentData | undefined): boolean {
  if (!after || after["status"] !== "published" || before?.["status"] === "published") return false;
  const push = after["push"] as Partial<BlogPushSettings> | undefined;
  const channels = after["channels"] as {app?: unknown} | undefined;
  return push?.enabled === true && channels?.app === true && !after["pushSentAt"];
}

/** Título e texto do push: o título do post e a linha fina (ou os minutos de leitura). */
export function blogPushMessage(post: DocumentData): {title: string; body: string} {
  const title = typeof post["title"] === "string" ? post["title"] : "Novo post no blog";
  const subtitle = typeof post["subtitle"] === "string" ? post["subtitle"].trim() : "";
  const minutes = typeof post["readMinutes"] === "number" ? post["readMinutes"] : 1;
  return {title, body: subtitle || `${minutes} min de leitura no blog do nexaGO`};
}

async function runInPool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({length: Math.min(size, items.length)}, async () => {
    while (next < items.length) await fn(items[next++]);
  });
  await Promise.all(workers);
}

export async function sendBlogPushCore(db: Firestore, postId: string, now: Date): Promise<{recipients: number; sent: number} | null> {
  const ref = db.collection(BLOG_POSTS).doc(postId);
  const post = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data();
    if (!d || d["pushSentAt"] || d["status"] !== "published") return null;
    tx.update(ref, {pushSentAt: Timestamp.fromDate(now), pushResult: {state: "sending", recipients: 0, sent: 0}});
    return d;
  });
  if (!post) return null;

  const push = post["push"] as BlogPushSettings;
  const category = post["category"] as BlogCategory;
  const recipients = isCategoryId(category) ?
    await blogPushRecipients(db, push, category, await blogPushMinBuild(db)) :
    [];
  const {title, body} = blogPushMessage(post);
  let sent = 0;
  await runInPool(recipients, DELIVERY_CONCURRENCY, async (userId) => {
    try {
      const r = await deliverNotificationToUser({
        userId,
        title,
        body,
        type: BLOG_PUSH_TYPE,
        data: {url: `/athlete/blog/${postId}`, postId, category},
        requireInteraction: false,
        skipWebPush: true,
      });
      if (r.sent > 0) sent += 1;
    } catch (error) {
      logger.warn("sendBlogPush: falha num atleta", {postId, userId, error});
    }
  });
  await ref.update({pushResult: {state: "sent", recipients: recipients.length, sent, finishedAt: Timestamp.now()}});
  return {recipients: recipients.length, sent};
}

export const onBlogPostPublishedPush = onDocumentWritten(
  {document: "blogPosts/{postId}", timeoutSeconds: 540},
  async (event) => {
    if (!shouldSendBlogPush(event.data?.before.data(), event.data?.after.data())) return;
    const result = await sendBlogPushCore(getFirestore(), event.params.postId, new Date());
    if (result) logger.info("onBlogPostPublishedPush: enviado", {postId: event.params.postId, ...result});
  },
);

export const estimateBlogPushReach = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const caller = await getAuth().getUser(uid).catch(() => null);
  if (!caller || !callerCanAccessBackoffice(caller)) {
    throw new HttpsError("permission-denied", "Apenas administradores da plataforma podem ver o alcance.");
  }
  const input = (request.data ?? {}) as {city?: unknown; sport?: unknown; category?: unknown};
  const city = typeof input.city === "string" && input.city.trim() ? input.city.trim() : null;
  const sport = input.sport === "all" || input.sport === undefined ? "all" : resolveSport(input.sport)?.code;
  if (!sport) throw new HttpsError("invalid-argument", "Esporte desconhecido.");
  if (!isCategoryId(input.category)) {
    throw new HttpsError("invalid-argument", "Escolha uma categoria.");
  }
  return estimateBlogPushReachCore(getFirestore(), {city, sport}, input.category as BlogCategory);
});
