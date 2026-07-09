import {onSchedule} from "firebase-functions/v2/scheduler";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  deliverFriendlyMatchNotifications,
  type FriendlyMatchNotification,
} from "./friendly-match-invite";
import {
  applyReputationEvent,
  reviewReceivedEventId,
} from "./friendly-match-reputation";

/**
 * Bora Jogar — avaliação mútua double-blind, par a par, entre N participantes.
 *
 * As notas ficam em `friendlyMatches/{id}/privateReviews/{reviewerUid}_{revieweeUid}`,
 * ilegíveis para QUALQUER cliente (rules `if false`; só o Admin SDK lê).
 * O reveal acontece POR PAR: assim que os dois lados de um par avaliaram um
 * ao outro, essa dupla entra no campo público `reviews` (mapa aninhado
 * `reviews[reviewerUid][revieweeUid]`) — sem esperar o resto do grupo. O
 * match só fecha em `status: "reviewed"` quando TODOS os pares ordenados de
 * `participantUids` tiverem sido revelados (checado inspecionando a forma do
 * próprio mapa `reviews`, sem contador redundante). O app só lê o doc
 * principal, então vazar nota antes do reveal do par é estruturalmente
 * impossível. Nas transações, TODAS as leituras vêm antes das escritas
 * (exigência do Firestore real).
 */

const MATCHES_COLLECTION = "friendlyMatches";
const SWEEP_LIMIT = 50;
const TIME_ZONE = "America/Sao_Paulo";
const MAX_COMMENT_LENGTH = 300;
const MAX_TAGS = 5;

type MatchData = Record<string, unknown>;

type StoredReview = {
  stars: number;
  tags?: string[];
  comment?: string;
};

function historyEntry(status: string, actorUid: string, nowMs: number): MatchData {
  return {status, actorUid, at: Timestamp.fromMillis(nowMs)};
}

function appendHistory(data: MatchData, entry: MatchData): MatchData[] {
  const history = Array.isArray(data.history) ? (data.history as MatchData[]) : [];
  return [...history, entry];
}

function sanitizeReviewInput(input: {
  stars: number;
  tags?: string[];
  comment?: string;
}): StoredReview {
  const {stars} = input;
  if (typeof stars !== "number" || !Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new HttpsError("invalid-argument", "A nota deve ser de 1 a 5 estrelas.");
  }
  const review: StoredReview = {stars};
  if (input.tags != null) {
    if (!Array.isArray(input.tags) || input.tags.length > MAX_TAGS) {
      throw new HttpsError("invalid-argument", `Escolha até ${MAX_TAGS} selos.`);
    }
    const tags = input.tags
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0 && tag.length <= 40);
    if (tags.length > 0) review.tags = tags;
  }
  if (input.comment != null) {
    if (typeof input.comment !== "string" || input.comment.length > MAX_COMMENT_LENGTH) {
      throw new HttpsError(
        "invalid-argument", `Comentário deve ter até ${MAX_COMMENT_LENGTH} caracteres.`);
    }
    const comment = input.comment.trim();
    if (comment) review.comment = comment;
  }
  return review;
}

/** Verdadeiro quando TODOS os pares ordenados do grupo já foram revelados. */
function allPairsRevealed(
  reviews: Record<string, Record<string, unknown>>,
  participantUids: string[],
): boolean {
  return participantUids.every((reviewer) =>
    participantUids.every((reviewee) =>
      reviewer === reviewee || reviews[reviewer]?.[reviewee] != null));
}

