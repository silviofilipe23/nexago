/**
 * Varredura diária do cashback (10h, fuso do evento):
 * 1. Lotes pendentes cujo evento já passou: confere a origem real e libera,
 *    cancela (vínculo caiu) ou move a data (evento adiado). Um push por atleta
 *    com o total liberado — o gancho de fidelização chega logo depois do jogo.
 * 2. Lotes disponíveis vencidos: vence o que sobrou.
 * 3. Lotes que vencem nos próximos `expiryWarningDays`: um aviso por atleta,
 *    uma vez por lote.
 */
import {onSchedule} from "firebase-functions/v2/scheduler";
import {
  getFirestore,
  Timestamp,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {readCashbackConfig, type CashbackConfig} from "./cashback-config";
import {
  bookingEventAtMs,
  formatCentsBrl,
  releaseDecision,
  toMillisOrNull,
  type CashbackSourceState,
} from "./cashback-rules";
import type {LotDoc} from "./athlete-wallet-state";
import {cancelLot, expireLot, markExpiryWarned, releaseLot, rescheduleLot} from "./athlete-wallet";
import {loadTournamentData} from "./tournament-registration-guards";
import {artifactsInscriptionsPath, getFirebaseProjectId} from "./firebase-paths";
import {EVENT_TIME_ZONE} from "./event-timezone";
import {
  deliverNotificationToUser,
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
} from "./notification-delivery";

const DAY_MS = 24 * 60 * 60 * 1000;
const CASHBACK_LINKS = {url: "/cashback", webUrl: "/cashback"};

export type CashbackNotify = (input: {
  userId: string;
  title: string;
  body: string;
  type: string;
  data: Record<string, string>;
}) => Promise<unknown>;

export async function loadSourceState(
  db: Firestore,
  projectId: string,
  uid: string,
  lot: LotDoc,
): Promise<CashbackSourceState> {
  if (lot.sourceType === "booking") {
    const snap = await db.collection("arenaBookings").doc(lot.sourceId).get();
    const booking = snap.data() ?? {};
    return {
      sourceType: "booking",
      exists: snap.exists,
      status: String(booking.status ?? ""),
      eventAtMs: bookingEventAtMs(booking.date, booking.startTime),
    };
  }
  if (lot.sourceType === "registration") {
    const snap = await db.collection(artifactsInscriptionsPath(projectId)).doc(lot.sourceId).get();
    const registration = snap.data() ?? {};
    const tournamentId = lot.tournamentId ??
      (typeof registration.tournamentId === "string" ? registration.tournamentId : "");
    const tournament = tournamentId ? await loadTournamentData(db, projectId, tournamentId) : null;
    const request = registration.cancellationRequest as {status?: unknown} | undefined;
    return {
      sourceType: "registration",
      exists: snap.exists,
      cancellationPending: request?.status === "pending",
      tournamentCancelled: tournament?.listingStatus === "cancelled",
      eventAtMs: toMillisOrNull(tournament?.startAt ?? tournament?.startDate),
    };
  }
  const sessionRef = db.collection("arenaClubSessions").doc(lot.sourceId);
  const participantSnap = await sessionRef.collection("clubParticipants").doc(uid).get();
  const sessionSnap = await sessionRef.get();
  return {
    sourceType: "club",
    exists: participantSnap.exists && sessionSnap.exists,
    participantStatus: String(participantSnap.data()?.status ?? ""),
    sessionStatus: String(sessionSnap.data()?.status ?? ""),
    eventAtMs: toMillisOrNull(sessionSnap.data()?.startAt),
  };
}

function dayMonthLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("pt-BR", {
    timeZone: EVENT_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
  });
}

export type DailySweepStats = {
  released: number;
  cancelled: number;
  rescheduled: number;
  waiting: number;
  expired: number;
  warned: number;
};

/**
 * Lotes vencidos por página e teto de páginas por passada (2.000 lotes cabem
 * folgados nos 540 s). Lote que espera (cancelamento pendente) não muda de
 * data e fica sempre na frente da ordem por `eventAt`: sem paginar, uma fila
 * deles — ou um dia com mais lotes que uma página — atrasava os de trás por
 * dias. O que passar do teto fica para a passada seguinte.
 */
const DUE_PAGE_SIZE = 500;
const DUE_MAX_PAGES = 4;

export type DailySweepOptions = {pageSize?: number; maxPages?: number};

