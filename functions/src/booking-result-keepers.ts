/**
 * Liberar quem foi adicionado na tela de lançamento do placar (o "Lançar placar" do app).
 *
 * O atleta que alguém da pelada adiciona pela busca só ficava ligado à reserva quando o placar era
 * enviado (`resultPlayerUids`). Se o celular de quem marcava travava antes disso, ninguém mais
 * conseguia lançar. Agora o app chama `linkBookingResultPlayers` a cada atleta adicionado. Ele entra
 * em `arenaBookings.scoreKeeperUids` (com nome e foto em `scoreKeepers`), que faz parte da lista de
 * jogadores da reserva (`bookingRosterUids`), e recebe um push que abre o "Lançar placar".
 *
 * Regras de quem libera quem:
 * - libera: qualquer atleta da lista de jogadores da reserva (dono, convidado, quem está no placar
 *   ou quem já foi liberado), porque o celular que sobrou pode não ser o da dona;
 * - é liberado: só atleta com conta (`users/{uid}`), nunca avulso;
 * - quando: reserva garantida e com o placar liberado (metade paga pelo app ou liberação manual),
 *   desde antes de começar ("Quem vai jogar?") até {@link SCORE_KEEPER_UNTIL_END_MS} depois do fim;
 * - quantos: até {@link MAX_SCORE_KEEPERS} por reserva.
 *
 * Só o servidor grava esses campos: as rules de `arenaBookings` deixam dono e equipe mexerem só
 * nos campos das allow-lists (`hasOnly`).
 */
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {SOCIAL_LOCKED_MESSAGE, resolveBookingSocialUnlock} from "./booking-app-payment";
import {
  MAX_RESULT_TEAMS,
  MAX_TEAM_PLAYERS,
  bookingEndAt,
  bookingPlayableStatusError,
  bookingRosterUids,
  firstName,
  isDocId,
  resultPlayerName,
  resultPlayerPhoto,
  shortDateLabel,
} from "./booking-result";
import {ROSTER_ONLY_MESSAGE} from "./booking-result-write";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
  deliverNotificationToUser,
} from "./notification-delivery";

type Data = Record<string, unknown>;

/** Cabe a maior pelada que o placar aceita (8 times de 6). */
export const MAX_SCORE_KEEPERS = MAX_RESULT_TEAMS * MAX_TEAM_PLAYERS;

/** Quantos atletas uma chamada libera (o app manda um por vez). */
export const MAX_LINK_BATCH = 12;

/** Depois do fim da reserva, ainda dá para liberar alguém por 24 h (placar lançado no dia seguinte). */
export const SCORE_KEEPER_UNTIL_END_MS = 24 * 60 * 60 * 1000;

export interface ScoreKeeperNotice {
  userId: string;
  title: string;
  body: string;
  type: "pelada_score_keeper";
  bookingId: string;
}

