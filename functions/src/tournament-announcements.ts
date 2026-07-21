import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue, type Firestore} from "firebase-admin/firestore";
import {assertCanManageTournament} from "./tournament-acl";
import {deliverNotificationToUser} from "./notification-delivery";
import {artifactsInscriptionsPath, artifactsTeamsPath, getFirebaseProjectId} from "./firebase-paths";

/**
 * Avisos do organizador — canal PÚBLICO e PERSISTENTE de comunicados do
 * torneio inteiro.
 *
 * Diferente de `sendCategoryCommunication` (organizer-category-ops.ts), que
 * é mensagem DIRETA (push + link de WhatsApp) só pros times já inscritos
 * numa categoria específica e some do feed depois de enviada (cai só no
 * inbox genérico do atleta) — aqui o aviso vira um item em `communityFeed`
 * (mesma coleção do feed automático `tournament_open`/`tournament_champions`,
 * ver `community-feed.ts`), visível a qualquer torcedor (não só inscritos) e
 * permanece lá.
 *
 * ID do item: `announcement_{tournamentId}_{timestampMs}` — determinístico o
 * bastante pra depurar/ordenar, mas único por publicação (o timestamp em ms
 * evita colisão entre avisos sucessivos do mesmo torneio; diferente de
 * `open_{tournamentId}`/`champions_{tournamentId}` que são eventos únicos
 * por torneio, um torneio pode ter vários avisos).
 *
 * `communityFeed` já tem `allow write: if false` no firestore.rules — só
 * Admin SDK escreve, então o novo `type` não exigiu mudança de regra.
 */

const MAX_MESSAGE_LENGTH = 500;

export interface PostTournamentAnnouncementInput {
  tournamentId?: string;
  message?: string;
}

export interface PostTournamentAnnouncementResult {
  feedId: string;
  tournamentId: string;
  message: string;
  /** Uids de atletas inscritos (qualquer categoria) a notificar via push. */
  recipientUids: string[];
}

/**
 * Resolve os uids de todos os atletas inscritos no torneio, em qualquer
 * categoria — não filtra por status de pagamento/fila: um aviso público
 * (ex. mudança de horário por clima) vale pra quem já garantiu vaga numa
 * inscrição, mesmo pendente. Mesmo padrão de resolução times->uids já usado
 * em `sendCategoryCommunication`/`cancelTournament`, só sem o filtro de
 * `categoryId`.
 */
export async function resolveTournamentRegisteredAthleteUids(
  db: Firestore,
  tournamentId: string,
  projectId: string = getFirebaseProjectId(),
): Promise<string[]> {
  const inscriptionsSnap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .get();

  const teamIds = new Set<string>();
  for (const doc of inscriptionsSnap.docs) {
    const teamId = (doc.data()["teamId"] as string | undefined)?.trim();
    if (teamId) teamIds.add(teamId);
  }

  const uids = new Set<string>();
  for (const teamId of teamIds) {
    const teamSnap = await db
      .doc(`${artifactsTeamsPath(projectId)}/${teamId}`)
      .get();
    const team = teamSnap.data() ?? {};
    for (const id of [team["player1Id"], team["player2Id"]]) {
      if (typeof id === "string" && id.trim()) uids.add(id.trim());
    }
  }
  return [...uids];
}

/**
 * Lógica pura (sem push): valida, autoriza (reaproveita
 * `assertCanManageTournament`, mesmo guard de `sendCategoryCommunication`) e
 * grava o aviso em `communityFeed`. Retorna os uids a notificar; o wrapper
 * `onCall` decide se/como envia o push (mantém a lógica testável sem FCM).
 */
export async function postTournamentAnnouncementCore(
  db: Firestore,
  uid: string,
  input: PostTournamentAnnouncementInput,
  nowMs: number = Date.now(),
): Promise<PostTournamentAnnouncementResult> {
  const tournamentId = (input.tournamentId ?? "").trim();
  const message = (input.message ?? "").trim();
  if (!tournamentId || !message) {
    throw new HttpsError(
      "invalid-argument",
      "tournamentId e message são obrigatórios.",
    );
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new HttpsError(
      "invalid-argument",
      `Mensagem muito longa (máx. ${MAX_MESSAGE_LENGTH} caracteres).`,
    );
  }

  await assertCanManageTournament(db, uid, tournamentId);

  const feedId = `announcement_${tournamentId}_${nowMs}`;
  await db.doc(`communityFeed/${feedId}`).set({
    type: "organizer_announcement",
    tournamentId,
    message,
    createdAt: FieldValue.serverTimestamp(),
  });

  const recipientUids = await resolveTournamentRegisteredAthleteUids(
    db,
    tournamentId,
  );

  return {feedId, tournamentId, message, recipientUids};
}

export const postTournamentAnnouncement = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const db = getFirestore();
  const result = await postTournamentAnnouncementCore(
    db,
    uid,
    (request.data ?? {}) as PostTournamentAnnouncementInput,
  );

  // Push best-effort: um destinatário com token inválido não deve derrubar a
  // publicação do aviso (que já foi gravado no feed nesse ponto).
  const deliveries = await Promise.allSettled(
    result.recipientUids.map((athleteUid) =>
      deliverNotificationToUser({
        userId: athleteUid,
        title: "Aviso do organizador",
        body: result.message.slice(0, 180),
        type: "tournament_organizer_announcement",
        data: {
          tournamentId: result.tournamentId,
          url: `/torneios/${result.tournamentId}`,
        },
        requireInteraction: false,
      }),
    ),
  );
  const pushCount = deliveries.filter((d) => d.status === "fulfilled").length;

  return {feedId: result.feedId, pushCount};
});
