/**
 * Avaliar aulas (app do atleta, canvas "Treinos v2" A1–A7): depois de um treino com presença, o
 * aluno dá estrelas separadas para a AULA, o PROFESSOR e o LOCAL (arena ou centro), com tags e
 * comentário. Particular só tem professor (a aula particular não guarda onde aconteceu).
 *
 * - `classReviews/{key}_{uid}` — gravado só por `submitClassReview`, que confere a presença no
 *   servidor. Só o próprio aluno lê (rules): a gestão vai ler por callable, sem o uid quando o
 *   aluno escondeu o nome.
 * - `classReviewSummaries/{arena_<id>|center_<id>}` — soma e contagem da nota do LOCAL, atualizada
 *   na mesma transação (edição aplica a diferença). O diretório de aulas mostra a média com 3+.
 * - Professor: a nota entra na média pública dele (`loadProfessorRating`), junto com as estrelas
 *   do feedback de aula.
 * - Nota ≤ 2 com "Pedir retorno" (arena/CT) abre um chamado (`ticket`) e avisa o gestor.
 *
 * Janela: avaliar até [CLASS_REVIEW_WINDOW_DAYS] dias depois da aula; editar até
 * [CLASS_REVIEW_EDIT_DAYS] dias depois do primeiro envio.
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {Timestamp, getFirestore, type Firestore} from "firebase-admin/firestore";
import {ARENA_CLASS_SESSIONS} from "./arena-class-constants";
import {requireUid, str} from "./arena-class";
import {TRAINING_CENTERS} from "./training-center-billing-model";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
  deliverNotificationToUser,
} from "./notification-delivery";

export const CLASS_REVIEWS = "classReviews";
export const CLASS_REVIEW_SUMMARIES = "classReviewSummaries";
export const CLASS_REVIEW_WINDOW_DAYS = 7;
export const CLASS_REVIEW_EDIT_DAYS = 7;
export const CLASS_REVIEW_COMMENT_MAX = 600;
export const CLASS_REVIEW_MAX_TAGS = 6;
export const CLASS_REVIEW_TAG_MAX = 40;
/** Média do local só sai com pelo menos tantas avaliações. */
export const CLASS_REVIEW_MIN_PUBLIC = 3;
export const CLASS_REVIEW_TICKET_PUSH_TYPE = "class_review_ticket";
const DAY_MS = 86_400_000;

type Data = Record<string, unknown>;

export type ReviewOrigin = "arena" | "center" | "private";
export type ReviewPart = "class" | "professor" | "place";

export interface PartScore {
  stars: number;
  tags: string[];
}

export interface ClassReviewScores {
  class: PartScore | null;
  professor: PartScore | null;
  place: PartScore | null;
}

/** O treino avaliado, como o servidor o encontrou. */
export interface ReviewTarget {
  origin: ReviewOrigin;
  key: string;
  /** Instante do FIM da aula (a janela conta daqui). */
  endsAt: Date;
  date: string;
  startTime: string;
  title: string;
  professorUid: string | null;
  professorName: string;
  /** Arena ou centro (null na particular). */
  placeId: string | null;
  placeName: string;
  /** Quem recebe o chamado de nota baixa. */
  managerUid: string | null;
  /** Partes que o aluno avalia, nessa ordem. */
  parts: ReviewPart[];
}

// ── validação pura ───────────────────────────────────────────────────────

export function reviewKey(origin: ReviewOrigin, ids: {sessionId?: string; centerId?: string; lessonId?: string}): string {
  if (origin === "arena") return `a_${ids.sessionId}`;
  if (origin === "center") return `ct_${ids.centerId}_${ids.sessionId}`;
  return `p_${ids.lessonId}`;
}

function cleanId(v: unknown, label: string): string {
  const s = str(v);
  if (!s || s.includes("/") || s.length > 200) throw new HttpsError("invalid-argument", `${label} inválido.`);
  return s;
}

function parsePart(raw: unknown, label: string): PartScore | null {
  if (raw == null) return null;
  if (typeof raw !== "object") throw new HttpsError("invalid-argument", `Nota de ${label} inválida.`);
  const d = raw as Data;
  const stars = d["stars"];
  if (typeof stars !== "number" || !Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new HttpsError("invalid-argument", `Dê de 1 a 5 estrelas para ${label}.`);
  }
  const tagsRaw = Array.isArray(d["tags"]) ? d["tags"] : [];
  const tags = [...new Set(tagsRaw.map(str).filter(Boolean))];
  if (tags.length > CLASS_REVIEW_MAX_TAGS || tags.some((t) => t.length > CLASS_REVIEW_TAG_MAX)) {
    throw new HttpsError("invalid-argument", "Tags demais ou longas demais.");
  }
  return {stars, tags};
}

const PART_LABEL: Record<ReviewPart, string> = {class: "a aula", professor: "o professor", place: "o local"};

