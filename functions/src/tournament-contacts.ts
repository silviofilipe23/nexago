import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";
import {assertCanManageTournament} from "./tournament-acl";
import {artifactsInscriptionsPath, getFirebaseProjectId} from "./firebase-paths";
import {normalizePhoneForWhatsApp} from "./tournament-cancellation-request";
import {registrationAthleteUids} from "./tournament-registration-pix-helpers";

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

export interface OrganizerContact {
  name: string;
  whatsappPhone: string;
  email: string;
}

/**
 * Contato do ORGANIZADOR para um atleta INSCRITO no torneio — o caminho
 * inverso de `getTournamentAthleteContacts`, e pelo mesmo motivo: `users/{uid}`
 * é fechado, então o telefone do organizador só chega ao atleta por callable.
 * (O app lia `users/{managerId}.phoneNumber` direto e falhava calado quando o
 * organizador não era "atleta público" pelas rules.)
 *
 * Existe para o acerto do reembolso, que acontece FORA da plataforma.
 */
export const getTournamentOrganizerContact = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const tournamentId = String(request.data?.tournamentId ?? "").trim();
  if (!tournamentId) {
    throw new HttpsError("invalid-argument", "tournamentId obrigatório");
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();

  const tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!tournamentSnap.exists) {
    throw new HttpsError("not-found", "Torneio não encontrado");
  }
  const managerId = String(tournamentSnap.data()?.managerId ?? "").trim();
  if (!managerId) {
    throw new HttpsError(
      "failed-precondition",
      "Este torneio não tem organizador com contato cadastrado.",
    );
  }

  // Só quem está inscrito no torneio vê o contato do organizador.
  const regsSnap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .get();
  const isRegistered = regsSnap.docs.some((doc) =>
    registrationAthleteUids(doc.data(), null).includes(uid),
  );
  if (!isRegistered) {
    throw new HttpsError(
      "permission-denied",
      "Apenas atletas inscritos podem ver o contato do organizador.",
    );
  }

  const managerSnap = await db.doc(`users/${managerId}`).get();
  const manager = managerSnap.data() ?? {};
  const organizerProfile =
    (manager["organizerProfile"] as Record<string, unknown> | undefined) ?? {};
  const rawPhone =
    String(organizerProfile["contactPhone"] ?? "").trim() ||
    String(manager["phoneNumber"] ?? "").trim();

  const contact: OrganizerContact = {
    name:
      String(organizerProfile["displayName"] ?? "").trim() ||
      String(manager["fullName"] ?? manager["name"] ?? "").trim() ||
      "Organizador",
    whatsappPhone: normalizePhoneForWhatsApp(rawPhone),
    email:
      String(organizerProfile["contactEmail"] ?? "").trim() ||
      String(manager["email"] ?? "").trim(),
  };
  return {contact};
});
