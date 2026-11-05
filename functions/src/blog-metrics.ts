/**
 * Métricas do blog (backoffice › Blog › cards de 30 dias e "resultado do post").
 *
 *   blogReads/{autoId}   — uma sessão de leitura no app, gravada pelo próprio atleta ao sair do post:
 *                          `{postId, uid, category, seconds, progress, finished, ctaClicked, at}`.
 *                          A rule valida forma e dono; o backoffice soma por contagem/média no servidor
 *                          do Firestore (sem ler os docs).
 *   blogReaders/{uid}    — `{firstReadAt, lastReadAt}`: leitores únicos e quem já lia antes da janela.
 *                          Só este gatilho grava.
 *
 * Leitura do site não entra (visitante anônimo): os números são do app.
 */
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import {getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";

export const BLOG_READS = "blogReads";
export const BLOG_READERS = "blogReaders";

/** Primeira e última leitura do atleta; a primeira nunca anda para frente. */
export async function recordBlogReader(db: Firestore, uid: string, at: Timestamp): Promise<void> {
  const ref = db.collection(BLOG_READERS).doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.data();
    const first = current?.["firstReadAt"] as Timestamp | undefined;
    const last = current?.["lastReadAt"] as Timestamp | undefined;
    tx.set(ref, {
      firstReadAt: first && first.toMillis() <= at.toMillis() ? first : at,
      lastReadAt: last && last.toMillis() >= at.toMillis() ? last : at,
    });
  });
}

export const onBlogReadCreated = onDocumentCreated("blogReads/{readId}", async (event) => {
  const data = event.data?.data();
  const uid = data?.["uid"];
  const at = data?.["at"];
  if (typeof uid !== "string" || !(at instanceof Timestamp)) return;
  try {
    await recordBlogReader(getFirestore(), uid, at);
  } catch (error) {
    logger.error("onBlogReadCreated: falha ao gravar leitor", {readId: event.params.readId, error});
  }
});