/**
 * Notas da gravação. Toda parte que a origem tem é obrigatória, exceto o local (que a particular
 * nem tem); parte que a origem não tem é descartada.
 */
export function validateScores(raw: unknown, parts: ReviewPart[]): ClassReviewScores {
  const d = (raw && typeof raw === "object" ? raw : {}) as Data;
  const out: ClassReviewScores = {class: null, professor: null, place: null};
  for (const p of parts) {
    const score = parsePart(d[p], PART_LABEL[p]);
    if (!score) throw new HttpsError("invalid-argument", `Falta avaliar ${PART_LABEL[p]}.`);
    out[p] = score;
  }
  return out;
}

/** Alguma nota ≤ 2 (o que vira chamado, se o aluno pedir retorno). */
export function hasLowScore(s: ClassReviewScores): boolean {
  return [s.class, s.professor, s.place].some((p) => p != null && p.stars <= 2);
}

/** Janela de avaliar (desde o fim da aula) e de editar (desde o 1º envio). */
export function assertReviewWindow(endsAt: Date, createdAt: Date | null, now: Date): void {
  if (now.getTime() < endsAt.getTime()) {
    throw new HttpsError("failed-precondition", "Dá para avaliar depois que o treino terminar.");
  }
  if (createdAt) {
    if (now.getTime() - createdAt.getTime() > CLASS_REVIEW_EDIT_DAYS * DAY_MS) {
      throw new HttpsError("failed-precondition", "O prazo para editar esta avaliação acabou.");
    }
    return;
  }
  if (now.getTime() - endsAt.getTime() > CLASS_REVIEW_WINDOW_DAYS * DAY_MS) {
    throw new HttpsError("failed-precondition", "O prazo para avaliar este treino acabou.");
  }
}

/** "HH:mm" + minutos → instante (calendário de São Paulo, UTC−3). */
function spInstant(date: string, hhmm: string, plusMinutes = 0): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const base = Date.parse(`${date}T00:00:00-03:00`);
  return new Date(base + ((h || 0) * 60 + (m || 0) + plusMinutes) * 60_000);
}

function toDate(v: unknown): Date | null {
  return v != null && typeof (v as {toDate?: unknown}).toDate === "function" ? (v as {toDate(): Date}).toDate() : null;
}

// ── de onde vem o treino (com presença conferida) ────────────────────────

