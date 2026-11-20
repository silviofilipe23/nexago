/**
 * Live Activity da reserva de quadra no iOS (L3): Chegar → Em quadra → Placar.
 *
 * O app inicia a activity quando o atleta abre o app até 2 horas antes de uma
 * reserva confirmada, e grava o token dela em
 * `bookingLiveActivities/{uid}_{bookingId}` (com início e fim do horário). A
 * contagem roda sozinha no iPhone; o servidor só fala nas viradas, uma vez cada:
 *
 * - **onCourt**: chegou o horário (varredura de 1 em 1 minuto);
 * - **finished**: acabou o horário — encerra e fica 30 min com "Lançar placar";
 * - **canceled**: a reserva foi cancelada (conferido na virada) — some na hora.
 *
 * Sem push nenhum (chave .p8 ausente), o próprio card passa a "em quadra" pelo
 * `staleDate` = início; o fim só aparece quando o app abre.
 *
 * A fase gravada no doc é a trava (transação), como no Pix.
 */

import {
  DocumentReference,
  Firestore,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";
import {TokenMessage, getMessaging} from "firebase-admin/messaging";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {isArenaBookingInactive} from "./arena-booking-app-payment";
import {isInvalidFcmTokenError} from "./notification-delivery";

export const BOOKING_LIVE_ACTIVITIES_COLLECTION = "bookingLiveActivities";

/** Quanto o card de fim de jogo ("Lançar placar") fica na tela. */
export const BOOKING_LIVE_ACTIVITY_FINISHED_DISMISS_MS = 30 * 60 * 1000;

/** Docs finais são apagados depois disso (a activity já saiu da tela). */
const PURGE_AFTER_MS = 24 * 60 * 60 * 1000;

const SWEEP_BATCH = 200;

export type BookingLiveActivityPhase = "upcoming" | "onCourt" | "finished" | "canceled";

type PushedPhase = Exclude<BookingLiveActivityPhase, "upcoming">;

const PHASES: readonly BookingLiveActivityPhase[] = ["upcoming", "onCourt", "finished", "canceled"];
const FINAL_PHASES: readonly BookingLiveActivityPhase[] = ["finished", "canceled"];

/** Só anda para frente e nunca repete; fim e cancelada encerram a activity. */
export function canTransitionBookingLiveActivity(
  from: BookingLiveActivityPhase,
  to: BookingLiveActivityPhase,
): boolean {
  if (from === to) return false;
  switch (from) {
  case "upcoming":
    return to !== "upcoming";
  case "onCourt":
    return to === "finished" || to === "canceled";
  case "finished":
  case "canceled":
    return false;
  }
}

/** O que a varredura faz com uma activity agora; `null` = nada. */
export function bookingSweepTransition(
  phase: BookingLiveActivityPhase,
  startAtMs: number,
  endAtMs: number,
  nowMs: number,
): "onCourt" | "finished" | null {
  if (phase !== "upcoming" && phase !== "onCourt") return null;
  if (nowMs >= endAtMs) return "finished";
  if (phase === "upcoming" && nowMs >= startAtMs) return "onCourt";
  return null;
}

/** Reserva que não vai acontecer: cancelada, expirada, estornada (a mesma
 *  regra de `isArenaBookingInactive`) ou apagada. */
export function isBookingCanceled(data: Record<string, unknown> | undefined): boolean {
  return !data || isArenaBookingInactive(data);
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * O dono do doc está na reserva? Dono (`athleteId`, ou `bookingAthleteId` nas
 * antigas) ou convidado que aceitou (`participantUids`). Sem isso, qualquer
 * conta criaria docs para ids de reserva alheios — ou um convidado que saiu
 * seguiria recebendo as viradas.
 */
export function bookingLiveActivityAllowed(
  uid: string,
  booking: Record<string, unknown>,
): boolean {
  if (!uid) return false;
  if (str(booking.athleteId) === uid || str(booking.bookingAthleteId) === uid) return true;
  const participants = Array.isArray(booking.participantUids) ? booking.participantUids : [];
  return participants.some((p) => str(p) === uid);
}

const SCHEDULE_FIELDS = ["date", "startTime", "endTime", "courtId", "courtName"] as const;

/** Remarcou (dia, horário ou quadra)? O card guarda isso como atributo fixo. */
export function bookingScheduleChanged(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): boolean {
  return SCHEDULE_FIELDS.some(
    (f) => JSON.stringify(before[f] ?? null) !== JSON.stringify(after[f] ?? null),
  );
}

/**
 * Push de Live Activity pelo FCM. O `content-state` é só a fase: arena,
 * quadra, horário e confirmados são atributos fixos, gravados no iPhone quando
 * a activity nasce (`BookingAttributes` no Swift). Sem alerta: o "Como foi o
 * jogo?" do pós-jogo já é um push próprio.
 */
export function buildBookingLiveActivityMessage(params: {
  fcmToken: string;
  liveActivityToken: string;
  phase: PushedPhase;
  nowMs: number;
  endAtMs: number;
}): TokenMessage {
  const {fcmToken, liveActivityToken, phase, nowMs, endAtMs} = params;
  const aps: Record<string, unknown> = {
    "timestamp": Math.floor(nowMs / 1000),
    "event": phase === "onCourt" ? "update" : "end",
    "content-state": {phase},
  };
  if (phase === "onCourt") {
    // O update SUBSTITUI o conteúdo: sem o stale-date o fim pelo relógio some.
    // Fim já passado não vai — activity "stale" na hora o iOS não desenha.
    if (endAtMs > nowMs) aps["stale-date"] = Math.floor(endAtMs / 1000);
  } else if (phase === "finished") {
    aps["dismissal-date"] = Math.floor((nowMs + BOOKING_LIVE_ACTIVITY_FINISHED_DISMISS_MS) / 1000);
  } else {
    aps["dismissal-date"] = Math.floor(nowMs / 1000);
  }
  return {
    token: fcmToken,
    apns: {
      liveActivityToken,
      headers: {"apns-priority": "10"},
      payload: {aps},
    },
  };
}

interface StoredActivity {
  phase: BookingLiveActivityPhase;
  uid: string;
  bookingId: string;
  fcmToken: string;
  liveActivityToken: string;
  endAtMs: number;
}

function readActivity(data: FirebaseFirestore.DocumentData | undefined): StoredActivity | null {
  if (!data) return null;
  const phase = data.phase as BookingLiveActivityPhase;
  if (!PHASES.includes(phase)) return null;
  const endAt = data.endAt;
  return {
    phase,
    uid: typeof data.uid === "string" ? data.uid : "",
    bookingId: typeof data.bookingId === "string" ? data.bookingId : "",
    fcmToken: typeof data.fcmToken === "string" ? data.fcmToken.trim() : "",
    liveActivityToken: typeof data.liveActivityToken === "string" ?
      data.liveActivityToken.trim() : "",
    endAtMs: endAt instanceof Timestamp ? endAt.toMillis() : 0,
  };
}

/**
 * Muda a fase na transação e, se mudou, manda o push. Antes de virar, confere
 * a reserva: cancelada vira "canceled" (o card some) em vez de seguir o
 * relógio de um jogo que não vai acontecer; doc de quem não está na reserva é
 * apagado sem push.
 */
export async function advanceBookingLiveActivity(
  ref: DocumentReference,
  to: PushedPhase,
  nowMs: number,
): Promise<boolean> {
  const db = ref.firestore;
  const stored = readActivity((await ref.get()).data());
  if (!stored) return false;
  const booking = stored.bookingId ?
    (await db.collection("arenaBookings").doc(stored.bookingId).get()).data() :
    undefined;
  if (booking && !bookingLiveActivityAllowed(stored.uid, booking)) {
    await ref.delete();
    return false;
  }
  const target: PushedPhase = to === "canceled" || isBookingCanceled(booking) ? "canceled" : to;

  const activity = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = readActivity(snap.data());
    if (!current || !canTransitionBookingLiveActivity(current.phase, target)) return null;
    tx.update(ref, {phase: target, phaseChangedAt: Timestamp.fromMillis(nowMs)});
    return current;
  });
  if (!activity) return false;
  if (!activity.fcmToken || !activity.liveActivityToken) return true;

  try {
    await getMessaging().send(buildBookingLiveActivityMessage({
      fcmToken: activity.fcmToken,
      liveActivityToken: activity.liveActivityToken,
      phase: target,
      nowMs,
      endAtMs: activity.endAtMs,
    }));
  } catch (e: unknown) {
    const code = (e as {code?: string})?.code ?? "";
    if (isInvalidFcmTokenError(code)) {
      await ref.delete();
      return true;
    }
    logger.warn(`bookingLiveActivity: push falhou id=${ref.id} phase=${target} code=${code}`, e);
  }
  return true;
}

