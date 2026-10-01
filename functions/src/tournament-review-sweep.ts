import {
  getFirestore,
  Timestamp,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {EVENT_TIME_ZONE} from "./event-timezone";
import {artifactsInscriptionsPath, artifactsTeamsPath, getFirebaseProjectId} from "./firebase-paths";
import {
  deliverNotificationToUser,
  type DeliverNotificationInput,
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
} from "./notification-delivery";
import {tournamentManagerUids} from "./tournament-acl";
import {loadTournamentReviewsConfig} from "./tournament-review-config";
import {
  DAY_MS,
  HOUR_MS,
  REVIEW_END_GRACE_HOURS,
  REVIEW_LOOKBACK_DAYS,
  REVIEW_WINDOW_DAYS,
  reviewInvitePath,
  TOURNAMENT_REVIEW_INVITES_SUBCOLLECTION,
  TOURNAMENT_REVIEW_SUMMARIES_COLLECTION,
} from "./tournament-review-constants";
import {
  reviewClosedNotification,
  reviewReminderNotification,
  reviewRequestNotification,
} from "./tournament-review-notifications";
import {
  isConfirmedInscription,
  reviewCandidateReason,
  reviewEligibleUids,
  reviewWindowAction,
} from "./tournament-review-window";

export type Notify = (input: DeliverNotificationInput) => Promise<unknown>;

/** Teto do batch é 500 escritas; folga para não encostar. */
const BATCH_LIMIT = 400;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Um push que falha não derruba os outros nem o job. */
async function notifyAll(notify: Notify, inputs: DeliverNotificationInput[]): Promise<void> {
  await Promise.all(inputs.map((input) =>
    notify(input).catch((error) => {
      logger.warn("tournamentReviewSweep: push falhou", {userId: input.userId, type: input.type, error});
    }),
  ));
}

/**
 * Abre a janela de um torneio. Ordem: resumo (com `invitesComplete: false`), convites que ainda
 * não existem, `invitesComplete: true`, push dos convites novos. Se o job cair no meio, a
 * execução de amanhã retoma (o torneio segue candidato por 3 dias) sem duplicar convite nem
 * push. O resumo nasce antes dos convites porque o trigger de avaliação precisa achá-lo.
 */
export async function openTournamentReviewWindow(
  db: Firestore,
  tournamentId: string,
  tournament: Record<string, unknown>,
  nowMs: number,
  notify: Notify,
  projectId: string = getFirebaseProjectId(),
): Promise<boolean> {
  const summaryRef = db.collection(TOURNAMENT_REVIEW_SUMMARIES_COLLECTION).doc(tournamentId);
  const summarySnap = await summaryRef.get();
  const existing = summarySnap.exists ? summarySnap.data() as Record<string, unknown> : null;
  if (existing?.invitesComplete === true) return false;

  const inscriptionsSnap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .get();
  const inscriptions = inscriptionsSnap.docs.map((d) => d.data() as Record<string, unknown>);
  const teamIds = [...new Set(inscriptions.filter(isConfirmedInscription).map((i) => str(i.teamId)))];
  const teamsById = new Map<string, Record<string, unknown>>();
  if (teamIds.length > 0) {
    const teamSnaps = await db.getAll(...teamIds.map((id) => db.doc(`${artifactsTeamsPath(projectId)}/${id}`)));
    for (const snap of teamSnaps) {
      if (snap.exists) teamsById.set(snap.id, snap.data() as Record<string, unknown>);
    }
  }
  const managers = await tournamentManagerUids(db, tournamentId, tournament);
  const uids = reviewEligibleUids(inscriptions, teamsById, managers);

  const previousOpensAt = existing?.opensAt;
  const previousClosesAt = existing?.closesAt;
  const opensAt = previousOpensAt instanceof Timestamp ? previousOpensAt : Timestamp.fromMillis(nowMs);
  const closesAt = previousClosesAt instanceof Timestamp ?
    previousClosesAt :
    Timestamp.fromMillis(opensAt.toMillis() + REVIEW_WINDOW_DAYS * DAY_MS);
  const organizerId = str(tournament.managerId);
  const tournamentName = str(tournament.name);

  if (!existing) {
    const hasInvites = uids.length > 0;
    await summaryRef.set({
      tournamentId,
      organizerId,
      tournamentName,
      tournamentStartAt: tournament.startAt instanceof Timestamp ? tournament.startAt : null,
      // Sem elegíveis nasce fechado: ninguém para avaliar, e o organizador não recebe
      // "0 avaliações" no 14º dia.
      status: hasInvites ? "open" : "closed",
      eligibleCount: uids.length,
      count: 0,
      average: null,
      distribution: null,
      aspects: null,
      opensAt,
      closesAt,
      reminderSentAt: null,
      closedAt: hasInvites ? null : opensAt,
      invitesComplete: false,
      updatedAt: opensAt,
    });
  }

  let created: string[] = [];
  if (uids.length > 0) {
    const inviteSnaps = await db.getAll(...uids.map((uid) => db.doc(reviewInvitePath(uid, tournamentId))));
    created = uids.filter((_, i) => !inviteSnaps[i]?.exists);
    const invite = {
      tournamentId,
      tournamentName,
      coverUrl: str(tournament.coverUrl) || str(tournament.imageUrl) || null,
      organizerId,
      opensAt,
      closesAt,
      status: "pending",
      submittedAt: null,
      createdAt: Timestamp.fromMillis(nowMs),
    };
    for (let i = 0; i < created.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      for (const uid of created.slice(i, i + BATCH_LIMIT)) {
        batch.set(db.doc(reviewInvitePath(uid, tournamentId)), invite);
      }
      await batch.commit();
    }
  }
  await summaryRef.update({invitesComplete: true});
  await notifyAll(notify, created.map((uid) => reviewRequestNotification({uid, tournamentId, tournamentName})));
  return true;
}

async function pendingInvites(db: Firestore, tournamentId: string) {
  return db
    .collectionGroup(TOURNAMENT_REVIEW_INVITES_SUBCOLLECTION)
    .where("tournamentId", "==", tournamentId)
    .where("status", "==", "pending")
    .get();
}

/** Lembrete do 3º dia. Marca antes de mandar: se cair no meio, melhor um lembrete a menos que
 *  dois. */
export async function remindTournamentReviews(
  db: Firestore,
  summaryDoc: QueryDocumentSnapshot,
  nowMs: number,
  notify: Notify,
): Promise<void> {
  const summary = summaryDoc.data();
  await summaryDoc.ref.update({reminderSentAt: Timestamp.fromMillis(nowMs)});
  const pending = await pendingInvites(db, summaryDoc.id);
  const closesAtMs = summary.closesAt instanceof Timestamp ? summary.closesAt.toMillis() : nowMs;
  await notifyAll(notify, pending.docs.map((doc) => reviewReminderNotification({
    uid: doc.ref.parent.parent?.id ?? "",
    tournamentId: summaryDoc.id,
    tournamentName: str(summary.tournamentName),
    closesAtMs,
  })).filter((n) => n.userId));
}

/** Fecha a janela: a nota congela (a callable já recusa desde `closesAt`), os convites pendentes
 *  expiram e quem gerencia recebe o resultado. */
export async function closeTournamentReviewWindow(
  db: Firestore,
  summaryDoc: QueryDocumentSnapshot,
  nowMs: number,
  notify: Notify,
): Promise<void> {
  const summary = summaryDoc.data();
  const tournamentId = summaryDoc.id;
  const now = Timestamp.fromMillis(nowMs);
  await summaryDoc.ref.update({status: "closed", closedAt: now, updatedAt: now});

  const pending = await pendingInvites(db, tournamentId);
  for (let i = 0; i < pending.docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const doc of pending.docs.slice(i, i + BATCH_LIMIT)) batch.update(doc.ref, {status: "expired"});
    await batch.commit();
  }

  const managers = await tournamentManagerUids(db, tournamentId);
  const count = typeof summary.count === "number" ? summary.count : 0;
  const average = typeof summary.average === "number" ? summary.average : null;
  await notifyAll(notify, managers.map((uid) => reviewClosedNotification({
    uid,
    tournamentId,
    tournamentName: str(summary.tournamentName),
    count,
    average,
  })));
}