export async function submitFriendlyMatchReviewCore(
  db: Firestore,
  uid: string,
  input: {matchId: string; revieweeUid: string; stars: number; tags?: string[]; comment?: string},
  nowMs: number = Date.now(),
): Promise<{revealed: boolean; notifications: FriendlyMatchNotification[]}> {
  const matchId = typeof input.matchId === "string" ? input.matchId.trim() : "";
  if (!matchId) throw new HttpsError("invalid-argument", "Jogo inválido.");
  const revieweeUid = typeof input.revieweeUid === "string" ? input.revieweeUid.trim() : "";
  const review = sanitizeReviewInput(input);
  const matchRef = db.collection(MATCHES_COLLECTION).doc(matchId);

  type Outcome =
    | {kind: "waiting"}
    | {kind: "revealed"; matchId: string; reviewerUid: string; revieweeUid: string;
       reviewerReview: StoredReview; revieweeReview: StoredReview};

  const outcome = await db.runTransaction<Outcome>(async (tx) => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists) throw new HttpsError("not-found", "Jogo não encontrado.");
    const data = matchSnap.data() as MatchData;
    const participantUids = data.participantUids as string[];
    if (!participantUids.includes(uid)) {
      throw new HttpsError("permission-denied", "Você não participa deste jogo.");
    }
    if (!revieweeUid || revieweeUid === uid || !participantUids.includes(revieweeUid)) {
      throw new HttpsError("invalid-argument", "Escolha quem você está avaliando.");
    }
    const myReviewRef = db.doc(`${MATCHES_COLLECTION}/${matchId}/privateReviews/${uid}_${revieweeUid}`);
    const otherReviewRef = db.doc(`${MATCHES_COLLECTION}/${matchId}/privateReviews/${revieweeUid}_${uid}`);
    const [mySnap, otherSnap] = [await tx.get(myReviewRef), await tx.get(otherReviewRef)];

    if (data.status !== "completed") {
      throw new HttpsError("failed-precondition", "Este jogo não está aguardando avaliação.");
    }
    const revealAt = data.reviewRevealAt as Timestamp | undefined;
    if (revealAt != null && nowMs >= revealAt.toMillis()) {
      throw new HttpsError("failed-precondition", "O prazo de avaliação deste jogo já encerrou.");
    }
    if (mySnap.exists) {
      throw new HttpsError("failed-precondition", "Você já avaliou esta pessoa.");
    }

    tx.set(myReviewRef, {
      ...review, reviewerUid: uid, revieweeUid, createdAt: Timestamp.fromMillis(nowMs),
    });

    if (!otherSnap.exists) {
      tx.set(matchRef, {updatedAt: Timestamp.fromMillis(nowMs)}, {merge: true});
      return {kind: "waiting"};
    }

    const otherReview = otherSnap.data() as StoredReview;
    const reviews = {
      ...(data.reviews as Record<string, Record<string, StoredReview>> ?? {}),
    };
    reviews[uid] = {...(reviews[uid] ?? {}), [revieweeUid]: review};
    reviews[revieweeUid] = {...(reviews[revieweeUid] ?? {}), [uid]: otherReview};
    const done = allPairsRevealed(reviews, participantUids);
    const update: MatchData = {reviews, updatedAt: Timestamp.fromMillis(nowMs)};
    if (done) {
      update.status = "reviewed";
      update.statusUpdatedAt = Timestamp.fromMillis(nowMs);
      update.reviewsRevealedAt = Timestamp.fromMillis(nowMs);
      update.history = appendHistory(data, historyEntry("reviewed", "system", nowMs));
    }
    tx.set(matchRef, update, {merge: true});
    return {
      kind: "revealed", matchId, reviewerUid: uid, revieweeUid,
      reviewerReview: review, revieweeReview: otherReview,
    };
  });

  if (outcome.kind === "waiting") return {revealed: false, notifications: []};
  await applyReputationEvent(
    db, outcome.revieweeUid, reviewReceivedEventId(matchId, outcome.reviewerUid, outcome.revieweeUid),
    "review_received", {matchId, stars: outcome.reviewerReview.stars});
  await applyReputationEvent(
    db, outcome.reviewerUid, reviewReceivedEventId(matchId, outcome.revieweeUid, outcome.reviewerUid),
    "review_received", {matchId, stars: outcome.revieweeReview.stars});
  return {
    revealed: true,
    notifications: [
      {userId: outcome.revieweeUid, title: "Avaliação revelada ⭐",
        body: "Alguém avaliou o jogo com você. Veja como foi.",
        type: "friendly_match_reviewed", data: {type: "friendly_match_reviewed", matchId}},
      {userId: outcome.reviewerUid, title: "Avaliação revelada ⭐",
        body: "Alguém avaliou o jogo com você. Veja como foi.",
        type: "friendly_match_reviewed", data: {type: "friendly_match_reviewed", matchId}},
    ],
  };
}

export async function revealFriendlyMatchReviewsIfDue(
  db: Firestore,
  matchId: string,
  nowMs: number = Date.now(),
): Promise<{revealed: boolean; notifications: FriendlyMatchNotification[]}> {
  const matchRef = db.collection(MATCHES_COLLECTION).doc(matchId);

  type Outcome = {data: MatchData; reviews: Record<string, StoredReview>} | null;

  const outcome = await db.runTransaction<Outcome>(async (tx) => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists) return null;
    const data = matchSnap.data() as MatchData;
    if (data.status !== "completed") return null;
    const revealAt = data.reviewRevealAt as Timestamp | undefined;
    if (revealAt == null || revealAt.toMillis() > nowMs) return null;

    const reviews: Record<string, StoredReview> = {};
    for (const reviewerUid of [data.fromUid as string, data.toUid as string]) {
      const snap = await tx.get(
        db.doc(`${MATCHES_COLLECTION}/${matchId}/privateReviews/${reviewerUid}`));
      if (snap.exists) {
        const stored = snap.data() as StoredReview;
        reviews[reviewerUid] = {
          stars: stored.stars,
          ...(stored.tags ? {tags: stored.tags} : {}),
          ...(stored.comment ? {comment: stored.comment} : {}),
        };
      }
    }
    tx.set(matchRef, revealUpdate(data, reviews, nowMs), {merge: true});
    return {data, reviews};
  });

  if (outcome == null) return {revealed: false, notifications: []};
  const notifications = await applyRevealEffects(
    db, matchId, outcome.data, outcome.reviews);
  return {revealed: true, notifications};
}

// ---------------------------------------------------------------------------
// Wrappers
// ---------------------------------------------------------------------------

export const submitFriendlyMatchReview = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const data = request.data as {
    matchId: string; revieweeUid: string; stars: number; tags?: string[]; comment?: string;
  };
  const result = await submitFriendlyMatchReviewCore(getFirestore(), uid, data);
  await deliverFriendlyMatchNotifications(result.notifications);
  return {revealed: result.revealed};
});

export const revealFriendlyMatchReviews = onSchedule(
  {schedule: "every 5 minutes", timeZone: TIME_ZONE},
  async () => {
    const db = getFirestore();
    const now = Timestamp.now();
    const snap = await db
      .collection(MATCHES_COLLECTION)
      .where("status", "==", "completed")
      .where("reviewRevealAt", "<=", now)
      .limit(SWEEP_LIMIT)
      .get();
    for (const doc of snap.docs) {
      try {
        const result = await revealFriendlyMatchReviewsIfDue(db, doc.id, now.toMillis());
        await deliverFriendlyMatchNotifications(result.notifications);
      } catch (error) {
        logger.error("revealFriendlyMatchReviews: falha no reveal", {matchId: doc.id, error});
      }
    }
  },
);