async function sweepByField(
  db: Firestore,
  phase: "upcoming" | "onCourt",
  field: "startAt" | "endAt",
  nowMs: number,
): Promise<number> {
  const snap = await db.collection(BOOKING_LIVE_ACTIVITIES_COLLECTION)
    .where("phase", "==", phase)
    .where(field, "<=", Timestamp.fromMillis(nowMs))
    .limit(SWEEP_BATCH)
    .get();
  let pushed = 0;
  for (const doc of snap.docs) {
    const startAt = doc.get("startAt");
    const endAt = doc.get("endAt");
    if (!(startAt instanceof Timestamp) || !(endAt instanceof Timestamp)) continue;
    const to = bookingSweepTransition(phase, startAt.toMillis(), endAt.toMillis(), nowMs);
    if (!to) continue;
    if (await advanceBookingLiveActivity(doc.ref, to, nowMs)) pushed++;
  }
  return pushed;
}

async function purgeFinished(db: Firestore, nowMs: number): Promise<number> {
  const snap = await db.collection(BOOKING_LIVE_ACTIVITIES_COLLECTION)
    .where("phase", "in", FINAL_PHASES)
    .where("endAt", "<=", Timestamp.fromMillis(nowMs - PURGE_AFTER_MS))
    .limit(SWEEP_BATCH)
    .get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return snap.size;
}

