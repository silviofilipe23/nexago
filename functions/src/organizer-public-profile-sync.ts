import {FieldValue, getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {EVENT_TIME_ZONE} from "./event-timezone";
import {artifactsInscriptionsPath, artifactsTeamsPath, getFirebaseProjectId} from "./firebase-paths";
import {
  buildOrganizerIdentity,
  computeOrganizerStats,
  EVENT_END_GRACE_MS,
  followerCountDelta,
  isOrganizerListed,
  ORGANIZER_FOLLOWERS_SUBCOLLECTION,
  ORGANIZER_PUBLIC_PROFILES_COLLECTION,
  ORGANIZER_STATS_SOURCE_FIELDS,
  organizerStatsRelevantChange,
  sameOrganizerIdentity,
  realizedListedTournamentIds,
  touchesRealizedTournament,
  type DocData,
  type OrganizerStats,
  type TournamentRow,
} from "./organizer-public-profile";
import {isConfirmedInscription, reviewEligibleUids} from "./tournament-review-window";

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function profileRef(db: Firestore, uid: string) {
  return db.collection(ORGANIZER_PUBLIC_PROFILES_COLLECTION).doc(uid);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Copia a identidade exibível de `users/{uid}`. `users` é gravado o tempo todo (`lastActiveAt`),
 * então o EVENTO só serve para sair cedo quando a projeção não mudou. O que se grava vem dos docs
 * lidos AGORA, na transação: gatilhos não chegam em ordem, e projetar o `after` deixaria um
 * liga→desliga rápido do WhatsApp com o número exposto. Quem nunca foi organizador não ganha doc.
 */
export async function syncOrganizerIdentity(
  db: Firestore,
  uid: string,
  before: DocData | null,
  after: DocData | null,
  nowMs: number = Date.now(),
): Promise<void> {
  if (before && after && sameOrganizerIdentity(buildOrganizerIdentity(before), buildOrganizerIdentity(after))) {
    return;
  }
  const ref = profileRef(db, uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const userSnap = await tx.get(db.collection("users").doc(uid));
    const organizerSnap = await tx.get(db.collection("organizers").doc(uid));
    if (!userSnap.exists) {
      // Conta apagada: a identidade sai do ar. Os seguidores ficam órfãos (nada os lê sem o doc).
      if (snap.exists) tx.delete(ref);
      return;
    }
    const next = buildOrganizerIdentity(userSnap.data() as DocData);
    const current = snap.exists ? snap.data() as DocData : {};
    // Só quem é organizador (ou deixou de ser, para sair da lista) ganha identidade. O doc pode
    // existir sem ela — os números criam antes —, e um atleta qualquer não vira "organizador".
    if (!next.isOrganizer && current.isOrganizer !== true) return;
    tx.set(ref, {
      uid,
      ...next,
      verified: organizerSnap.exists,
      listed: isOrganizerListed(next.isOrganizer, current.stats),
      identityUpdatedAt: Timestamp.fromMillis(nowMs),
    }, {merge: true});
  });
}

/** Selo = `organizers/{uid}` existe AGORA (lido na transação, não o `after` do evento). */
export async function syncOrganizerVerified(db: Firestore, uid: string): Promise<void> {
  const ref = profileRef(db, uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const organizerSnap = await tx.get(db.collection("organizers").doc(uid));
    if (!snap.exists) return;
    if ((snap.data() as DocData).verified === organizerSnap.exists) return;
    tx.update(ref, {verified: organizerSnap.exists});
  });
}

/**
 * Contador de seguidores. Só mexe em doc existente: a rule só deixa seguir organizador com perfil,
 * e um "deixar de seguir" depois de a conta ser apagada não pode ressuscitar o doc com -1.
 */
export async function applyOrganizerFollowerDelta(db: Firestore, organizerId: string, delta: number): Promise<void> {
  if (delta === 0) return;
  const ref = profileRef(db, organizerId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    tx.update(ref, {followersCount: FieldValue.increment(delta)});
  });
}

