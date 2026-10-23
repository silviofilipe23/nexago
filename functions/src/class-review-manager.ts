/**
 * Avaliações de aula — lado da gestão (arena e centro) e do professor. As avaliações
 * (`classReviews`) só a autora lê pelas rules; quem administra o local lê por aqui, e quando a
 * aluna escondeu o nome (`showName == false`) o que sai é anônimo de verdade:
 *
 * - sem `uid`, sem `athleteName`, sem o id do doc (`{key}_{uid}` carrega o uid) — o handle é o
 *   `publicId` aleatório, gravado no envio (e preenchido aqui nas avaliações antigas);
 * - sem instante de envio/edição nem de abertura do chamado (cruzar com a chamada reidentifica);
 *   fica só a data/horário da aula, que a gestão já conhece;
 * - ordem estável que não segue o id do doc (que ordenaria pelo uid).
 *
 * Responder o chamado grava `ticket.reply/repliedAt/repliedByName/status` e avisa a aluna por
 * push (`url: /treinos/avaliacoes`, a tela A7 do app).
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {Timestamp, getFirestore, type Firestore} from "firebase-admin/firestore";
import {requireUid, str} from "./arena-class";
import {assertArenaAreaAccess} from "./arena-area-access";
import {requireManager as requireCenterManager} from "./training-center-billing";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
  deliverNotificationToUser,
} from "./notification-delivery";
import {CLASS_REVIEWS, CLASS_REVIEW_SUMMARIES, newReviewPublicId, summaryRating} from "./class-review";

export const CLASS_REVIEW_REPLY_MAX = 600;
export const CLASS_REVIEW_REPLY_PUSH_TYPE = "class_review_reply";
/** Tela "Minhas avaliações" do app (A7). */
export const CLASS_REVIEW_APP_URL = "/treinos/avaliacoes";
/** Teto de leitura por local (o volume é de dezenas por mês). */
const MAX_REVIEWS = 500;
const PAGE_SIZE = 50;

type Data = Record<string, unknown>;
export type ReviewPlaceKind = "arena" | "center";
export type TicketStatus = "open" | "answered" | "resolved";

export interface ManagerReviewPart {
  stars: number;
  tags: string[];
}

export interface ManagerReviewTicket {
  status: TicketStatus;
  reply: string | null;
  repliedAt: string | null;
  repliedByName: string | null;
}

/** Uma avaliação como a gestão vê. Anônima = sem nada que aponte a aluna. */
export interface ManagerReview {
  id: string;
  anonymous: boolean;
  athleteName: string | null;
  /** Dia do envio (só quando a aluna mostrou o nome). */
  reviewedOn: string | null;
  date: string;
  startTime: string;
  title: string;
  professorName: string;
  scores: {class: ManagerReviewPart | null; professor: ManagerReviewPart | null; place: ManagerReviewPart | null};
  comment: string;
  ticket: ManagerReviewTicket | null;
}

export interface ManagerReviewsPage {
  placeName: string;
  rating: number | null;
  ratingCount: number;
  /** Médias por parte em todas as avaliações lidas (null sem nenhuma). */
  averages: {class: number | null; professor: number | null; place: number | null};
  openTickets: number;
  total: number;
  reviews: ManagerReview[];
  nextCursor: string | null;
}

// ── puro ─────────────────────────────────────────────────────────────────

function toDate(v: unknown): Date | null {
  return v != null && typeof (v as {toDate?: unknown}).toDate === "function" ? (v as {toDate(): Date}).toDate() : null;
}

function part(raw: unknown): ManagerReviewPart | null {
  const d = raw && typeof raw === "object" ? (raw as Data) : null;
  const stars = d?.["stars"];
  if (typeof stars !== "number") return null;
  return {stars, tags: Array.isArray(d?.["tags"]) ? (d!["tags"] as unknown[]).map(str).filter(Boolean) : []};
}

function ticketOf(raw: unknown): ManagerReviewTicket | null {
  const d = raw && typeof raw === "object" ? (raw as Data) : null;
  if (!d) return null;
  const s = str(d["status"]);
  const status: TicketStatus = s === "answered" || s === "resolved" ? s : "open";
  const repliedAt = toDate(d["repliedAt"]);
  return {
    status,
    reply: str(d["reply"]) || null,
    repliedAt: repliedAt ? repliedAt.toISOString() : null,
    repliedByName: str(d["repliedByName"]) || null,
  };
}

/** Projeção para a gestão. `showName == false` não deixa sair uid, nome, id do doc nem instantes. */
export function toManagerReview(data: Data): ManagerReview {
  const anonymous = data["showName"] === false;
  const createdAt = toDate(data["createdAt"]);
  const scores = (data["scores"] ?? {}) as Data;
  return {
    id: str(data["publicId"]),
    anonymous,
    athleteName: anonymous ? null : (str(data["athleteName"]) || null),
    reviewedOn: anonymous || !createdAt ? null : new Date(createdAt.getTime() - 3 * 3_600_000).toISOString().slice(0, 10),
    date: str(data["date"]),
    startTime: str(data["startTime"]),
    title: str(data["title"]) || "Aula",
    professorName: str(data["professorName"]),
    scores: {class: part(scores["class"]), professor: part(scores["professor"]), place: part(scores["place"])},
    comment: str(data["comment"]),
    ticket: ticketOf(data["ticket"]),
  };
}