interface LinkInput {
  bookingId: string;
  playerIds: string[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function parseLinkInput(raw: unknown): LinkInput {
  const data = (raw ?? {}) as Data;
  const bookingId = str(data["bookingId"]);
  if (!isDocId(bookingId)) throw new HttpsError("invalid-argument", "Reserva inválida.");
  const rawIds = data["playerIds"];
  if (!Array.isArray(rawIds) || rawIds.length === 0 || rawIds.length > MAX_LINK_BATCH) {
    throw new HttpsError("invalid-argument", "Escolha de 1 a 12 atletas.", {fields: ["playerIds"]});
  }
  const playerIds: string[] = [];
  for (const v of rawIds) {
    const id = str(v);
    if (!isDocId(id) || id.startsWith("guest:")) {
      throw new HttpsError("invalid-argument", "Só dá para liberar atleta com conta no nexaGO.",
        {fields: ["playerIds"]});
    }
    if (!playerIds.includes(id)) playerIds.push(id);
  }
  return {bookingId, playerIds};
}

function keepersOf(booking: Data): Data[] {
  const raw = booking["scoreKeepers"];
  return Array.isArray(raw) ? raw.filter((e): e is Data => e != null && typeof e === "object") : [];
}

/** Liberação fechada: fora do prazo ou reserva que não é mais jogo. */
function linkClosedError(booking: Data, now: Date): string | null {
  const notPlayable = bookingPlayableStatusError(booking);
  if (notPlayable) return notPlayable;
  const dateKey = str(booking["date"]) || str(booking["dateKey"]);
  const endAt = bookingEndAt(dateKey, str(booking["startTime"]), str(booking["endTime"]));
  if (!endAt) return "Não achamos o horário dessa reserva.";
  if (now.getTime() > endAt.getTime() + SCORE_KEEPER_UNTIL_END_MS) {
    return "Passou o prazo para liberar atletas nesta reserva. Envie o placar e todos do placar poderão editar.";
  }
  return null;
}

export async function linkBookingResultPlayersCore(
  db: Firestore,
  uid: string,
  raw: unknown,
  now: Date,
): Promise<{result: {linked: string[]}; notices: ScoreKeeperNotice[]}> {
  const input = parseLinkInput(raw);
  const bookingRef = db.collection("arenaBookings").doc(input.bookingId);
  const first = await bookingRef.get();
  const booking = first.exists ? (first.data() as Data) : null;
  if (!booking) throw new HttpsError("not-found", "Reserva não encontrada.");
  if (!bookingRosterUids(booking).includes(uid)) throw new HttpsError("permission-denied", ROSTER_ONLY_MESSAGE);
  const closed = linkClosedError(booking, now);
  if (closed) throw new HttpsError("failed-precondition", closed);
  const unlock = await resolveBookingSocialUnlock(db, booking);
  if (!unlock.socialUnlocked) {
    throw new HttpsError("failed-precondition", SOCIAL_LOCKED_MESSAGE, {reason: "social_locked"});
  }

  const ids = [uid, ...input.playerIds];
  const userSnaps = await db.getAll(...ids.map((id) => db.collection("users").doc(id)));
  const users = new Map(userSnaps.map((s) => [s.id, s.exists ? (s.data() as Data) : null]));
  if (input.playerIds.some((id) => users.get(id) == null)) {
    throw new HttpsError("invalid-argument", "Um dos atletas não foi encontrado.", {fields: ["playerIds"]});
  }

  // Relida na transação: dois celulares liberando ao mesmo tempo não se apagam.
  const linked = await db.runTransaction(async (tx) => {
    const snap = await tx.get(bookingRef);
    const current = (snap.data() ?? {}) as Data;
    const roster = new Set(bookingRosterUids(current));
    const fresh = input.playerIds.filter((id) => !roster.has(id));
    if (fresh.length === 0) return [];
    const keepers = keepersOf(current);
    if (keepers.length + fresh.length > MAX_SCORE_KEEPERS) {
      throw new HttpsError("resource-exhausted", `Esta reserva já liberou ${MAX_SCORE_KEEPERS} atletas.`);
    }
    const added = fresh.map((id) => {
      const user = users.get(id) ?? null;
      const photo = resultPlayerPhoto(user);
      return {uid: id, name: resultPlayerName(user), ...(photo ? {avatarUrl: photo} : {}), addedBy: uid};
    });
    const nextKeepers = [...keepers, ...added];
    tx.update(bookingRef, {
      scoreKeepers: nextKeepers,
      scoreKeeperUids: nextKeepers.map((k) => str(k["uid"])).filter((id) => id.length > 0),
      scoreKeepersUpdatedAt: FieldValue.serverTimestamp(),
    });
    return fresh;
  });

  const by = firstName(resultPlayerName(users.get(uid) ?? null)) || "Um jogador";
  const arena = str(booking["arenaName"]) || "Arena";
  const when = shortDateLabel(str(booking["date"]) || str(booking["dateKey"]));
  const notices: ScoreKeeperNotice[] = linked.map((userId) => ({
    userId,
    title: `${by} te colocou na pelada`,
    body: `${arena}${when ? ` · ${when}` : ""}: você também pode marcar e enviar o placar pelo seu celular.`,
    type: "pelada_score_keeper",
    bookingId: input.bookingId,
  }));
  return {result: {linked}, notices};
}

export const linkBookingResultPlayers = onCall(
  {region: CLIENT_FACING_REGIONS, secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT]},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta para liberar atletas.");
    const {result, notices} = await linkBookingResultPlayersCore(getFirestore(), uid, request.data, new Date());
    // Falha de push não desfaz a liberação: o atleta já pode lançar pelo app.
    await Promise.all(notices.map(async (n) => {
      try {
        await deliverNotificationToUser({
          userId: n.userId,
          title: n.title,
          body: n.body,
          type: n.type,
          data: {bookingId: n.bookingId},
        });
      } catch (err) {
        logger.warn("bookingResult: aviso de liberação não entregue", {userId: n.userId, err});
      }
    }));
    return result;
  },
);