/** Atletas distintos que jogaram (mesmo filtro dos convites de avaliação), sem o organizador. */
export async function countOrganizerAthletes(
  db: Firestore,
  organizerId: string,
  completedIds: string[],
  projectId: string = getFirebaseProjectId(),
): Promise<number> {
  const uids = new Set<string>();
  for (const group of chunk(completedIds, 5)) {
    const perTournament = await Promise.all(group.map(async (tournamentId) => {
      const snap = await db.collection(artifactsInscriptionsPath(projectId))
        .where("tournamentId", "==", tournamentId)
        .get();
      const inscriptions = snap.docs.map((d) => d.data() as DocData);
      const teamIds = [...new Set(inscriptions.filter(isConfirmedInscription).map((i) => str(i.teamId)))];
      const teamsById = new Map<string, DocData>();
      for (const ids of chunk(teamIds, 100)) {
        const snaps = await db.getAll(...ids.map((id) => db.doc(`${artifactsTeamsPath(projectId)}/${id}`)));
        for (const s of snaps) if (s.exists) teamsById.set(s.id, s.data() as DocData);
      }
      return reviewEligibleUids(inscriptions, teamsById, [organizerId]);
    }));
    for (const list of perTournament) for (const uid of list) uids.add(uid);
  }
  return uids.size;
}

function rowsOf(snap: {docs: Array<{id: string; data: () => unknown}>}): TournamentRow[] {
  return snap.docs.map((d) => ({id: d.id, data: (d.data() ?? {}) as DocData}));
}

const MAX_STATS_ATTEMPTS = 3;

/**
 * Recalcula os números do zero. A leitura dos torneios e a escrita ficam na mesma transação (dois
 * gatilhos do mesmo organizador correm juntos). A contagem de atletas é cara e fica fora; se o
 * conjunto de eventos realizados mudou entre a contagem e a transação, conta de novo.
 */
export async function recomputeOrganizerStats(
  db: Firestore,
  organizerId: string,
  opts: {recountAthletes: boolean; nowMs?: number; projectId?: string},
): Promise<OrganizerStats> {
  const nowMs = opts.nowMs ?? Date.now();
  const projectId = opts.projectId ?? getFirebaseProjectId();
  const ref = profileRef(db, organizerId);
  const tournamentsQuery = db.collection("tournaments")
    .where("managerId", "==", organizerId)
    .select(...ORGANIZER_STATS_SOURCE_FIELDS);

  for (let attempt = 0; attempt < MAX_STATS_ATTEMPTS; attempt++) {
    let athletes: number | null = null;
    let basis: string | null = null;
    if (opts.recountAthletes) {
      const completed = realizedListedTournamentIds(rowsOf(await tournamentsQuery.get()), nowMs);
      athletes = await countOrganizerAthletes(db, organizerId, completed, projectId);
      basis = completed.join(",");
    }
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const rows = rowsOf(await tx.get(tournamentsQuery) as {docs: Array<{id: string; data: () => unknown}>});
      if (basis != null && realizedListedTournamentIds(rows, nowMs).join(",") !== basis) return null;
      const current = snap.exists ? snap.data() as DocData : {};
      const previous = (current.stats ?? {}) as DocData;
      const previousAthletes = typeof previous.athletes === "number" ? previous.athletes : 0;
      const stats = computeOrganizerStats(rows, athletes ?? previousAthletes, nowMs);
      tx.set(ref, {
        uid: organizerId,
        stats,
        listed: isOrganizerListed(current.isOrganizer === true, stats),
        statsUpdatedAt: Timestamp.fromMillis(nowMs),
      }, {merge: true});
      return stats;
    });
    if (result) return result;
  }
  throw new Error(`recomputeOrganizerStats: eventos realizados mudando sem parar (${organizerId})`);
}

/** Janela do job diário: cobre execuções perdidas sem reler o histórico inteiro. */
const RECENTLY_REALIZED_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Organizadores com evento que virou "realizado" pela data nos últimos 3 dias. O relógio passa
 * sem escrita no torneio, então o gatilho sozinho deixaria os números parados. Duas consultas de
 * intervalo em um campo só (sem índice composto): por `endAt`, e por `startAt` para quem não tem
 * `endAt`.
 */
