/**
 * Convite para a equipe do Centro de Treinamento a partir de um atleta NexaGO (app do CT, G18).
 *
 * O gestor escolhe a pessoa na busca de atletas (`public_profiles`, sem PII); o e-mail da conta
 * só existe no Auth, então quem grava o convite é o servidor. O documento sai no MESMO formato do
 * convite por e-mail do portal (`centerInvites/{id}` com `email`) — aceite, rules e push
 * (`onTrainingCenterInviteNotice`) seguem iguais; `invitedUid` só registra quem foi escolhido.
 */
import {getAuth} from "firebase-admin/auth";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {str} from "./arena-class";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {TRAINING_CENTERS} from "./training-center-billing-model";

type Data = Record<string, unknown>;

export const INVITABLE_CENTER_ROLES = ["coach", "receptionist", "center_admin"] as const;
const ROLE_LABELS: Record<string, string> = {
  coach: "Professor",
  receptionist: "Recepção",
  center_admin: "Admin",
};

export interface TeamInviteDeps {
  /** E-mail da conta (Auth), minúsculo; `null` se a conta não existe ou não tem e-mail. */
  emailOf: (uid: string) => Promise<string | null>;
}

const defaultDeps: TeamInviteDeps = {
  emailOf: async (uid) => {
    try {
      const email = (await getAuth().getUser(uid)).email;
      return email ? email.trim().toLowerCase() : null;
    } catch {
      return null;
    }
  },
};

const ids = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0 && !x.includes("/")))] : [];

/** Tem cadastro de atleta NexaGO? Mesmo critério da busca (`hasAthleteRole` ou `roles`). */
export function isNexagoAthlete(profile: Data | undefined): boolean {
  if (!profile) return false;
  if (profile["hasAthleteRole"] === true) return true;
  const roles = profile["roles"];
  return Array.isArray(roles) && roles.includes("athlete");
}

export function athleteDisplayName(profile: Data): string {
  return str(profile["nickname"]) || str(profile["fullName"]) || str(profile["name"]) || "Atleta";
}

export async function inviteCenterMemberCore(
  db: Firestore, deps: TeamInviteDeps, callerUid: string | undefined, raw: unknown,
): Promise<{inviteId: string; displayName: string}> {
  if (!callerUid) throw new HttpsError("unauthenticated", "Entre de novo.");
  const d = (raw && typeof raw === "object" ? raw : {}) as Data;
  const centerId = str(d["centerId"]);
  const uid = str(d["uid"]);
  const role = str(d["role"]);
  if (!centerId || centerId.includes("/")) throw new HttpsError("invalid-argument", "Centro inválido.");
  if (!uid || uid.includes("/")) throw new HttpsError("invalid-argument", "Escolha um atleta NexaGO.");
  if (!(INVITABLE_CENTER_ROLES as readonly string[]).includes(role)) {
    throw new HttpsError("invalid-argument", "Papel inválido.");
  }

  const centerRef = db.collection(TRAINING_CENTERS).doc(centerId);
  const me = (await centerRef.collection("centerMembers").doc(callerUid).get()).data();
  const myRole = str(me?.["role"]);
  if (me?.["status"] !== "active" || !["center_owner", "center_admin"].includes(myRole)) {
    throw new HttpsError("permission-denied", "Só owner ou admin do centro convida para a equipe.");
  }
  if (role === "center_admin" && myRole !== "center_owner") {
    throw new HttpsError("permission-denied", "Só o owner convida admins.");
  }
  if (uid === callerUid) throw new HttpsError("failed-precondition", "Você já faz parte da equipe.");

  const profile = (await db.collection("public_profiles").doc(uid).get()).data();
  if (!isNexagoAthlete(profile)) {
    throw new HttpsError("failed-precondition", "Só dá para convidar quem tem cadastro de atleta na NexaGO.");
  }
  const member = (await centerRef.collection("centerMembers").doc(uid).get()).data();
  if (member?.["status"] === "active") throw new HttpsError("already-exists", "Essa pessoa já faz parte da equipe.");

  const email = await deps.emailOf(uid);
  if (!email) {
    throw new HttpsError("failed-precondition", "Essa conta não tem e-mail para receber o convite.");
  }
  const pending = await centerRef.collection("centerInvites").where("email", "==", email).limit(10).get();
  if (pending.docs.some((x) => x.data()["status"] === "pending")) {
    throw new HttpsError("already-exists", "Já existe um convite pendente para essa pessoa.");
  }

  const center = (await centerRef.get()).data();
  const displayName = athleteDisplayName(profile!);
  const actorName = str(me?.["displayName"]) || "Gestor";
  const isCoach = role === "coach";
  const ref = centerRef.collection("centerInvites").doc();
  const b = db.batch();
  b.set(ref, {
    centerId,
    centerName: str(center?.["name"]),
    email,
    invitedUid: uid,
    displayName,
    role,
    programIds: isCoach ? ids(d["programIds"]) : [],
    classIds: isCoach ? ids(d["classIds"]) : [],
    status: "pending",
    invitedByUid: callerUid,
    invitedByName: actorName,
    createdAt: FieldValue.serverTimestamp(),
  });
  b.set(centerRef.collection("auditLogs").doc(), {
    at: FieldValue.serverTimestamp(),
    actorUid: callerUid,
    actorName,
    action: "member.invited",
    entity: "invite",
    entityId: ref.id,
    detail: `Convite para ${displayName} · ${ROLE_LABELS[role] ?? role}`,
    reason: "",
  });
  await b.commit();
  return {inviteId: ref.id, displayName};
}

export const inviteTrainingCenterMember = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  inviteCenterMemberCore(getFirestore(), defaultDeps, request.auth?.uid, request.data));