/** Viradas de início e fim das reservas e limpeza dos docs velhos. */
export const sweepBookingLiveActivities = onSchedule({
  schedule: "every 1 minutes",
  timeZone: "America/Sao_Paulo",
}, async () => {
  const db = getFirestore();
  const nowMs = Date.now();
  const started = await sweepByField(db, "upcoming", "startAt", nowMs);
  const ended = await sweepByField(db, "onCourt", "endAt", nowMs);
  const purged = await purgeFinished(db, nowMs);
  if (started || ended || purged) {
    logger.info(`sweepBookingLiveActivities: started=${started} ended=${ended} purged=${purged}`);
  }
});

/**
 * Cancelou ou remarcou a reserva: o card sai na hora, sem esperar a virada do
 * relógio (a varredura só olharia a reserva no horário de início). Remarcada,
 * o doc é apagado também — o app cria o card novo, com o horário novo, quando
 * abrir na janela de 2 horas.
 */
export const onArenaBookingChangedLiveActivity = onDocumentUpdated(
  "arenaBookings/{bookingId}",
  async (event) => {
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;
    if (!before || !after) return;
    const canceled = !isBookingCanceled(before) && isBookingCanceled(after);
    const moved = !canceled && bookingScheduleChanged(before, after);
    if (!canceled && !moved) return;

    const db = getFirestore();
    const snap = await db.collection(BOOKING_LIVE_ACTIVITIES_COLLECTION)
      .where("bookingId", "==", event.params.bookingId)
      .limit(20)
      .get();
    const nowMs = Date.now();
    for (const doc of snap.docs) {
      await advanceBookingLiveActivity(doc.ref, "canceled", nowMs);
      if (moved) await doc.ref.delete();
    }
  },
);
