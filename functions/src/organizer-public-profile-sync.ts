import {FieldValue, getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import {artifactsInscriptionsPath, artifactsTeamsPath, getFirebaseProjectId} from "./firebase-paths";
import {
  buildOrganizerIdentity,
  completedListedTournamentIds,
  computeOrganizerStats,
  followerCountDelta,
  isOrganizerListed,
  ORGANIZER_FOLLOWERS_SUBCOLLECTION,
  ORGANIZER_PUBLIC_PROFILES_COLLECTION,
  organizerStatsRelevantChange,
  sameOrganizerIdentity,
  touchesCompletedTournament,
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
 * então sai sem ler nada quando a projeção não mudou. Quem nunca foi organizador não ganha doc.
 */
export async function syncOrganizerIdentity(
  db: Firestore,
  uid: string,
  before: DocData | null,
  after: DocData | null,
  nowMs: number = Date.now(),
): Promise<void> {
  const ref = profileRef(db, uid);
  if (!after) {
    const snap = await ref.get();
    if (snap.exists) await ref.delete();
    return;
  }
  const next = buildOrganizerIdentity(after);
  if (before && sameOrganizerIdentity(buildOrganizerIdentity(before), next)) return;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists && !next.isOrganizer) return;
    const current = snap.exists ? snap.data() as DocData : {};
    // O selo nasce aqui só na primeira vez; depois quem mantém é o gatilho de `organizers/{uid}`.
    // "Primeira vez" é não ter `verified`, não o doc não existir: os números e o contador de
    // seguidores podem criar o doc antes da identidade, e ele nasceria sem selo.
    const verified = typeof current.verified === "boolean" ?
      current.verified :
      (await tx.get(db.collection("organizers").doc(uid))).exists;
    tx.set(ref, {
      uid,
      ...next,
      verified,
      listed: isOrganizerListed(next.isOrganizer, current.stats),
      identityUpdatedAt: Timestamp.fromMillis(nowMs),
    }, {merge: true});
  });
}

export async function syncOrganizerVerified(db: Firestore, uid: string, verified: boolean): Promise<void> {
  const ref = profileRef(db, uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    if ((snap.data() as DocData).verified === verified) return;
    tx.update(ref, {verified});
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
  const tournamentsQuery = db.collection("tournaments").where("managerId", "==", organizerId);

  for (let attempt = 0; attempt < MAX_STATS_ATTEMPTS; attempt++) {
    let athletes: number | null = null;
    let basis: string | null = null;
    if (opts.recountAthletes) {
      const completed = completedListedTournamentIds(rowsOf(await tournamentsQuery.get()));
      athletes = await countOrganizerAthletes(db, organizerId, completed, projectId);
      basis = completed.join(",");
    }
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const rows = rowsOf(await tx.get(tournamentsQuery) as {docs: Array<{id: string; data: () => unknown}>});
      if (basis != null && completedListedTournamentIds(rows).join(",") !== basis) return null;
      const current = snap.exists ? snap.data() as DocData : {};
      const previous = (current.stats ?? {}) as DocData;
      const previousAthletes = typeof previous.athletes === "number" ? previous.athletes : 0;
      const stats = computeOrganizerStats(rows, athletes ?? previousAthletes);
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
    await syncOrganizerVerified(getFirestore(), event.params.organizerId, event.data?.after?.exists === true);
  },
);

export const onTournamentWrittenOrganizerStats = onDocumentWritten(
  "tournaments/{tournamentId}",
  async (event) => {
    const before = dataOf(event.data?.before);
    const after = dataOf(event.data?.after);
    if (!organizerStatsRelevantChange(before, after)) return;
    const organizerIds = new Set([str(before?.managerId), str(after?.managerId)].filter((id) => id));
    const recountAthletes = touchesCompletedTournament(before, after);
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
    if (delta === 0) return;
    await profileRef(getFirestore(), event.params.organizerId)
      .set({followersCount: FieldValue.increment(delta)}, {merge: true});
  },
);
