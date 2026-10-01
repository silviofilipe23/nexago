import {randomUUID} from "node:crypto";
import {getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  reviewInvitePath,
  TOURNAMENT_REVIEWS_COLLECTION,
  tournamentReviewDocId,
} from "./tournament-review-constants";
import {parseTournamentReviewInput} from "./tournament-review-input";

export interface SubmitTournamentReviewResult {
  ok: true;
  created: boolean;
}

/**
 * Grava (ou edita) a avaliação do atleta. O convite é a única prova de "pode avaliar e até
 * quando": sem ele, permission-denied; vencido, failed-precondition — mesmo que o job do dia
 * ainda não tenha marcado o convite como `expired`.
 *
 * `set` sem merge de propósito: na edição, aspecto que saiu do formulário sai do doc. O
 * `anonId` nasce na 1ª gravação e é preservado — é o id da cópia anônima.
 */
export async function submitTournamentReviewCore(
  db: Firestore,
  uid: string,
  raw: unknown,
  nowMs: number = Date.now(),
  newAnonId: () => string = randomUUID,
): Promise<SubmitTournamentReviewResult> {
  const input = parseTournamentReviewInput(raw);
  const inviteRef = db.doc(reviewInvitePath(uid, input.tournamentId));
  const reviewRef = db
    .collection(TOURNAMENT_REVIEWS_COLLECTION)
    .doc(tournamentReviewDocId(input.tournamentId, uid));
  const now = Timestamp.fromMillis(nowMs);

  return db.runTransaction(async (tx) => {
    const inviteSnap = await tx.get(inviteRef);
    const reviewSnap = await tx.get(reviewRef);
    if (!inviteSnap.exists) {
      throw new HttpsError("permission-denied", "Você não participou deste torneio.");
    }
    const invite = inviteSnap.data() as Record<string, unknown>;
    const closesAt = invite.closesAt instanceof Timestamp ? invite.closesAt.toMillis() : 0;
    if (invite.status === "expired" || closesAt <= nowMs) {
      throw new HttpsError("failed-precondition", "A avaliação deste torneio foi encerrada.");
    }

    const previous = reviewSnap.exists ? reviewSnap.data() as Record<string, unknown> : null;
    const previousAnonId = typeof previous?.anonId === "string" ? previous.anonId : "";
    tx.set(reviewRef, {
      tournamentId: input.tournamentId,
      organizerId: typeof invite.organizerId === "string" ? invite.organizerId : "",
      uid,
      overall: input.overall,
      aspects: input.aspects,
      comment: input.comment,
      anonId: previousAnonId || newAnonId(),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    });
    tx.update(inviteRef, {
      status: "submitted",
      submittedAt: invite.submittedAt ?? now,
    });
    return {ok: true as const, created: previous == null};
  });
}

export const submitTournamentReview = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return submitTournamentReviewCore(getFirestore(), uid, request.data);
});