/** Chamados abertos primeiro; depois a aula mais recente; empate pelo handle aleatório. */
export function compareManagerReviews(a: ManagerReview, b: ManagerReview): number {
  const open = (r: ManagerReview) => (r.ticket?.status === "open" ? 0 : 1);
  return open(a) - open(b) ||
    `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`) ||
    a.id.localeCompare(b.id);
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((s, n) => s + n, 0) / values.length) * 10) / 10;
}

function parseKind(v: unknown): ReviewPlaceKind {
  const k = str(v);
  if (k !== "arena" && k !== "center") throw new HttpsError("invalid-argument", "Local inválido.");
  return k;
}

function cleanId(v: unknown, label: string): string {
  const s = str(v);
  if (!s || s.includes("/") || s.length > 200) throw new HttpsError("invalid-argument", `${label} inválido.`);
  return s;
}

// ── acesso ───────────────────────────────────────────────────────────────

/** Arena: área `agenda` (ler para listar, escrever para responder). Centro: owner/admin. */
export async function requireReviewManager(
  db: Firestore,
  uid: string,
  kind: ReviewPlaceKind,
  placeId: string,
  mode: "read" | "write",
): Promise<{placeName: string; actorName: string}> {
  if (kind === "center") {
    const {name} = await requireCenterManager(db, uid, placeId);
    const center = (await db.collection("trainingCenters").doc(placeId).get()).data() ?? {};
    return {placeName: str(center["name"]) || "Centro de treinamento", actorName: name};
  }
  await assertArenaAreaAccess(db, placeId, uid, "agenda", mode);
  const [arenaSnap, userSnap] = await Promise.all([
    db.collection("arenas").doc(placeId).get(),
    db.collection("users").doc(uid).get(),
  ]);
  const placeName = str(arenaSnap.data()?.["name"]) || "Arena";
  const user = userSnap.data() ?? {};
  return {placeName, actorName: str(user["fullName"]) || str(user["nickname"]) || placeName};
}

// ── listar ───────────────────────────────────────────────────────────────

export async function getClassReviewsForManagerCore(db: Firestore, uid: string, input: Data): Promise<ManagerReviewsPage> {
  const kind = parseKind(input["kind"]);
  const placeId = cleanId(input["placeId"], "Local");
  const {placeName} = await requireReviewManager(db, uid, kind, placeId, "read");

  const field = kind === "arena" ? "arenaId" : "centerId";
  const [snap, summarySnap] = await Promise.all([
    db.collection(CLASS_REVIEWS).where(field, "==", placeId).limit(MAX_REVIEWS).get(),
    db.collection(CLASS_REVIEW_SUMMARIES).doc(`${kind}_${placeId}`).get(),
  ]);

  // Avaliação de antes do `publicId`: ganha um agora (o handle anônimo da resposta).
  const batch = db.batch();
  let pending = 0;
  const docs = snap.docs.map((d) => {
    const data = d.data() as Data;
    if (!str(data["publicId"])) {
      data["publicId"] = newReviewPublicId();
      batch.update(d.ref, {publicId: data["publicId"]});
      pending++;
    }
    return data;
  });
  if (pending) await batch.commit();

  const all = docs.map(toManagerReview).sort(compareManagerReviews);
  const nums = (p: "class" | "professor" | "place") =>
    all.map((r) => r.scores[p]?.stars).filter((n): n is number => typeof n === "number");
  const offset = Math.max(0, Number.parseInt(str(input["cursor"]) || "0", 10) || 0);
  const page = all.slice(offset, offset + PAGE_SIZE);
  const {rating, count} = summaryRating(summarySnap.data());
  return {
    placeName,
    rating,
    ratingCount: count,
    averages: {class: average(nums("class")), professor: average(nums("professor")), place: average(nums("place"))},
    openTickets: all.filter((r) => r.ticket?.status === "open").length,
    total: all.length,
    reviews: page,
    nextCursor: offset + PAGE_SIZE < all.length ? String(offset + PAGE_SIZE) : null,
  };
}

// ── responder ────────────────────────────────────────────────────────────

export interface ReplyNotice {
  athleteUid: string;
  placeName: string;
  title: string;
  date: string;
  resolved: boolean;
}