async function loadArenaTarget(db: Firestore, uid: string, sessionId: string): Promise<ReviewTarget> {
  const snap = await db.collection(ARENA_CLASS_SESSIONS).doc(sessionId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Aula não encontrada.");
  const s = snap.data() as Data;
  const attendance = (s["attendance"] ?? {}) as Record<string, Data>;
  const extras = (s["extras"] ?? {}) as Record<string, Data>;
  // Aluno com conta: a chave é o uid. Encaixe (reposição/experimental): a chave do extra.
  const extraKey = Object.keys(extras).find((k) => str(extras[k]?.["athleteId"]) === uid);
  const mark = str(attendance[uid]?.["mark"]) || (extraKey ? str(attendance[extraKey]?.["mark"]) : "");
  if (mark !== "present") {
    throw new HttpsError("failed-precondition", "Só dá para avaliar aula com presença confirmada.");
  }
  const arenaId = str(s["arenaId"]);
  const arena = arenaId ? (await db.collection("arenas").doc(arenaId).get()).data() ?? {} : {};
  const date = str(s["date"]);
  const startTime = str(s["startTime"]);
  const endTime = str(s["endTime"]) || startTime;
  return {
    origin: "arena",
    key: reviewKey("arena", {sessionId}),
    endsAt: spInstant(date, endTime),
    date,
    startTime,
    title: str(s["className"]) || "Aula",
    professorUid: str(s["teacherUserId"]) || null,
    professorName: str(s["teacherName"]) || "Professor",
    placeId: arenaId || null,
    placeName: str(s["arenaName"]) || str(arena["name"]) || "Arena",
    managerUid: str(arena["managerUserId"]) || null,
    parts: ["class", "professor", "place"],
  };
}

async function loadCenterTarget(db: Firestore, uid: string, centerId: string, sessionId: string): Promise<ReviewTarget> {
  const centerRef = db.collection(TRAINING_CENTERS).doc(centerId);
  const [centerSnap, sessionSnap, students] = await Promise.all([
    centerRef.get(),
    centerRef.collection("sessions").doc(sessionId).get(),
    centerRef.collection("students").where("uid", "==", uid).limit(5).get(),
  ]);
  if (!centerSnap.exists || !sessionSnap.exists) throw new HttpsError("not-found", "Aula não encontrada.");
  const s = sessionSnap.data() as Data;
  const attendance = (s["attendance"] ?? {}) as Record<string, unknown>;
  const present = students.docs.some((d) => attendance[d.id] === "present");
  if (!present) throw new HttpsError("failed-precondition", "Só dá para avaliar aula com presença confirmada.");
  const center = centerSnap.data() as Data;
  const date = str(s["date"]);
  const startTime = str(s["startTime"]);
  const duration = typeof s["durationMin"] === "number" ? (s["durationMin"] as number) : 60;
  return {
    origin: "center",
    key: reviewKey("center", {centerId, sessionId}),
    endsAt: spInstant(date, startTime, duration),
    date,
    startTime,
    title: str(s["className"]) || "Aula",
    professorUid: str(s["coachUid"]) || null,
    professorName: str(s["coachName"]) || "Professor",
    placeId: centerId,
    placeName: str(center["name"]) || "Centro de treinamento",
    managerUid: str(center["ownerUid"]) || null,
    parts: ["class", "professor", "place"],
  };
}

async function loadPrivateTarget(db: Firestore, uid: string, lessonId: string): Promise<ReviewTarget> {
  const snap = await db.collection("professorPrivateLessons").doc(lessonId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Aula não encontrada.");
  const l = snap.data() as Data;
  if (str(l["athleteId"]) !== uid) throw new HttpsError("permission-denied", "Esta aula não é sua.");
  if (str(l["status"]) !== "confirmed") {
    throw new HttpsError("failed-precondition", "Só dá para avaliar particular confirmada.");
  }
  const startAt = toDate(l["startAt"]);
  const endsAt = toDate(l["endAt"]) ?? (startAt ? new Date(startAt.getTime() + 60 * 60_000) : null);
  if (!endsAt) throw new HttpsError("failed-precondition", "Aula sem horário.");
  const local = startAt ? new Date(startAt.getTime() - 3 * 3_600_000) : null;
  return {
    origin: "private",
    key: reviewKey("private", {lessonId}),
    endsAt,
    date: str(l["date"]) || (local ? local.toISOString().slice(0, 10) : ""),
    startTime: local ? local.toISOString().slice(11, 16) : "",
    title: "Particular",
    professorUid: str(l["professorUid"]) || null,
    professorName: str(l["professorName"]) || "Professor",
    placeId: null,
    placeName: "",
    managerUid: null,
    parts: ["professor"],
  };
}

export async function loadReviewTarget(db: Firestore, uid: string, input: Data): Promise<ReviewTarget> {
  const origin = str(input["origin"]);
  if (origin === "arena") return loadArenaTarget(db, uid, cleanId(input["sessionId"], "Aula"));
  if (origin === "center") {
    return loadCenterTarget(db, uid, cleanId(input["centerId"], "Centro"), cleanId(input["sessionId"], "Aula"));
  }
  if (origin === "private") return loadPrivateTarget(db, uid, cleanId(input["lessonId"], "Aula"));
  throw new HttpsError("invalid-argument", "Origem inválida.");
}

export function summaryId(target: Pick<ReviewTarget, "origin" | "placeId">): string | null {
  if (!target.placeId || target.origin === "private") return null;
  return `${target.origin}_${target.placeId}`;
}

// ── gravação ─────────────────────────────────────────────────────────────

export interface SubmitResult {
  reviewId: string;
  created: boolean;
  ticketOpened: boolean;
}

export async function submitClassReviewCore(
  db: Firestore,
  uid: string,
  input: Data,
  now = new Date(),
  notify: (managerUid: string, target: ReviewTarget, reviewId: string) => Promise<void> = async () => undefined,
): Promise<SubmitResult> {
  const target = await loadReviewTarget(db, uid, input);
  const scores = validateScores(input["scores"], target.parts);
  const comment = str(input["comment"]);
  if (comment.length > CLASS_REVIEW_COMMENT_MAX) {
    throw new HttpsError("invalid-argument", `O comentário passa de ${CLASS_REVIEW_COMMENT_MAX} caracteres.`);
  }
  const showName = input["showName"] !== false;
  const wantsContact = input["wantsContact"] === true && target.origin !== "private" && hasLowScore(scores);
  const reviewId = `${target.key}_${uid}`;
  const reviewRef = db.collection(CLASS_REVIEWS).doc(reviewId);
  const sumId = summaryId(target);
  const userSnap = showName ? await db.collection("users").doc(uid).get() : null;
  const athleteName = userSnap ? (str(userSnap.data()?.["fullName"]) || str(userSnap.data()?.["nickname"])) : "";

  const summaryRef = sumId ? db.collection(CLASS_REVIEW_SUMMARIES).doc(sumId) : null;
  const result = await db.runTransaction(async (tx) => {
    // Leituras antes das escritas (regra da transação).
    const [prevSnap, sumSnap] = await Promise.all([tx.get(reviewRef), summaryRef ? tx.get(summaryRef) : null]);
    const prev = prevSnap.exists ? (prevSnap.data() as Data) : null;
    const createdAt = prev ? toDate(prev["createdAt"]) : null;
    assertReviewWindow(target.endsAt, createdAt, now);

    const prevTicket = (prev?.["ticket"] ?? null) as Data | null;
    // Chamado: abre na 1ª vez que o aluno pede; já aberto/respondido fica como está.
    const ticket = wantsContact ?
      (prevTicket ?? {status: "open", openedAt: Timestamp.fromDate(now), reply: null, repliedAt: null, repliedByName: null}) :
      (prevTicket && str(prevTicket["status"]) !== "open" ? prevTicket : null);
    const ticketOpened = wantsContact && !prevTicket;

    tx.set(reviewRef, {
      uid,
      origin: target.origin,
      key: target.key,
      date: target.date,
      startTime: target.startTime,
      title: target.title,
      professorUid: target.professorUid,
      professorName: target.professorName,
      // Busca do professor (média pública) sem índice composto.
      professorUids: target.professorUid ? [target.professorUid] : [],
      placeId: target.placeId,
      placeName: target.placeName,
      arenaId: target.origin === "arena" ? target.placeId : null,
      centerId: target.origin === "center" ? target.placeId : null,
      scores,
      comment,
      showName,
      athleteName: showName ? athleteName : null,
      wantsContact,
      ticket,
      createdAt: createdAt ? Timestamp.fromDate(createdAt) : Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
      editableUntil: Timestamp.fromDate(new Date((createdAt ?? now).getTime() + CLASS_REVIEW_EDIT_DAYS * DAY_MS)),
    });

    if (summaryRef) {
      const prevPlace = ((prev?.["scores"] ?? {}) as Data)["place"] as Data | null | undefined;
      const prevStars = typeof prevPlace?.["stars"] === "number" ? (prevPlace["stars"] as number) : 0;
      const nextStars = scores.place?.stars ?? 0;
      if (prevStars !== nextStars) {
        const cur = (sumSnap?.exists ? sumSnap.data() : {}) as Data;
        const sum = (typeof cur["sum"] === "number" ? (cur["sum"] as number) : 0) + nextStars - prevStars;
        const count = (typeof cur["count"] === "number" ? (cur["count"] as number) : 0) + (nextStars ? 1 : 0) - (prevStars ? 1 : 0);
        tx.set(summaryRef, {
          origin: target.origin,
          placeId: target.placeId,
          sum: Math.max(0, sum),
          count: Math.max(0, count),
          updatedAt: Timestamp.fromDate(now),
        });
      }
    }
    return {reviewId, created: !prev, ticketOpened};
  });

  if (result.ticketOpened && target.managerUid) {
    try {
      await notify(target.managerUid, target, reviewId);
    } catch (err) {
      logger.warn("class-review: aviso do chamado falhou", {reviewId, err});
    }
  }
  return result;
}

/** Média pública do local (`null` abaixo do mínimo). */
export function summaryRating(data: unknown): {rating: number | null; count: number} {
  const d = (data ?? {}) as Data;
  const count = typeof d["count"] === "number" ? Math.max(0, d["count"] as number) : 0;
  const sum = typeof d["sum"] === "number" ? (d["sum"] as number) : 0;
  if (count < CLASS_REVIEW_MIN_PUBLIC) return {rating: null, count};
  return {rating: Math.round((sum / count) * 10) / 10, count};
}

/** Estrelas do professor nas avaliações de aula (soma à média pública dele). */
export async function loadProfessorReviewStars(db: Firestore, professorUid: string, limit = 1000): Promise<number[]> {
  const snap = await db.collection(CLASS_REVIEWS).where("professorUids", "array-contains", professorUid).limit(limit).get();
  return snap.docs
    .map((d) => (((d.data()["scores"] ?? {}) as Data)["professor"] as Data | null)?.["stars"])
    .filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5);
}

// ── callable ─────────────────────────────────────────────────────────────

async function notifyTicket(managerUid: string, target: ReviewTarget, reviewId: string): Promise<void> {
  const where = target.origin === "center" ? "o centro" : "a arena";
  await deliverNotificationToUser({
    userId: managerUid,
    title: "Avaliação com pedido de retorno",
    body: `Um aluno deu nota baixa para ${target.title} (${target.date.split("-").reverse().slice(0, 2).join("/")}) e pediu retorno de ${where}.`,
    type: CLASS_REVIEW_TICKET_PUSH_TYPE,
    data: {reviewId, origin: target.origin, placeId: target.placeId ?? ""},
  });
}

export const submitClassReview = onCall(
  {region: CLIENT_FACING_REGIONS, secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT]},
  async (request) => submitClassReviewCore(
    getFirestore(),
    requireUid(request.auth),
    (request.data ?? {}) as Data,
    new Date(),
    notifyTicket,
  ),
);