export async function organizersWithRecentlyRealizedEvents(db: Firestore, nowMs: number): Promise<string[]> {
  const from = Timestamp.fromMillis(nowMs - EVENT_END_GRACE_MS - RECENTLY_REALIZED_WINDOW_MS);
  const to = Timestamp.fromMillis(nowMs - EVENT_END_GRACE_MS);
  const tournaments = db.collection("tournaments");
  const [byEnd, byStart] = await Promise.all([
    tournaments.where("endAt", ">=", from).where("endAt", "<=", to).select("managerId", "endAt").get(),
    tournaments.where("startAt", ">=", from).where("startAt", "<=", to).select("managerId", "endAt").get(),
  ]);
  const ids = new Set<string>();
  for (const doc of byEnd.docs) {
    const id = str((doc.data() as DocData).managerId);
    if (id) ids.add(id);
  }
  for (const doc of byStart.docs) {
    const data = doc.data() as DocData;
    if (data.endAt instanceof Timestamp) continue; // já coberto (ou fora) pela consulta de endAt
    const id = str(data.managerId);
    if (id) ids.add(id);
  }
  return [...ids].sort();
}

export async function refreshRecentlyRealizedOrganizerStats(db: Firestore, nowMs: number): Promise<number> {
  const organizerIds = await organizersWithRecentlyRealizedEvents(db, nowMs);
  let refreshed = 0;
  for (const organizerId of organizerIds) {
    // Um organizador com problema não segura os outros.
    try {
      await recomputeOrganizerStats(db, organizerId, {recountAthletes: true, nowMs});
      refreshed += 1;
    } catch (error) {
      logger.error("refreshOrganizerStatsDaily: recálculo falhou", {organizerId, error});
    }
  }
  return refreshed;
}

function dataOf(snap: {exists: boolean; data: () => unknown} | undefined): DocData | null {
  return snap?.exists ? (snap.data() ?? {}) as DocData : null;
}

export const onUserWrittenSyncOrganizerPublicProfile = onDocumentWritten(
  "users/{userId}",
  async (event) => {
    await syncOrganizerIdentity(
      getFirestore(),
      event.params.userId,
      dataOf(event.data?.before),
      dataOf(event.data?.after),
    );
  },
);

export const onOrganizerRecordWrittenSyncVerified = onDocumentWritten(
  "organizers/{organizerId}",
  async (event) => {
    await syncOrganizerVerified(getFirestore(), event.params.organizerId);
  },
);

export const onTournamentWrittenOrganizerStats = onDocumentWritten(
  "tournaments/{tournamentId}",
  async (event) => {
    const before = dataOf(event.data?.before);
    const after = dataOf(event.data?.after);
    if (!organizerStatsRelevantChange(before, after)) return;
    const organizerIds = new Set([str(before?.managerId), str(after?.managerId)].filter((id) => id));
    const recountAthletes = touchesRealizedTournament(before, after, Date.now());
    for (const organizerId of organizerIds) {
      const stats = await recomputeOrganizerStats(getFirestore(), organizerId, {recountAthletes});
      logger.info("organizerPublicProfile: números recalculados", {
        organizerId,
        tournamentId: event.params.tournamentId,
        recountAthletes,
        listedEvents: stats.listedEvents,
      });
    }
  },
);

export const onOrganizerFollowerWritten = onDocumentWritten(
  `${ORGANIZER_PUBLIC_PROFILES_COLLECTION}/{organizerId}/${ORGANIZER_FOLLOWERS_SUBCOLLECTION}/{userId}`,
  async (event) => {
    const delta = followerCountDelta(event.data?.before?.exists === true, event.data?.after?.exists === true);
    await applyOrganizerFollowerDelta(getFirestore(), event.params.organizerId, delta);
  },
);

export const refreshOrganizerStatsDaily = onSchedule(
  {
    schedule: "0 4 * * *",
    timeZone: EVENT_TIME_ZONE,
    timeoutSeconds: 540,
  },
  async (event) => {
    const scheduled = Date.parse(event.scheduleTime);
    const nowMs = Number.isFinite(scheduled) ? scheduled : Date.now();
    const refreshed = await refreshRecentlyRealizedOrganizerStats(getFirestore(), nowMs);
    logger.info("refreshOrganizerStatsDaily", {refreshed});
  },
);
