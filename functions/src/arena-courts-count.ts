/**
 * Mantém `arenas/{arenaId}.courtsCount` em sincronia com a subcoleção `courts`.
 *
 * O contador é a base do gate de limite de quadras por plano nas
 * `firestore.rules` (Essencial: 2 quadras; Pro/Parceiro: ilimitado). Como as
 * rules não conseguem contar documentos, elas leem este campo — mantido apenas
 * pelo Admin SDK, então é confiável.
 *
 * Há uma pequena janela de corrida: várias criações em rajada podem passar
 * antes do contador atualizar. É aceitável para um limite de volume (não é
 * vetor financeiro) e a UI já bloqueia o caminho normal.
 */
import {onDocumentCreated, onDocumentDeleted} from "firebase-functions/v2/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {getFirestore, FieldValue} from "firebase-admin/firestore";

const COURTS_PATH = "arenas/{arenaId}/courts/{courtId}";

export const onArenaCourtCreatedCountUp = onDocumentCreated(COURTS_PATH, async (event) => {
  const arenaId = event.params.arenaId;
  if (!arenaId) return;
  try {
    await getFirestore()
      .collection("arenas")
      .doc(arenaId)
      .set({courtsCount: FieldValue.increment(1)}, {merge: true});
  } catch (error) {
    logger.error("onArenaCourtCreatedCountUp: falha ao incrementar courtsCount", {arenaId, error});
  }
});

export const onArenaCourtDeletedCountDown = onDocumentDeleted(COURTS_PATH, async (event) => {
  const arenaId = event.params.arenaId;
  if (!arenaId) return;
  const ref = getFirestore().collection("arenas").doc(arenaId);
  try {
    await getFirestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const current = typeof snap.data()?.["courtsCount"] === "number"
        ? (snap.data()?.["courtsCount"] as number)
        : 0;
      tx.update(ref, {courtsCount: current > 0 ? current - 1 : 0});
    });
  } catch (error) {
    logger.error("onArenaCourtDeletedCountDown: falha ao decrementar courtsCount", {arenaId, error});
  }
});

/**
 * Recalcula `courtsCount` de todas as arenas a partir da subcoleção real.
 * Rodar uma vez para popular arenas criadas antes do contador. Super admin only.
 */
export const backfillArenaCourtsCount = onCall(async (request) => {
  if (request.auth?.token?.["superAdmin"] !== true) {
    throw new HttpsError("permission-denied", "Apenas super admins podem executar o backfill.");
  }
  const db = getFirestore();
  const arenas = await db.collection("arenas").get();
  let updated = 0;
  for (const arena of arenas.docs) {
    const agg = await arena.ref.collection("courts").count().get();
    await arena.ref.set({courtsCount: agg.data().count}, {merge: true});
    updated++;
  }
  logger.info("backfillArenaCourtsCount concluído", {arenasUpdated: updated});
  return {arenasUpdated: updated};
});
