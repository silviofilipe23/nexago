import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";
import {assertCanManageTournament} from "./tournament-acl";
import {getFirebaseProjectId} from "./firebase-paths";

/**
 * Contatos (telefone/email) dos atletas INSCRITOS em um torneio, para a
 * operação do organizador. Com `users` restrito ao dono (espelho
 * `public_profiles` sem PII), este é o único canal de contato — e é mais
 * estrito que o modelo antigo: o gestor só vê contatos de quem está inscrito
 * no torneio dele.
 */


/** Extrai uids únicos de inscrições (`participantUids`). */
export function collectParticipantUids(
  registrations: Array<Record<string, unknown>>,
): string[] {
  const uids = new Set<string>();
  for (const reg of registrations) {
    const participants = reg["participantUids"];
    if (!Array.isArray(participants)) continue;
    for (const raw of participants) {
      const uid = String(raw ?? "").trim();
      if (uid) uids.add(uid);
    }
  }
  return [...uids];
}

export interface AthleteContact {
  uid: string;
  fullName: string;
  nickname: string;
  phoneNumber: string;
  email: string;
}

export const getTournamentAthleteContacts = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const tournamentId = String(request.data?.tournamentId ?? "").trim();
  if (!tournamentId) {
    throw new HttpsError("invalid-argument", "tournamentId obrigatório");
  }

  const db = getFirestore();
  await assertCanManageTournament(db, uid, tournamentId);

  const projectId = getFirebaseProjectId();
  const regsSnap = await db
    .collection(`artifacts/${projectId}/public/data/inscriptions`)
    .where("tournamentId", "==", tournamentId)
    .get();

  const participantUids = collectParticipantUids(
    regsSnap.docs.map((doc) => doc.data()),
  );

  const contacts: Record<string, AthleteContact> = {};
  const chunkSize = 20;
  for (let i = 0; i < participantUids.length; i += chunkSize) {
    const chunk = participantUids.slice(i, i + chunkSize);
    const snaps = await Promise.all(
      chunk.map((id) => db.doc(`users/${id}`).get()),
    );
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const data = snap.data() ?? {};
      contacts[snap.id] = {
        uid: snap.id,
        fullName: String(data["fullName"] ?? data["name"] ?? "").trim(),
        nickname: String(data["nickname"] ?? "").trim(),
        phoneNumber: String(data["phoneNumber"] ?? "").trim(),
        email: String(data["email"] ?? "").trim(),
      };
    }
  }

  return {contacts};
});
