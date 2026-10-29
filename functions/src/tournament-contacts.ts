import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {
  athleteFingerprint,
  findTwinRegistrationPairs,
  type AthleteFingerprint,
  type TwinRegistrationPair,
} from "./athlete-twin-accounts";
import {assertCanManageTournament} from "./tournament-acl";
import {artifactsInscriptionsPath, getFirebaseProjectId} from "./firebase-paths";
import {normalizePhoneForWhatsApp} from "./tournament-cancellation-request";
import {registrationAthleteUids} from "./tournament-registration-pix-helpers";
import {findCategory, type TournamentData} from "./tournament-registration-guards";
import {CLIENT_FACING_REGIONS} from "./function-regions";

/**
 * Contatos (telefone/email) dos atletas INSCRITOS em um torneio, para a
 * operação do organizador. Com `users` restrito ao dono (espelho
 * `public_profiles` sem PII), este é o único canal de contato — e é mais
 * estrito que o modelo antigo: o gestor só vê contatos de quem está inscrito
 * no torneio dele.
 *
 * Como já lê o cadastro de todo inscrito, é aqui também que sai o aviso de
 * "possível duplicado": a mesma pessoa com duas contas na mesma categoria,
 * pela regra da trava de inscrição (`athlete-twin-accounts.ts`).
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

export interface TournamentAthleteContacts {
  contacts: Record<string, AthleteContact>;
  /**
   * Contas que parecem ser a mesma pessoa inscrita duas vezes na mesma
   * categoria (`findTwinRegistrationPairs`). Só ids: o WhatsApp que liga as
   * duas contas não sai daqui por esse campo.
   */
  twinPairs: TwinRegistrationPair[];
}

/** Inscrições do torneio com a categoria resolvida pelo cadastro do torneio. */
function registrationSeats(
  tournament: TournamentData,
  registrations: Array<{id: string; data: Record<string, unknown>}>,
): Array<{id: string; categoryId: string; uids: string[]}> {
  const seats: Array<{id: string; categoryId: string; uids: string[]}> = [];
  for (const {id, data} of registrations) {
    const raw = String(data["categoryId"] ?? "").trim();
    if (!raw) continue;
    // Categoria legada é referenciada pelo nome em parte das inscrições:
    // as duas grafias são a mesma categoria.
    const category = findCategory(tournament, raw);
    const categoryId = String(category?.id ?? category?.categoryId ?? "").trim() || raw;
    seats.push({id, categoryId, uids: collectParticipantUids([data])});
  }
  return seats;
}

export async function getTournamentAthleteContactsCore(
  db: Firestore,
  uid: string,
  data: unknown,
): Promise<TournamentAthleteContacts> {
  const tournamentId = String(
    (data as Record<string, unknown> | null)?.["tournamentId"] ?? "",
  ).trim();
  if (!tournamentId) {
    throw new HttpsError("invalid-argument", "tournamentId obrigatório");
  }

  const tournament = await assertCanManageTournament(db, uid, tournamentId);

  const projectId = getFirebaseProjectId();
  const regsSnap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .get();
  const registrations = regsSnap.docs.map((doc) => ({id: doc.id, data: doc.data()}));

  const participantUids = collectParticipantUids(registrations.map((r) => r.data));

  const contacts: Record<string, AthleteContact> = {};
  const fingerprints = new Map<string, AthleteFingerprint>();
  const chunkSize = 20;
  for (let i = 0; i < participantUids.length; i += chunkSize) {
    const chunk = participantUids.slice(i, i + chunkSize);
    const snaps = await Promise.all(
      chunk.map((id) => db.doc(`users/${id}`).get()),
    );
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const user = snap.data() ?? {};
      contacts[snap.id] = {
        uid: snap.id,
        fullName: String(user["fullName"] ?? user["name"] ?? "").trim(),
        nickname: String(user["nickname"] ?? "").trim(),
        phoneNumber: String(user["phoneNumber"] ?? "").trim(),
        email: String(user["email"] ?? "").trim(),
      };
      fingerprints.set(snap.id, athleteFingerprint(user));
    }
  }

  const twinPairs = findTwinRegistrationPairs({
    registrations: registrationSeats(tournament, registrations),
    fingerprints,
  });

  return {contacts, twinPairs};
}

export const getTournamentAthleteContacts = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");
  return getTournamentAthleteContactsCore(getFirestore(), uid, request.data);
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
export const getTournamentOrganizerContact = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
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
  return {contact: organizerContactFromUser(managerSnap.data() ?? {})};
});

/**
 * Monta o contato a partir do doc do organizador: `organizerProfile` é o dado
 * de negócio e `users/{uid}` é o fallback de quem nunca preencheu o perfil.
 */
export function organizerContactFromUser(
  manager: Record<string, unknown>,
): OrganizerContact {
  const organizerProfile =
    (manager["organizerProfile"] as Record<string, unknown> | undefined) ?? {};
  const rawPhone =
    String(organizerProfile["contactPhone"] ?? "").trim() ||
    String(manager["phoneNumber"] ?? "").trim();

  return {
    name:
      String(organizerProfile["displayName"] ?? "").trim() ||
      String(manager["fullName"] ?? manager["name"] ?? "").trim() ||
      "Organizador",
    whatsappPhone: normalizePhoneForWhatsApp(rawPhone),
    email:
      String(organizerProfile["contactEmail"] ?? "").trim() ||
      String(manager["email"] ?? "").trim(),
  };
}