export async function replyClassReviewTicketCore(
  db: Firestore,
  uid: string,
  input: Data,
  now = new Date(),
  notify: (n: ReplyNotice) => Promise<void> = async () => undefined,
): Promise<{status: TicketStatus; review: ManagerReview}> {
  const reviewId = cleanId(input["reviewId"], "Avaliação");
  const reply = str(input["reply"]);
  const resolve = input["resolve"] === true;
  if (!reply) throw new HttpsError("invalid-argument", "Escreva a resposta.");
  if (reply.length > CLASS_REVIEW_REPLY_MAX) {
    throw new HttpsError("invalid-argument", `A resposta passa de ${CLASS_REVIEW_REPLY_MAX} caracteres.`);
  }

  // O handle é o `publicId` (o id do doc leva o uid da aluna).
  const found = await db.collection(CLASS_REVIEWS).where("publicId", "==", reviewId).limit(2).get();
  if (found.size !== 1) throw new HttpsError("not-found", "Avaliação não encontrada.");
  const ref = found.docs[0].ref;
  const data = found.docs[0].data() as Data;
  const origin = str(data["origin"]);
  if (origin !== "arena" && origin !== "center") throw new HttpsError("failed-precondition", "Esta avaliação não tem local.");
  const placeId = str(data["placeId"]);
  const {placeName, actorName} = await requireReviewManager(db, uid, origin, placeId, "write");

  const status: TicketStatus = resolve ? "resolved" : "answered";
  const updated = await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    const d = (cur.data() ?? {}) as Data;
    const ticket = d["ticket"] && typeof d["ticket"] === "object" ? (d["ticket"] as Data) : null;
    if (!ticket) throw new HttpsError("failed-precondition", "Esta avaliação não pediu retorno.");
    const next = {
      ...ticket,
      status,
      reply,
      repliedAt: Timestamp.fromDate(now),
      repliedByName: actorName,
      repliedByUid: uid,
    };
    tx.update(ref, {ticket: next});
    return {...d, ticket: next};
  });

  try {
    await notify({
      athleteUid: str(data["uid"]),
      placeName,
      title: str(data["title"]) || "Aula",
      date: str(data["date"]),
      resolved: resolve,
    });
  } catch (err) {
    logger.warn("class-review: aviso da resposta falhou", {reviewId, err});
  }
  return {status, review: toManagerReview(updated)};
}

// ── professor ────────────────────────────────────────────────────────────

export interface ProfessorReview {
  id: string;
  anonymous: boolean;
  athleteName: string | null;
  date: string;
  startTime: string;
  title: string;
  placeName: string;
  stars: number;
  tags: string[];
  comment: string;
}

/** O professor vê só a parte dele (estrelas/tags) e o comentário; anônimo sem nome nem id. */
export function toProfessorReview(data: Data): ProfessorReview | null {
  const professor = part(((data["scores"] ?? {}) as Data)["professor"]);
  if (!professor) return null;
  const anonymous = data["showName"] === false;
  return {
    id: str(data["publicId"]),
    anonymous,
    athleteName: anonymous ? null : (str(data["athleteName"]) || null),
    date: str(data["date"]),
    startTime: str(data["startTime"]),
    title: str(data["title"]) || "Aula",
    placeName: str(data["placeName"]),
    stars: professor.stars,
    tags: professor.tags,
    comment: str(data["comment"]),
  };
}

export async function getMyProfessorReviewsCore(
  db: Firestore,
  uid: string,
): Promise<{rating: number | null; count: number; reviews: ProfessorReview[]}> {
  const snap = await db.collection(CLASS_REVIEWS).where("professorUids", "array-contains", uid).limit(MAX_REVIEWS).get();
  const reviews = snap.docs
    .map((d) => toProfessorReview(d.data() as Data))
    .filter((r): r is ProfessorReview => r != null)
    .sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`) || a.id.localeCompare(b.id));
  return {rating: average(reviews.map((r) => r.stars)), count: reviews.length, reviews: reviews.slice(0, 200)};
}

// ── callables ────────────────────────────────────────────────────────────

async function notifyReply(n: ReplyNotice): Promise<void> {
  if (!n.athleteUid) return;
  const day = n.date.split("-").reverse().slice(0, 2).join("/");
  await deliverNotificationToUser({
    userId: n.athleteUid,
    title: n.resolved ? `${n.placeName} resolveu seu chamado` : `${n.placeName} respondeu sua avaliação`,
    body: `Sobre ${n.title}${day ? ` (${day})` : ""}. Toque para ver a resposta.`,
    type: CLASS_REVIEW_REPLY_PUSH_TYPE,
    data: {url: CLASS_REVIEW_APP_URL},
  });
}

export const getClassReviewsForManager = onCall(
  {region: CLIENT_FACING_REGIONS},
  async (request) => getClassReviewsForManagerCore(getFirestore(), requireUid(request.auth), (request.data ?? {}) as Data),
);

export const replyClassReviewTicket = onCall(
  {region: CLIENT_FACING_REGIONS, secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT]},
  async (request) => replyClassReviewTicketCore(
    getFirestore(),
    requireUid(request.auth),
    (request.data ?? {}) as Data,
    new Date(),
    notifyReply,
  ),
);

export const getMyProfessorReviews = onCall(
  {region: CLIENT_FACING_REGIONS},
  async (request) => getMyProfessorReviewsCore(getFirestore(), requireUid(request.auth)),
);