/**
 * Uma execução do job: abre janelas novas e depois lembra/fecha as abertas. Cada torneio tem o
 * próprio try/catch: um torneio quebrado não segura os outros.
 */
export async function runTournamentReviewSweep(
  db: Firestore,
  nowMs: number,
  notify: Notify = deliverNotificationToUser,
  projectId: string = getFirebaseProjectId(),
): Promise<{opened: number; reminded: number; closed: number}> {
  const stats = {opened: 0, reminded: 0, closed: 0};
  if (!(await loadTournamentReviewsConfig(db)).enabled) return stats;

  const lookback = Timestamp.fromMillis(nowMs - REVIEW_LOOKBACK_DAYS * DAY_MS);
  const [completedSnap, endedSnap] = await Promise.all([
    db.collection("tournaments")
      .where("listingStatus", "==", "completed")
      .where("completedAt", ">=", lookback)
      .get(),
    db.collection("tournaments")
      .where("endAt", ">=", lookback)
      .where("endAt", "<=", Timestamp.fromMillis(nowMs - REVIEW_END_GRACE_HOURS * HOUR_MS))
      .get(),
  ]);
  const candidates = new Map<string, Record<string, unknown>>();
  for (const doc of [...completedSnap.docs, ...endedSnap.docs]) {
    const data = doc.data() as Record<string, unknown>;
    if (reviewCandidateReason(data, nowMs) != null) candidates.set(doc.id, data);
  }
  for (const [tournamentId, tournament] of candidates) {
    try {
      if (await openTournamentReviewWindow(db, tournamentId, tournament, nowMs, notify, projectId)) {
        stats.opened += 1;
      }
    } catch (error) {
      logger.error("tournamentReviewSweep: falha ao abrir janela", {tournamentId, error});
    }
  }

  const openSnap = await db.collection(TOURNAMENT_REVIEW_SUMMARIES_COLLECTION).where("status", "==", "open").get();
  for (const doc of openSnap.docs) {
    try {
      const action = reviewWindowAction(doc.data(), nowMs);
      if (action === "close") {
        await closeTournamentReviewWindow(db, doc, nowMs, notify);
        stats.closed += 1;
      } else if (action === "remind") {
        await remindTournamentReviews(db, doc, nowMs, notify);
        stats.reminded += 1;
      }
    } catch (error) {
      logger.error("tournamentReviewSweep: falha ao lembrar/fechar", {tournamentId: doc.id, error});
    }
  }
  return stats;
}

/**
 * 10:00 de São Paulo, todo dia. `now` é o horário AGENDADO (`scheduleTime`), não o relógio:
 * assim `opensAt` cai em 10:00 em ponto e o lembrete e o fechamento batem exatamente no 3º e no
 * 14º dia. Os secrets de Web Push são o que faz o push de fechamento chegar no portal do
 * organizador.
 */
export const tournamentReviewDailySweep = onSchedule(
  {
    schedule: "0 10 * * *",
    timeZone: EVENT_TIME_ZONE,
    timeoutSeconds: 540,
    secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
  },
  async (event) => {
    const scheduled = Date.parse(event.scheduleTime);
    const nowMs = Number.isFinite(scheduled) ? scheduled : Date.now();
    const stats = await runTournamentReviewSweep(getFirestore(), nowMs);
    logger.info("tournamentReviewDailySweep", stats);
  },
);