export async function runCashbackDailySweep(
  db: Firestore,
  projectId: string,
  nowMs: number,
  config: CashbackConfig,
  notify: CashbackNotify,
  options: DailySweepOptions = {},
): Promise<DailySweepStats> {
  const stats: DailySweepStats = {
    released: 0, cancelled: 0, rescheduled: 0, waiting: 0, expired: 0, warned: 0,
  };
  const now = Timestamp.fromMillis(nowMs);

  // 1. Liberar / cancelar / adiar — paginado por cursor de documento: o
  // cursor anda por (eventAt, caminho), então nem lote que espera nem empate
  // de data (todos os lotes de um torneio) prendem a fila.
  const releasedByUid = new Map<string, number>();
  const pageSize = options.pageSize ?? DUE_PAGE_SIZE;
  const maxPages = options.maxPages ?? DUE_MAX_PAGES;
  let cursor: QueryDocumentSnapshot | null = null;
  for (let page = 0; page < maxPages; page++) {
    let query = db.collectionGroup("lots")
      .where("status", "==", "pending")
      .where("eventAt", "<=", now)
      .orderBy("eventAt");
    if (cursor) query = query.startAfter(cursor);
    const due = await query.limit(pageSize).get();
    for (const doc of due.docs) {
      const lot = doc.data() as LotDoc;
      const uid = doc.ref.parent.parent?.id ?? lot.uid;
      try {
        const decision = releaseDecision(await loadSourceState(db, projectId, uid, lot), nowMs);
        if (decision.kind === "release") {
          const cents = await releaseLot(db, uid, doc.id, nowMs, config.expiryMonths);
          if (cents > 0) {
            releasedByUid.set(uid, (releasedByUid.get(uid) ?? 0) + cents);
            stats.released++;
          }
        } else if (decision.kind === "cancel") {
          if (await cancelLot(db, uid, doc.id, nowMs)) stats.cancelled++;
          logger.info("cashback: lote cancelado", {uid, lotId: doc.id, reason: decision.reason});
        } else if (decision.eventAtMs != null) {
          await rescheduleLot(db, uid, doc.id, decision.eventAtMs);
          stats.rescheduled++;
        } else {
          stats.waiting++;
        }
      } catch (e) {
        logger.error("cashback: falha ao conferir lote pendente", {uid, lotId: doc.id, error: String(e)});
      }
    }
    if (due.docs.length < pageSize) break;
    cursor = due.docs[due.docs.length - 1];
  }
  for (const [uid, cents] of releasedByUid) {
    await notify({
      userId: uid,
      title: "Seu cashback foi liberado",
      body: `${formatCentsBrl(cents)} já pode ser usado na próxima reserva, inscrição ou clubinho.`,
      type: "cashback_released",
      data: CASHBACK_LINKS,
    }).catch((e) => logger.warn("cashback: push de liberação falhou", {uid, error: String(e)}));
  }

  // 2. Vencer.
  const expiredSnap = await db.collectionGroup("lots")
    .where("status", "==", "available")
    .where("expiresAt", "<=", now)
    .limit(500)
    .get();
  for (const doc of expiredSnap.docs) {
    const uid = doc.ref.parent.parent?.id ?? (doc.data() as LotDoc).uid;
    try {
      if ((await expireLot(db, uid, doc.id, nowMs)) > 0) stats.expired++;
    } catch (e) {
      logger.error("cashback: falha ao vencer lote", {uid, lotId: doc.id, error: String(e)});
    }
  }

  // 3. Avisar o que vence em breve.
  if (config.expiryWarningDays > 0) {
    const horizon = Timestamp.fromMillis(nowMs + config.expiryWarningDays * DAY_MS);
    const soonSnap = await db.collectionGroup("lots")
      .where("status", "==", "available")
      .where("expiresAt", "<=", horizon)
      .limit(1000)
      .get();
    const byUid = new Map<string, {cents: number; earliestMs: number; lotIds: string[]}>();
    for (const doc of soonSnap.docs) {
      const lot = doc.data() as LotDoc;
      const expiresAtMs = lot.expiresAt?.toMillis() ?? 0;
      if (lot.expiryWarnedAt || lot.remainingCents <= 0 || expiresAtMs <= nowMs) continue;
      const uid = doc.ref.parent.parent?.id ?? lot.uid;
      const entry = byUid.get(uid) ?? {cents: 0, earliestMs: expiresAtMs, lotIds: []};
      entry.cents += lot.remainingCents;
      entry.earliestMs = Math.min(entry.earliestMs, expiresAtMs);
      entry.lotIds.push(doc.id);
      byUid.set(uid, entry);
    }
    for (const [uid, entry] of byUid) {
      try {
        await notify({
          userId: uid,
          title: "Seu cashback vai vencer",
          body: `${formatCentsBrl(entry.cents)} vencem a partir de ${dayMonthLabel(entry.earliestMs)}. ` +
            "Use numa reserva, inscrição ou clubinho.",
          type: "cashback_expiring",
          data: CASHBACK_LINKS,
        });
        await markExpiryWarned(db, uid, entry.lotIds, nowMs);
        stats.warned++;
      } catch (e) {
        logger.warn("cashback: aviso de vencimento falhou", {uid, error: String(e)});
      }
    }
  }

  return stats;
}

export const cashbackDailySweep = onSchedule(
  {
    schedule: "0 10 * * *",
    timeZone: EVENT_TIME_ZONE,
    timeoutSeconds: 540,
    secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
  },
  async (event) => {
    const scheduled = Date.parse(event.scheduleTime);
    const nowMs = Number.isFinite(scheduled) ? scheduled : Date.now();
    const db = getFirestore();
    const stats = await runCashbackDailySweep(
      db,
      getFirebaseProjectId(),
      nowMs,
      await readCashbackConfig(db),
      deliverNotificationToUser,
    );
    logger.info("cashbackDailySweep", stats);
  },
);
