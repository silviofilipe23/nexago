import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";
import {artifactsInscriptionsPath, getFirebaseProjectId} from "./firebase-paths";
import {loadTournamentData} from "./tournament-registration-guards";

export interface RawInscriptionRow {
  athleteUid: string;
  registrationId: string;
  tournamentId: string;
  categoryId: string;
  isPaid: boolean;
  partnerPending: boolean;
}

export interface AthleteTournamentEntry {
  athleteUid: string;
  registrationId: string;
  categoryId: string;
  isPaid: boolean;
  partnerPending: boolean;
}

export interface CoachTournamentOverviewItem {
  tournamentId: string;
  tournamentName: string;
  entries: AthleteTournamentEntry[];
}

/** Agrupa linhas de inscrição já buscadas do Firestore por torneio — puro, sem I/O. */
export function groupEntriesByTournament(
  rows: RawInscriptionRow[],
): Map<string, AthleteTournamentEntry[]> {
  const out = new Map<string, AthleteTournamentEntry[]>();
  for (const row of rows) {
    const list = out.get(row.tournamentId) ?? [];
    list.push({
      athleteUid: row.athleteUid,
      registrationId: row.registrationId,
      categoryId: row.categoryId,
      isPaid: row.isPaid,
      partnerPending: row.partnerPending,
    });
    out.set(row.tournamentId, list);
  }
  return out;
}

/**
 * Visão somente leitura de torneios pros atletas vinculados ao treinador —
 * nunca inscreve/paga (isso continua sendo feito pelo atleta no app dele,
 * por decisão de design). `squadId` opcional filtra pra uma equipe.
 */
export const getCoachTournamentOverview = onCall(async (request) => {
  const coachUid = request.auth?.uid;
  if (!coachUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const squadId = (request.data?.squadId as string | undefined)?.trim() ?? "";

  const db = getFirestore();
  const projectId = getFirebaseProjectId();

  const athletesSnap = await db.collection(`coaches/${coachUid}/athletes`).get();
  const athleteUids = athletesSnap.docs
    .filter((d) => !squadId || d.data()["squadId"] === squadId)
    .map((d) => d.id);

  if (athleteUids.length === 0) {
    return {tournaments: [] as CoachTournamentOverviewItem[]};
  }

  const inscriptionsRef = db.collection(artifactsInscriptionsPath(projectId));
  const rows: RawInscriptionRow[] = [];
  for (const athleteUid of athleteUids) {
    const snap = await inscriptionsRef.where("participantUids", "array-contains", athleteUid).get();
    for (const doc of snap.docs) {
      const data = doc.data();
      const tournamentId = String(data["tournamentId"] ?? "");
      if (!tournamentId) {
        continue;
      }
      rows.push({
        athleteUid,
        registrationId: doc.id,
        tournamentId,
        categoryId: String(data["categoryId"] ?? ""),
        isPaid: data["isPaid"] === true,
        partnerPending: data["partnerPending"] === true,
      });
    }
  }

  const grouped = groupEntriesByTournament(rows);

  const tournaments: CoachTournamentOverviewItem[] = [];
  for (const [tournamentId, entries] of grouped) {
    const tournament = await loadTournamentData(db, projectId, tournamentId);
    tournaments.push({
      tournamentId,
      tournamentName: String(tournament?.["name"] ?? "Torneio"),
      entries,
    });
  }

  return {tournaments};
});
