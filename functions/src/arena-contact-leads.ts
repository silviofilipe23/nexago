import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";

/**
 * Cliques no botão "Entre em contato" das arenas pré-cadastradas (`unclaimed: true`).
 *
 * Esses são os números que o comercial leva para a arena ("X atletas já te
 * procuraram pela nexaGO"), então o incremento não pode ficar no cliente: deixar
 * o contador aberto nas rules significaria escrita pública num doc de arena, e
 * um número inflado vale menos que número nenhum numa reunião de venda.
 *
 * Guarda duas coisas por clique:
 *   - agregados no doc da arena (`contactClicksTotal`, `contactAthletesCount`,
 *     `contactLastClickAt`) — leitura barata para a listagem do backoffice;
 *   - um doc por ATLETA em `arenas/{arenaId}/contactLeads/{uid}` — é o que
 *     responde "quantas pessoas" e "quantas no último mês" (via `lastClickAt`).
 *
 * `contactAthletesCount` só sobe no primeiro clique de cada atleta, e cliques
 * repetidos do mesmo atleta dentro de DEBOUNCE_SECONDS não contam — evita que
 * toque duplo ou volta-e-volta na tela inflem o número.
 */

const SURFACES = new Set(["app", "web"]);
const DEBOUNCE_SECONDS = 60;

export const trackArenaContactClick = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }

  const data = (request.data || {}) as Record<string, unknown>;
  const arenaIdRaw = data["arenaId"];
  const arenaId = typeof arenaIdRaw === "string" ? arenaIdRaw.trim() : "";
  // Id vem do Firestore; recusar o resto evita escrita em caminho arbitrário.
  if (!arenaId || arenaId.length > 200 || !/^[A-Za-z0-9_-]+$/.test(arenaId)) {
    throw new HttpsError("invalid-argument", "Arena inválida.");
  }

  const surfaceRaw = data["surface"];
  const surface = typeof surfaceRaw === "string" && SURFACES.has(surfaceRaw) ? surfaceRaw : "app";

  const db = getFirestore();
  const arenaRef = db.doc(`arenas/${arenaId}`);
  const leadRef = db.doc(`arenas/${arenaId}/contactLeads/${uid}`);

  try {
    return await db.runTransaction(async (tx) => {
      const arenaSnap = await tx.get(arenaRef);
      if (!arenaSnap.exists) {
        throw new HttpsError("not-found", "Arena não encontrada.");
      }
      // Arena parceira tem fluxo de reserva; o botão de contato só existe no
      // pré-cadastro, então clique aqui em arena reivindicada é chamada velha.
      if (arenaSnap.get("unclaimed") !== true) {
        throw new HttpsError("failed-precondition", "Esta arena já é parceira.");
      }

      const now = Timestamp.now();
      const leadSnap = await tx.get(leadRef);

      if (!leadSnap.exists) {
        tx.set(leadRef, {
          athleteUid: uid,
          firstClickAt: now,
          lastClickAt: now,
          clickCount: 1,
          surfaces: [surface],
        });
        tx.update(arenaRef, {
          contactClicksTotal: FieldValue.increment(1),
          contactAthletesCount: FieldValue.increment(1),
          contactLastClickAt: now,
        });
        return {ok: true, counted: true};
      }

      const lastClickAt = leadSnap.get("lastClickAt");
      const lastMillis = lastClickAt instanceof Timestamp ? lastClickAt.toMillis() : 0;
      if (now.toMillis() - lastMillis < DEBOUNCE_SECONDS * 1000) {
        return {ok: true, counted: false};
      }

      tx.update(leadRef, {
        lastClickAt: now,
        clickCount: FieldValue.increment(1),
        surfaces: FieldValue.arrayUnion(surface),
      });
      tx.update(arenaRef, {
        contactClicksTotal: FieldValue.increment(1),
        contactLastClickAt: now,
      });
      return {ok: true, counted: true};
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.warn("Falha ao registrar clique de contato", {arenaId, uid, error});
    throw new HttpsError("internal", "Não foi possível registrar o contato.");
  }
});
