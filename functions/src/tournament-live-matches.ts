import {FieldValue, type Firestore} from "firebase-admin/firestore";
import {isMatchInProgress} from "./match-status";
import {artifactsMatchesPath} from "./firebase-paths";

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
