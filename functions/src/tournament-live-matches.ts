import {FieldValue, type Firestore} from "firebase-admin/firestore";
import {isMatchInProgress} from "./match-status";

export function artifactsMatchesPath(projectId: string): string {
  return `artifacts/${projectId}/public/data/matches`;
}

/** Recalcula `tournaments.liveMatchesNow` a partir das partidas in progress. */
export async function syncTournamentLiveMatchesNow(
  db: Firestore,
  projectId: string,
  tournamentId: string,
): Promise<number> {
  const snap = await db
    .collection(artifactsMatchesPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .get();
  let count = 0;
  for (const doc of snap.docs) {
    if (isMatchInProgress(doc.data().status)) count++;
  }
  await db.doc(`tournaments/${tournamentId}`).set(
    {
      liveMatchesNow: count,
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
  return count;
}
