import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  assertCanRegisterInTournament,
  loadUserAccessData,
  missingTournamentProfileRequirementLabels,
} from "./athlete-tournament-access";
import {assertTeamLevelEligibility} from "./category-level-eligibility";
import {assertTeamAgeEligibility} from "./category-age-eligibility";
import {
  assertMixedDuoGenderEligibility,
  assertTeamGenderEligibility,
  categoryIsMixedDuo,
  categoryRequiredGenderBucket,
} from "./category-gender-eligibility";
import {
  deliverNotificationToUser,
  markTournamentPartnerInviteInboxResponse,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_SUBJECT,
} from "./notification-delivery";
import {tournamentManagerUids} from "./tournament-acl";
import {
  assertTournamentAcceptsRegistration,
  findCategory,
  loadTournamentData,
  resolveCategoryMatchKeys,
} from "./tournament-registration-guards";
import {
  resolvePartnerRegistrationPlan,
  type InviterCategoryRegistration,
} from "./tournament-solo-registration";
import {
  loadCategoryRegistrationsTx,
  parseCategoryRegistration,
  registrationConflictMessage,
  type ParsedCategoryRegistration,
} from "./tournament-pair-uniqueness";
import {formatCategoryInviteNotificationLabel} from "./category-display-labels";
import {artifactsInscriptionsPath, artifactsTeamsPath, getFirebaseProjectId} from "./firebase-paths";
import {registrationAthleteUids} from "./tournament-registration-pix-helpers";
import {asaasArenaSecrets} from "./asaas-client";
import {deleteAsaasPaymentOrThrow} from "./asaas-booking-payment";
import {
  REGISTRATION_CANCELLATION_BLOCK_MESSAGES,
  buildRegistrationCancellationAudit,
  inviteMatchesCancelledRegistration,
  registrationCancellationBlockReason,
  shouldDeleteTeamOnCancellation,
} from "./tournament-registration-cancellation";
import {
  MIN_TEAM_CATEGORY_SIZE,
  TEAM_CATEGORY_REQUIRES_TEAM_FLOW_MESSAGE,
  evaluateTeamJoin,
  extractTeamMemberUids,
  isTeamCategory,
  isTeamRosterComplete,
  parseGenderComposition,
  registrationTeamSize,
  teamJoinDenialMessage,
} from "./tournament-team-category";
import {resolveUniformSlot} from "./tournament-registration-uniform";
import {loadTeamMemberUids, loadUserGenderBucket} from "./tournament-team-roster";
import {normalizeAthleteGenderBucket} from "./tournament-registration-pix-helpers";
import type {AthleteGenderBucket} from "./tournament-registration-pix-helpers";

export const INVITES_COLLECTION = "tournamentRegistrationInvites";
export const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

// Versão do termo LGPD/uso de imagem exibido nas UIs de inscrição. O aceite é
// opcional no payload (apps antigos não enviam); quando presente, fica
// registrado na inscrição para o organizador consultar.
export const LGPD_TERM_VERSION = "2026-08";

/** Situação do CONVIDADO no gate de perfil de torneio, devolvida no envio do
 *  convite. O envio nunca bloqueia por pendência do convidado — quem valida é
 *  o aceite (`assertCanRegisterInTournament`) — mas sem isto o convidante fica
 *  esperando um aceite que não pode acontecer, sem saber o motivo. */
async function inviteeProfileReadiness(
  db: Firestore,
  inviteeUid: string,
  category?: Record<string, unknown> | null,
): Promise<{inviteeProfileReady: boolean; inviteeMissingSteps: string[]}> {
  const data = await loadUserAccessData(db, inviteeUid);
  const missing = missingTournamentProfileRequirementLabels(data);
  // Categoria de gênero fixo com convidado sem gênero no perfil: o aceite vai
  // exigir (assertTeamGenderEligibility), então a pendência entra na lista.
  // Conflito declarado nem chega aqui — o envio já bloqueou.
  const rawGender = typeof data?.gender === "string" ? data.gender.trim() : "";
  const genderMatters =
    categoryRequiredGenderBucket(category) != null ||
    // Dupla mista também exige gênero declarado no aceite (para saber se fecha
    // 1H+1M); sem isto o convidante esperava um aceite impossível.
    categoryIsMixedDuo(category);
  if (!rawGender && genderMatters) {
    missing.push("gênero");
  }
  return {
    inviteeProfileReady: missing.length === 0,
    inviteeMissingSteps: missing,
  };
}




type UniformType = "none" | "top_only" | "full";

export type TournamentCategory = {
  id?: string;
  categoryId?: string;
  categoryName: string;
  name?: string;
  entryFee?: number;
  uniformType?: UniformType;
  uniformNameOnShirt?: boolean;
  uniformNumberOnShirt?: boolean;
  uniformSizeOptionsTop?: string[];
  uniformSizeOptionsShorts?: string[];
};

export type UniformPayload = {
  sizeTop?: string;
  sizeShorts?: string;
  jerseyNumber?: number;
  jerseyName?: string;
};

const DEFAULT_TOP_SIZES = ["PP", "P", "M", "G", "GG", "XGG"];
const DEFAULT_SHORTS_SIZES = ["PP", "P", "M", "G", "GG", "XGG"];

export function asTournamentCategory(
  raw: Record<string, unknown> | null,
): TournamentCategory | null {
  if (!raw) return null;
  const categoryName = String(raw.categoryName ?? raw.name ?? "").trim();
  if (!categoryName) return null;
  return {
    ...raw,
    categoryName,
  } as TournamentCategory;
}

export function categoryRequiresUniform(category: TournamentCategory): boolean {
  const t = (category.uniformType ?? "none") as string;
  return t === "top_only" || t === "top" || t === "full";
}

function categoryRequiresShorts(category: TournamentCategory): boolean {
  return category.uniformType === "full";
}

function topSizeOptions(category: TournamentCategory): string[] {
  const list = (category.uniformSizeOptionsTop || [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);
  return list.length > 0 ? list : DEFAULT_TOP_SIZES;
}

function shortsSizeOptions(category: TournamentCategory): string[] {
  const list = (category.uniformSizeOptionsShorts || [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);
  return list.length > 0 ? list : DEFAULT_SHORTS_SIZES;
}

export function parseUniformPayload(raw: unknown): UniformPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const sizeTop = typeof data.sizeTop === "string" ? data.sizeTop.trim() : "";
  const sizeShorts =
    typeof data.sizeShorts === "string" ? data.sizeShorts.trim() : "";
  const jerseyName =
    typeof data.jerseyName === "string" ? data.jerseyName.trim() : "";
  const jerseyNumberRaw = data.jerseyNumber;
  const jerseyNumber =
    typeof jerseyNumberRaw === "number"
      ? Math.trunc(jerseyNumberRaw)
      : typeof jerseyNumberRaw === "string"
        ? Math.trunc(Number(jerseyNumberRaw))
        : NaN;

  const payload: UniformPayload = {};
  if (sizeTop) payload.sizeTop = sizeTop;
  if (sizeShorts) payload.sizeShorts = sizeShorts;
  if (jerseyName) payload.jerseyName = jerseyName;
  if (!Number.isNaN(jerseyNumber)) payload.jerseyNumber = jerseyNumber;
  return Object.keys(payload).length > 0 ? payload : null;
}

export function validateUniformPayload(
  category: TournamentCategory,
  uniform: UniformPayload | null,
  required: boolean,
): void {
  if (!required) return;
  if (!uniform?.sizeTop) {
    throw new HttpsError(
      "invalid-argument",
      "Informe o tamanho da regata para esta categoria.",
    );
  }

  const tops = topSizeOptions(category);
  if (!tops.includes(uniform.sizeTop)) {
    throw new HttpsError("invalid-argument", "Tamanho da regata inválido.");
  }

  if (categoryRequiresShorts(category)) {
    if (!uniform.sizeShorts) {
      throw new HttpsError(
        "invalid-argument",
        "Informe o tamanho do shorts para esta categoria.",
      );
    }
    const shorts = shortsSizeOptions(category);
    if (!shorts.includes(uniform.sizeShorts)) {
      throw new HttpsError("invalid-argument", "Tamanho do shorts inválido.");
    }
  }

  if (category.uniformNumberOnShirt) {
    const n = uniform.jerseyNumber;
    if (n == null || n < 1 || n > 99) {
      throw new HttpsError(
        "invalid-argument",
        "Informe um número de camisa entre 1 e 99.",
      );
    }
  }

  if (category.uniformNameOnShirt) {
    if (!uniform.jerseyName?.trim()) {
      throw new HttpsError(
        "invalid-argument",
        "Informe o nome para a camisa.",
      );
    }
  }
}

function uniformToInviteFields(
  uniform: UniformPayload,
  prefix: "inviter" | "invitee",
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (uniform.sizeTop) out[`${prefix}SizeTop`] = uniform.sizeTop;
  if (uniform.sizeShorts) out[`${prefix}SizeShorts`] = uniform.sizeShorts;
  if (uniform.jerseyNumber != null) {
    out[`${prefix}JerseyNumber`] = uniform.jerseyNumber;
  }
  if (uniform.jerseyName) out[`${prefix}JerseyName`] = uniform.jerseyName;
  return out;
}

type UniformSlot = "Player1" | "Player2";

/** Uniforme no slot do atleta — quem é player1 depende de qual inscrição sobrevive.
 *  Exportado para a inscrição criada pelo organizador gravar nos MESMOS campos. */
export function registrationUniformForSlot(
  uniform: UniformPayload,
  slot: UniformSlot,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (uniform.sizeTop) out[`sizeTop${slot}`] = uniform.sizeTop;
  if (uniform.sizeShorts) out[`sizeShorts${slot}`] = uniform.sizeShorts;
  if (uniform.jerseyNumber != null) {
    out[`jerseyNumber${slot}`] = uniform.jerseyNumber;
  }
  if (uniform.jerseyName) out[`jerseyName${slot}`] = uniform.jerseyName;
  return out;
}

/** Uniforme do convidante guardado no convite, de volta como payload. */
function inviterUniformFromInvite(
  invite: Record<string, unknown>,
): UniformPayload | null {
  return parseUniformPayload({
    sizeTop: invite.inviterSizeTop,
    sizeShorts: invite.inviterSizeShorts,
    jerseyNumber: invite.inviterJerseyNumber,
    jerseyName: invite.inviterJerseyName,
  });
}

function registrationUniformFromInvite(
  invite: Record<string, unknown>,
): Record<string, string | number> {
  const uniform = inviterUniformFromInvite(invite);
  return uniform ? registrationUniformForSlot(uniform, "Player1") : {};
}

function registrationUniformPlayer2(
  uniform: UniformPayload,
): Record<string, string | number> {
  return registrationUniformForSlot(uniform, "Player2");
}

/**
 * Entrada do mapa `uniformByUid` (categorias de equipe: uniforme por atleta,
 * sem os slots fixos Player1/Player2 da dupla).
 */
export function uniformByUidEntry(
  uniform: UniformPayload,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (uniform.sizeTop) out.sizeTop = uniform.sizeTop;
  if (uniform.sizeShorts) out.sizeShorts = uniform.sizeShorts;
  if (uniform.jerseyNumber != null) out.jerseyNumber = uniform.jerseyNumber;
  if (uniform.jerseyName) out.jerseyName = uniform.jerseyName;
  return out;
}

async function loadTournamentDataForInvite(
  db: Firestore,
  projectId: string,
  tournamentId: string,
): Promise<Record<string, unknown> | null> {
  return loadTournamentData(db, projectId, tournamentId);
}

function registrationUniformPlayer1(
  uniform: UniformPayload,
): Record<string, string | number> {
  return registrationUniformForSlot(uniform, "Player1");
}

/** Inscrições do atleta na categoria (para decidir criar/anexar/bloquear). */
async function loadAthleteCategoryRegistrations(
  db: Firestore,
  projectId: string,
  uid: string,
  tournamentId: string,
  categoryKeys: Set<string>,
): Promise<InviterCategoryRegistration[]> {
  const inscriptionsRef = db.collection(artifactsInscriptionsPath(projectId));
  const snap = await inscriptionsRef.where("tournamentId", "==", tournamentId).get();
  const teamsRef = db.collection(artifactsTeamsPath(projectId));

  const out: InviterCategoryRegistration[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const inscriptionCategoryId = String(data.categoryId ?? "").trim();
    if (!categoryKeys.has(inscriptionCategoryId)) continue;
    const teamId = (data.teamId as string | undefined)?.trim() ?? "";

    let isPlayer1: boolean;
    let isMember: boolean;
    if (teamId) {
      // Inscrição com equipe (dupla ou solo legado): usa o time.
      const teamSnap = await teamsRef.doc(teamId).get();
      if (!teamSnap.exists) continue;
      const team = teamSnap.data()!;
      isPlayer1 = team.player1Id === uid;
      isMember = isPlayer1 || team.player2Id === uid;
    } else {
      // Inscrição solo nova (sem equipe): membresia vem da própria inscrição.
      const player1Id = (data.player1Id as string | undefined)?.trim() ?? "";
      const participants = Array.isArray(data.participantUids)
        ? (data.participantUids as unknown[]).map((p) => String(p).trim())
        : [];
      isPlayer1 = player1Id === uid;
      isMember = isPlayer1 || participants.includes(uid);
    }
    if (!isMember) continue;
    out.push({
      registrationId: doc.id,
      teamId,
      isPlayer1,
      isMember,
      partnerPending: data.partnerPending === true,
    });
  }
  return out;
}

async function userHasCategoryRegistration(
  db: Firestore,
  projectId: string,
  uid: string,
  tournamentId: string,
  categoryKeys: Set<string>,
): Promise<boolean> {
  const regs = await loadAthleteCategoryRegistrations(
    db,
    projectId,
    uid,
    tournamentId,
    categoryKeys,
  );
  return regs.length > 0;
}

async function findPendingInvite(
  db: Firestore,
  tournamentId: string,
  categoryId: string,
  inviterUid: string,
  inviteeUid: string,
): Promise<boolean> {
  const snap = await db
    .collection(INVITES_COLLECTION)
    .where("tournamentId", "==", tournamentId)
    .where("inviterUid", "==", inviterUid)
    .where("status", "==", "pending")
    .get();

  const now = Date.now();
  return snap.docs.some((d) => {
    const data = d.data();
    if (data.categoryId !== categoryId || data.inviteeUid !== inviteeUid) {
      return false;
    }
    // Convites expirados ficam com status "pending" até alguém tocá-los — não
    // devem bloquear um novo envio (mesmo critério do accept, que marca expired).
    const expiresAt = data.expiresAt as Timestamp | undefined;
    if (expiresAt && typeof expiresAt.toMillis === "function" && expiresAt.toMillis() < now) {
      return false;
    }
    return true;
  });
}

/** Inscrições parseadas na categoria (para guard de par no send). */
async function loadCategoryRegistrationsForPairCheck(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  categoryKeys: Set<string>,
): Promise<ParsedCategoryRegistration[]> {
  const inscriptionsRef = db.collection(artifactsInscriptionsPath(projectId));
  const snap = await inscriptionsRef.where("tournamentId", "==", tournamentId).get();
  const teamsRef = db.collection(artifactsTeamsPath(projectId));

  const out: ParsedCategoryRegistration[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const inscriptionCategoryId = String(data.categoryId ?? "").trim();
    if (!categoryKeys.has(inscriptionCategoryId)) continue;

    const teamId = (data.teamId as string | undefined)?.trim() ?? "";
    let team: Record<string, unknown> | null = null;
    if (teamId) {
      const teamSnap = await teamsRef.doc(teamId).get();
      if (teamSnap.exists) team = teamSnap.data()!;
    }
    out.push(parseCategoryRegistration(doc.id, data, team));
  }
  return out;
}

/** Cancela convites pendentes obsoletos após aceite de dupla. */
async function markStaleInvitesAfterAccept(
  db: Firestore,
  tournamentId: string,
  categoryId: string,
  inviterUid: string,
  inviteeUid: string,
  acceptedInviteId: string,
): Promise<void> {
  const snap = await db
    .collection(INVITES_COLLECTION)
    .where("tournamentId", "==", tournamentId)
    .where("status", "==", "pending")
    .get();

  const batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    if (doc.id === acceptedInviteId) continue;
    const data = doc.data();
    if (data.categoryId !== categoryId) continue;

    const inviter = (data.inviterUid as string | undefined)?.trim() ?? "";
    const invitee = (data.inviteeUid as string | undefined)?.trim() ?? "";
    const touchesPair =
      inviter === inviterUid ||
      inviter === inviteeUid ||
      invitee === inviterUid ||
      invitee === inviteeUid;
    if (!touchesPair) continue;

    batch.update(doc.ref, {
      status: "stale",
      staleReason: "accepted_other_invite",
      staleAt: FieldValue.serverTimestamp(),
    });
    count++;
  }
  if (count > 0) {
    await batch.commit();
    logger.info("Marked stale tournament invites after accept", {
      tournamentId,
      categoryId,
      acceptedInviteId,
      count,
    });
  }
}

/** Elenco completo: convites pendentes restantes da inscrição viram stale. */
async function markStaleTeamInvitesAfterRosterFull(
  db: Firestore,
  tournamentId: string,
  registrationId: string,
  acceptedInviteId: string,
): Promise<void> {
  const snap = await db
    .collection(INVITES_COLLECTION)
    .where("tournamentId", "==", tournamentId)
    .where("status", "==", "pending")
    .get();

  const batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    if (doc.id === acceptedInviteId) continue;
    const data = doc.data();
    // Convite de substituição não é vaga prometida: elenco completo não o invalida.
    if (data.isSubstitutionInvite === true) continue;
    if (String(data.attachRegistrationId ?? "").trim() !== registrationId) {
      continue;
    }
    batch.update(doc.ref, {
      status: "stale",
      staleReason: "roster_full",
      staleAt: FieldValue.serverTimestamp(),
    });
    count++;
  }
  if (count > 0) {
    await batch.commit();
    logger.info("Marked stale team invites after roster full", {
      tournamentId,
      registrationId,
      acceptedInviteId,
      count,
    });
  }
}

/** Cancela convites create pendentes do convidador após inscrição solo. */
async function markStaleCreateInvitesAfterSolo(
  db: Firestore,
  tournamentId: string,
  categoryId: string,
  inviterUid: string,
): Promise<void> {
  const snap = await db
    .collection(INVITES_COLLECTION)
    .where("tournamentId", "==", tournamentId)
    .where("inviterUid", "==", inviterUid)
    .where("status", "==", "pending")
    .get();

  const batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.categoryId !== categoryId) continue;
    const attachId =
      (data.attachRegistrationId as string | undefined)?.trim() ?? "";
    if (attachId) continue;

    batch.update(doc.ref, {
      status: "stale",
      staleReason: "solo_registered",
      staleAt: FieldValue.serverTimestamp(),
    });
    count++;
  }
  if (count > 0) {
    await batch.commit();
    logger.info("Marked stale create invites after solo registration", {
      tournamentId,
      categoryId,
      inviterUid,
      count,
    });
  }
}

/** Convite expirado não bloqueia nem reserva vaga (mesmo critério do accept). */
function inviteExpired(invite: Record<string, unknown>, nowMs: number): boolean {
  const expiresAt = invite.expiresAt as Timestamp | undefined;
  return Boolean(
    expiresAt &&
      typeof expiresAt.toMillis === "function" &&
      expiresAt.toMillis() < nowMs,
  );
}

/**
 * Convite para categoria de EQUIPE (trio/quarteto/quinteto): sempre anexado à
 * inscrição criada pelo capitão em `createTournamentTeamRegistration`. Não há
 * fusão de reservas solo — convidado só aceita/recusa. Convite pendente conta
 * como vaga prometida: o capitão não convida além das vagas restantes e a
 * composição de gênero é validada contra elenco + convites pendentes.
 */
async function sendTeamCategoryInvite(params: {
  db: Firestore;
  projectId: string;
  tournament: Record<string, unknown>;
  category: TournamentCategory;
  tournamentId: string;
  categoryId: string;
  categoryKeys: Set<string>;
  inviterUid: string;
  inviterName: string;
  inviteeUid: string;
  inviteeName: string;
}): Promise<{
  inviteId: string;
  inviteeProfileReady: boolean;
  inviteeMissingSteps: string[];
}> {
  const {
    db,
    projectId,
    tournament,
    category,
    tournamentId,
    categoryId,
    categoryKeys,
    inviterUid,
    inviterName,
    inviteeUid,
    inviteeName,
  } = params;

  const inscriptionsRef = db.collection(artifactsInscriptionsPath(projectId));
  const snap = await inscriptionsRef
    .where("tournamentId", "==", tournamentId)
    .get();

  let captainRegId = "";
  let captainReg: Record<string, unknown> | null = null;
  let inviterIsMemberOnly = false;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!categoryKeys.has(String(data.categoryId ?? "").trim())) continue;
    const participants = Array.isArray(data.participantUids)
      ? (data.participantUids as unknown[]).map((p) => String(p).trim())
      : [];
    if (participants.includes(inviteeUid)) {
      throw new HttpsError(
        "failed-precondition",
        "Este atleta já está inscrito nesta categoria.",
      );
    }
    const captainUid = String(
      data.captainUid ?? data.player1Id ?? "",
    ).trim();
    if (captainUid === inviterUid) {
      captainRegId = doc.id;
      captainReg = data;
    } else if (participants.includes(inviterUid)) {
      inviterIsMemberOnly = true;
    }
  }

  if (!captainReg) {
    throw new HttpsError(
      "failed-precondition",
      inviterIsMemberOnly
        ? "Apenas o capitão convida atletas para a equipe."
        : "Crie sua equipe nesta categoria antes de convidar atletas.",
    );
  }

  const teamSize = registrationTeamSize(captainReg, category);
  const teamId = String(captainReg.teamId ?? "").trim();
  const teamSnap = teamId
    ? await db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`).get()
    : null;
  if (!teamSnap?.exists) {
    throw new HttpsError(
      "failed-precondition",
      "Equipe da inscrição não encontrada.",
    );
  }
  const team = teamSnap.data()!;
  const members = extractTeamMemberUids(team);
  if (members.includes(inviteeUid)) {
    throw new HttpsError(
      "failed-precondition",
      "Este atleta já está na sua equipe.",
    );
  }
  if (isTeamRosterComplete(members.length, teamSize)) {
    throw new HttpsError("failed-precondition", "A equipe já está completa.");
  }

  const invitesSnap = await db
    .collection(INVITES_COLLECTION)
    .where("tournamentId", "==", tournamentId)
    .where("status", "==", "pending")
    .get();
  const nowMs = Date.now();
  const pendingInvites = invitesSnap.docs
    .map((d) => d.data())
    .filter(
      (d) =>
        String(d.attachRegistrationId ?? "").trim() === captainRegId &&
        d.isSubstitutionInvite !== true &&
        !inviteExpired(d, nowMs),
    );

  if (pendingInvites.some((d) => d.inviteeUid === inviteeUid)) {
    throw new HttpsError(
      "already-exists",
      "Já existe um convite pendente para este atleta.",
    );
  }
  if (members.length + pendingInvites.length >= teamSize) {
    throw new HttpsError(
      "failed-precondition",
      "Todas as vagas da equipe já estão preenchidas ou reservadas por " +
        "convites pendentes. Cancele um convite para chamar outro atleta.",
    );
  }

  const composition = parseGenderComposition(category, teamSize);
  let inviteeBucket: AthleteGenderBucket | null = null;
  if (composition) {
    const memberBuckets = await Promise.all(
      members.map((m) => loadUserGenderBucket(db, m)),
    );
    const pendingBuckets = pendingInvites.map((d) =>
      d.inviteeGenderBucket === "M" || d.inviteeGenderBucket === "F"
        ? (d.inviteeGenderBucket as AthleteGenderBucket)
        : null,
    );
    inviteeBucket = await loadUserGenderBucket(db, inviteeUid);
    const joinCheck = evaluateTeamJoin({
      teamSize,
      composition,
      currentBuckets: [...memberBuckets, ...pendingBuckets],
      joiningBucket: inviteeBucket,
    });
    if (!joinCheck.ok) {
      throw new HttpsError(
        "failed-precondition",
        teamJoinDenialMessage(joinCheck.reason),
      );
    }
  }

  const teamName = String(
    captainReg.teamName ?? team.teamName ?? "",
  ).trim();
  const expiresAt = Timestamp.fromMillis(nowMs + INVITE_TTL_MS);
  const ref = db.collection(INVITES_COLLECTION).doc();
  await ref.set({
    tournamentId,
    categoryId,
    inviterUid,
    inviterName,
    inviteeUid,
    inviteeName,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    attachRegistrationId: captainRegId,
    attachTeamId: teamId,
    isTeamInvite: true,
    teamName,
    teamSize,
    // Gênero do convidado congelado no envio: convites pendentes consomem cota
    // da composição e a conta precisa bater sem reler N perfis a cada envio.
    ...(inviteeBucket ? {inviteeGenderBucket: inviteeBucket} : {}),
  });

  try {
    const tournamentName = String(tournament.name ?? "").trim();
    const categoryLabel = formatCategoryInviteNotificationLabel(category);
    await deliverNotificationToUser({
      userId: inviteeUid,
      title: `${inviterName} convidou você para a equipe ${teamName}`,
      body:
        `Aceite o convite para competir na categoria ${categoryLabel} ` +
        `do ${tournamentName}.`,
      type: "tournament_partner_invite",
      data: {
        inviteId: ref.id,
        tournamentId,
        categoryId,
        categoryName: categoryLabel,
        inviterUid,
        teamName,
      },
    });
  } catch (notifyError) {
    logger.warn("Falha ao notificar convidado da equipe", {
      inviteId: ref.id,
      inviteeUid,
      notifyError,
    });
  }

  logger.info("Tournament team invite sent", {
    inviteId: ref.id,
    tournamentId,
    categoryId,
    inviterUid,
    inviteeUid,
    teamId,
  });

  return {inviteId: ref.id, ...(await inviteeProfileReadiness(db, inviteeUid))};
}

/**
 * Parâmetros de {@link sendPartnerInviteFor}.
 */
export interface SendPartnerInviteParams {
  /** Quem convida (autenticado). */
  uid: string;
  tournamentId: string;
  categoryId: string;
  inviteeUid: string;
  inviteeName: string;
  inviterName: string;
  lgpdAccepted?: boolean;
  inviterUniform?: unknown;
}

/**
 * Cria o convite de parceiro — TODA a validação e o efeito de
 * `sendTournamentPartnerInvite`, sem depender do `request`.
 *
 * Existe separado porque o convite por link (`claimExternalPartnerInvite`)
 * precisa exatamente disto em nome de quem compartilhou o link: duas cópias da
 * validação divergiriam, e é justamente a validação que protege a categoria.
 */
export async function sendPartnerInviteFor(
  params: SendPartnerInviteParams,
): Promise<{inviteId: string; inviteeProfileReady: boolean; inviteeMissingSteps: string[]}> {
  const uid = params.uid;
  const tournamentId = params.tournamentId.trim();
  const categoryId = params.categoryId.trim();
  const inviteeUid = params.inviteeUid.trim();
  const inviteeName = params.inviteeName.trim() || "Atleta";
  const inviterName = params.inviterName.trim() || "Atleta";

  if (!tournamentId || !categoryId || !inviteeUid) {
    throw new HttpsError(
      "invalid-argument",
      "tournamentId, categoryId e inviteeUid são obrigatórios."
    );
  }

  if (inviteeUid === uid) {
    throw new HttpsError("invalid-argument", "Você não pode convidar a si mesmo.");
  }

  const projectId = getFirebaseProjectId();
  const db = getFirestore();

  await assertCanRegisterInTournament(db, uid);

  const tournament = await loadTournamentDataForInvite(db, projectId, tournamentId);
  if (!tournament) {
    throw new HttpsError("not-found", "Torneio não encontrado.");
  }
  await assertTournamentAcceptsRegistration(
    db,
    projectId,
    tournamentId,
    categoryId,
  );
  const category = asTournamentCategory(findCategory(tournament, categoryId));
  if (!category) {
    throw new HttpsError("not-found", "Categoria não encontrada neste torneio.");
  }

  await assertTeamLevelEligibility({
    db,
    tournament,
    category,
    uids: [uid, inviteeUid],
  });
  await assertTeamAgeEligibility({
    db,
    tournament,
    category,
    uids: [uid, inviteeUid],
  });
  // Gênero declarado incompatível bloqueia já aqui; AUSENTE não — o convite é
  // o empurrão pro parceiro completar o perfil (a resposta avisa o convidante)
  // e o aceite valida com requireDeclared. Equipe (trio+) não passa por esta
  // validação: a composição por buckets cuida no ramo próprio.
  await assertTeamGenderEligibility({
    db,
    category,
    uids: [uid, inviteeUid],
    requireDeclared: false,
  });
  // Dupla MISTA: o gênero exigido é relacional (o parceiro tem de ser o oposto
  // de quem convida), então não cabe em `assertTeamGenderEligibility`, que
  // valida um gênero fixo da categoria. Mesma política de pendência: mesmo
  // gênero DECLARADO bloqueia aqui; ausente espera o aceite.
  await assertMixedDuoGenderEligibility({
    db,
    category,
    uids: [uid, inviteeUid],
    requireDeclared: false,
  });

  const categoryKeys = resolveCategoryMatchKeys(tournament, categoryId);

  // Categoria de equipe: convite anexado à inscrição do capitão, sem fusão de
  // reservas solo. LGPD/uniforme do capitão já vivem na inscrição criada em
  // createTournamentTeamRegistration.
  if (isTeamCategory(category)) {
    return await sendTeamCategoryInvite({
      db,
      projectId,
      tournament,
      category,
      tournamentId,
      categoryId,
      categoryKeys,
      inviterUid: uid,
      inviterName,
      inviteeUid,
      inviteeName,
    });
  }

  const uniformRequired = categoryRequiresUniform(category);
  const inviterLgpdAccepted = params.lgpdAccepted === true;
  const inviterUniform = parseUniformPayload(params.inviterUniform);
  // Uniforme é opcional na inscrição (coletado depois); valida só se enviado.
  validateUniformPayload(
    category,
    inviterUniform,
    inviterUniform != null && uniformRequired,
  );

  // Reserva solo (`partnerPending`) é vaga guardada, não dupla fechada — dos DOIS
  // lados. O plano decide qual inscrição recebe a dupla e qual reserva é
  // liberada; só dupla já fechada bloqueia. É reavaliado no aceite (a situação
  // pode mudar nas 48h do convite), então aqui ele vale como validação adiantada.
  const categoryRegs = await loadCategoryRegistrationsForPairCheck(
    db,
    projectId,
    tournamentId,
    categoryKeys,
  );
  const plan = resolvePartnerRegistrationPlan(categoryRegs, uid, inviteeUid);
  if (plan.kind === "blocked") {
    throw new HttpsError(
      "failed-precondition",
      registrationConflictMessage(plan.reason),
    );
  }

  if (await findPendingInvite(db, tournamentId, categoryId, uid, inviteeUid)) {
    throw new HttpsError(
      "already-exists",
      "Já existe um convite pendente para este parceiro."
    );
  }

  const now = Date.now();
  const expiresAt = Timestamp.fromMillis(now + INVITE_TTL_MS);
  const ref = db.collection(INVITES_COLLECTION).doc();

  const inviteData: Record<string, unknown> = {
    tournamentId,
    categoryId,
    inviterUid: uid,
    inviterName,
    inviteeUid,
    inviteeName,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    // Modo anexar: o convite preenche uma reserva solo já existente — do
    // convidante ou do convidado. attachTeamId só existe em solo legado (com
    // equipe); no solo novo a equipe é criada no aceite.
    ...(plan.kind === "attach"
      ? {
          attachRegistrationId: plan.registrationId,
          ...(plan.teamId ? {attachTeamId: plan.teamId} : {}),
        }
      : {}),
    // Aceite LGPD do convidante fica no convite e é copiado para a inscrição
    // quando o convidado aceita.
    ...(inviterLgpdAccepted
      ? {
          inviterLgpdAccepted: true,
          inviterLgpdAcceptedAt: FieldValue.serverTimestamp(),
          lgpdTermVersion: LGPD_TERM_VERSION,
        }
      : {}),
  };
  if (inviterUniform) {
    Object.assign(
      inviteData,
      uniformToInviteFields(inviterUniform, "inviter"),
    );
  }
  await ref.set(inviteData);

  try {
    const tournamentName = String(tournament.name ?? "").trim();
    const categoryLabel = formatCategoryInviteNotificationLabel(category);
    const body =
      `Aceite o convite para competir na categoria ${categoryLabel} do ${tournamentName}.`;
    const title = `${inviterName} quer jogar com você`;

    await deliverNotificationToUser({
      userId: inviteeUid,
      title: title,
      body,
      type: "tournament_partner_invite",
      data: {
        inviteId: ref.id,
        tournamentId,
        categoryId,
        categoryName: categoryLabel,
        inviterUid: uid,
      },
    });
  } catch (notifyError) {
    logger.warn("Falha ao notificar convidado do torneio", {
      inviteId: ref.id,
      inviteeUid,
      notifyError,
    });
  }

  logger.info("Tournament partner invite sent", {
    inviteId: ref.id,
    tournamentId,
    categoryId,
    inviterUid: uid,
    inviteeUid,
  });

  return {
    inviteId: ref.id,
    ...(await inviteeProfileReadiness(db, inviteeUid, category)),
  };
}

export const sendTournamentPartnerInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }
  return await sendPartnerInviteFor({
    uid,
    tournamentId: (request.data?.tournamentId as string | undefined) ?? "",
    categoryId: (request.data?.categoryId as string | undefined) ?? "",
    inviteeUid: (request.data?.inviteeUid as string | undefined) ?? "",
    inviteeName: (request.data?.inviteeName as string | undefined) ?? "",
    inviterName: (request.data?.inviterName as string | undefined) ?? "",
    lgpdAccepted: request.data?.lgpdAccepted === true,
    inviterUniform: request.data?.inviterUniform,
  });
});

/**
 * Inscrição "solo": garante a vaga sem parceiro confirmado. Cria uma equipe com
 * `player2Id` vazio e a inscrição com `partnerPending: true`. O parceiro entra
 * depois ao aceitar um convite (que ANEXA a esta inscrição).
 */
export const registerSoloTournament = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const tournamentId =
    (request.data?.tournamentId as string | undefined)?.trim() ?? "";
  const categoryId =
    (request.data?.categoryId as string | undefined)?.trim() ?? "";
  if (!tournamentId || !categoryId) {
    throw new HttpsError(
      "invalid-argument",
      "tournamentId e categoryId são obrigatórios.",
    );
  }

  const projectId = getFirebaseProjectId();
  const db = getFirestore();

  await assertCanRegisterInTournament(db, uid);

  const tournament = await loadTournamentDataForInvite(db, projectId, tournamentId);
  if (!tournament) {
    throw new HttpsError("not-found", "Torneio não encontrado.");
  }
  const tournamentData = await assertTournamentAcceptsRegistration(
    db,
    projectId,
    tournamentId,
    categoryId,
  );
  const shouldWaitlist =
    (tournamentData as Record<string, unknown>).__shouldWaitlist === true;
  const category = asTournamentCategory(findCategory(tournament, categoryId));
  if (!category) {
    throw new HttpsError("not-found", "Categoria não encontrada neste torneio.");
  }

  // Categoria de equipe (trio+) não tem reserva solo: a vaga nasce com a equipe
  // nomeada (createTournamentTeamRegistration). Clientes antigos recebem o
  // direcionamento em vez de criarem uma inscrição impossível de completar.
  if (isTeamCategory(category)) {
    throw new HttpsError(
      "failed-precondition",
      TEAM_CATEGORY_REQUIRES_TEAM_FLOW_MESSAGE,
    );
  }

  await assertTeamLevelEligibility({
    db,
    tournament,
    category,
    uids: [uid],
  });
  await assertTeamAgeEligibility({
    db,
    tournament,
    category,
    uids: [uid],
  });
  // Reserva solo garante vaga em categoria de gênero fixo, então o próprio
  // atleta precisa ter gênero declarado e compatível já aqui (requireDeclared)
  // — antes disso o servidor confiava só na pré-validação client-side. Equipe
  // (trio+) nunca chega aqui: bloqueada acima.
  await assertTeamGenderEligibility({
    db,
    category,
    uids: [uid],
    requireDeclared: true,
  });

  const categoryKeys = resolveCategoryMatchKeys(tournament, categoryId);
  const lgpdAccepted = request.data?.lgpdAccepted === true;
  const uniform = parseUniformPayload(request.data?.uniform);
  // Uniforme é coletado depois (pós-inscrição) — não bloqueia a vaga. Valida só
  // se o cliente enviou um uniforme aqui.
  validateUniformPayload(
    category,
    uniform,
    uniform != null && categoryRequiresUniform(category),
  );

  if (await userHasCategoryRegistration(db, projectId, uid, tournamentId, categoryKeys)) {
    throw new HttpsError(
      "failed-precondition",
      "Você já possui inscrição nesta categoria.",
    );
  }

  const inscriptionsRef = db.collection(artifactsInscriptionsPath(projectId));
  const regRef = inscriptionsRef.doc();

  // A EQUIPE não é criada aqui: uma dupla com 1 atleta não deve existir. A vaga
  // fica reservada apenas na inscrição (player1Id). O doc em `teams` é criado
  // quando o parceiro aceita o convite (em acceptTournamentPartnerInvite).
  const regData: Record<string, unknown> = {
    tournamentId,
    categoryId,
    player1Id: uid,
    participantUids: [uid],
    partnerPending: true,
    isPaid: false,
    paidAmount: 0,
    createdAt: FieldValue.serverTimestamp(),
    ...(shouldWaitlist ? {waitlist: true} : {}),
    ...(uniform ? registrationUniformPlayer1(uniform) : {}),
    ...(lgpdAccepted
      ? {
          lgpdAcceptedUids: [uid],
          lgpdAcceptedAt: {[uid]: FieldValue.serverTimestamp()},
          lgpdTermVersion: LGPD_TERM_VERSION,
        }
      : {}),
  };
  // A criação entra numa transação com uma releitura ESTREITA (só inscrições
  // deste atleta neste torneio, pelo índice `tournamentId + participantUids`).
  // A checagem larga acima cobre o legado, mas ela lê e escreve fora de
  // transação: dois toques simultâneos no botão liam "sem inscrição" ao mesmo
  // tempo e criavam DUAS reservas para o mesmo atleta — a segunda ficava
  // invisível no app (a tela mapeia uma inscrição por categoria) e comia uma
  // vaga da categoria para sempre.
  await db.runTransaction(async (tx) => {
    const mine = await tx.get(
      inscriptionsRef
        .where("tournamentId", "==", tournamentId)
        .where("participantUids", "array-contains", uid),
    );
    const alreadyInCategory = mine.docs.some((doc) =>
      categoryKeys.has(String(doc.data().categoryId ?? "").trim()),
    );
    if (alreadyInCategory) {
      throw new HttpsError(
        "failed-precondition",
        "Você já possui inscrição nesta categoria.",
      );
    }
    tx.set(regRef, regData);
  });

  await markStaleCreateInvitesAfterSolo(db, tournamentId, categoryId, uid);

  logger.info("Tournament solo registration created (no team yet)", {
    registrationId: regRef.id,
    tournamentId,
    categoryId,
    uid,
  });

  return {registrationId: regRef.id};
});

/**
 * Cancela a reserva/inscrição do próprio atleta — somente enquanto não há
 * NENHUM pagamento (nem `isPaid`, nem parcela em `sharePaidUids`). Cobre solo
 * (sem `teams` doc, identificado por `player1Id`/`participantUids` na própria
 * inscrição) e dupla já formada (via `teams.player1Id`/`player2Id`).
 *
 * Além do doc da inscrição, morrem junto: cobranças PIX abertas no Asaas (e os
 * docs `pixPending`), a equipe quando nenhuma outra inscrição a referencia e os
 * convites pendentes ligados. Uma trilha de auditoria é gravada antes do delete.
 */
export const cancelTournamentRegistration = onCall({
  secrets: [...asaasArenaSecrets],
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para cancelar sua inscrição.");
  }

  const registrationId =
    (request.data?.registrationId as string | undefined)?.trim() ?? "";
  if (!registrationId) {
    throw new HttpsError("invalid-argument", "registrationId é obrigatório.");
  }

  const projectId = getFirebaseProjectId();
  const db = getFirestore();

  const regRef = db
    .collection(artifactsInscriptionsPath(projectId))
    .doc(registrationId);
  const regSnap = await regRef.get();
  if (!regSnap.exists) {
    throw new HttpsError("not-found", "Inscrição não encontrada.");
  }
  const registration = regSnap.data()!;

  const blockReason = registrationCancellationBlockReason(registration);
  if (blockReason) {
    throw new HttpsError(
      "failed-precondition",
      REGISTRATION_CANCELLATION_BLOCK_MESSAGES[blockReason],
    );
  }

  const teamId = (registration.teamId as string | undefined)?.trim() ?? "";
  let team: Record<string, unknown> | null = null;
  if (teamId) {
    const teamSnap = await db
      .doc(`${artifactsTeamsPath(projectId)}/${teamId}`)
      .get();
    team = teamSnap.exists ? (teamSnap.data() as Record<string, unknown>) : null;
  }
  const athleteUids = registrationAthleteUids(registration, team);
  if (!athleteUids.includes(uid)) {
    throw new HttpsError(
      "permission-denied",
      "Você não é um dos atletas desta inscrição.",
    );
  }

  // Categoria de equipe: cancelar desfaz a equipe INTEIRA — só o capitão pode.
  // Integrante que quer sair usa leaveTournamentTeamRegistration.
  const isTeamRegistration =
    registrationTeamSize(registration, null) >= MIN_TEAM_CATEGORY_SIZE;
  if (isTeamRegistration) {
    const captainUid = String(
      team?.captainUid ?? registration.captainUid ?? registration.player1Id ?? "",
    ).trim();
    if (captainUid && uid !== captainUid) {
      throw new HttpsError(
        "permission-denied",
        "Apenas o capitão pode cancelar a inscrição da equipe. " +
          "Para deixar a equipe, use \"Sair da equipe\".",
      );
    }
  }

  const tournamentId =
    (registration.tournamentId as string | undefined)?.trim() ?? "";
  const categoryId = (registration.categoryId as string | undefined)?.trim() ?? "";

  // Cobranças PIX abertas morrem ANTES de qualquer escrita: se o Asaas falhar,
  // a inscrição continua intacta. Sem isso, a cobrança sobreviveria ao doc e um
  // pagamento tardio cairia como órfão no webhook.
  const pixPendingSnap = await regRef.collection("pixPending").get();
  for (const doc of pixPendingSnap.docs) {
    const data = doc.data();
    const asaasId = (data.asaasPaymentId as string | undefined)?.trim() ?? "";
    if (!asaasId || data.status === "paid") continue;
    try {
      await deleteAsaasPaymentOrThrow(asaasId);
    } catch (e) {
      logger.error("Falha ao cancelar PIX no Asaas durante cancelamento", {
        registrationId,
        asaasId,
        error: e,
      });
      throw new HttpsError(
        "unavailable",
        "Não foi possível cancelar a cobrança PIX pendente. Tente novamente.",
      );
    }
  }

  // Convites pendentes ligados a esta inscrição (solo aguardando parceiro)
  // não devem sobreviver à reserva cancelada.
  const invitesSnap = await db
    .collection(INVITES_COLLECTION)
    .where("tournamentId", "==", tournamentId)
    .where("status", "==", "pending")
    .get();

  // A equipe só morre junto se nenhuma OUTRA inscrição a referencia
  // (ex.: solo legado reaproveitado).
  let deleteTeam = false;
  if (teamId) {
    const teamRegsSnap = await db
      .collection(artifactsInscriptionsPath(projectId))
      .where("teamId", "==", teamId)
      .get();
    deleteTeam = shouldDeleteTeamOnCancellation(
      teamId,
      teamRegsSnap.docs.map((d) => d.id),
      registrationId,
    );
  }

  const batch = db.batch();
  const auditRef = db.collection("tournamentRegistrationCancellations").doc();
  batch.set(auditRef, {
    ...buildRegistrationCancellationAudit({
      registrationId,
      cancelledBy: uid,
      athleteUids,
      registration,
    }),
    cancelledAt: FieldValue.serverTimestamp(),
  });
  for (const doc of pixPendingSnap.docs) {
    batch.delete(doc.ref);
  }
  let cancelledInvites = 0;
  for (const doc of invitesSnap.docs) {
    const matches = inviteMatchesCancelledRegistration(doc.data(), {
      registrationId,
      cancellerUid: uid,
      categoryId,
    });
    if (!matches) continue;
    batch.update(doc.ref, {
      status: "cancelled",
      cancelReason: "registration_cancelled",
      updatedAt: FieldValue.serverTimestamp(),
    });
    cancelledInvites++;
  }
  if (deleteTeam) {
    batch.delete(db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`));
  }
  batch.delete(regRef);
  await batch.commit();

  // Avisa os demais atletas depois que o cancelamento é fato.
  const otherUids = athleteUids.filter((id) => id !== uid);
  if (otherUids.length > 0) {
    const teamName = String(registration.teamName ?? "").trim();
    const cancelBody = isTeamRegistration
      ? `O capitão desfez a equipe${teamName ? ` ${teamName}` : ""}. ` +
        "A inscrição foi removida."
      : "Seu parceiro cancelou a reserva da vaga. A inscrição foi removida.";
    await Promise.all(
      otherUids.map((otherUid) =>
        deliverNotificationToUser({
          userId: otherUid,
          title: "Inscrição cancelada",
          body: cancelBody,
          type: "tournament_registration_cancelled",
          data: {tournamentId, url: `/torneios/${tournamentId}`},
        }).catch(() => undefined),
      ),
    );
  }

  logger.info("Tournament registration cancelled by athlete", {
    registrationId,
    tournamentId,
    categoryId,
    uid,
    cancelledInvites,
    deletedTeam: deleteTeam,
    cancelledPixCharges: pixPendingSnap.size,
  });

  return {ok: true, registrationId};
});

/** Avisa quem opera o torneio que uma inscrição fechou o elenco (dupla completa ou equipe no
 *  tamanho da categoria). Pagamento é aviso à parte — este é só sobre a vaga estar ocupada. */
async function notifyOrganizersRegistrationCompleted({
  db,
  registrationId,
  tournamentId,
  categoryId,
  categoryName,
  teamName,
}: {
  db: Firestore;
  registrationId: string;
  tournamentId: string;
  categoryId: string;
  categoryName: string;
  teamName: string | null;
}): Promise<void> {
  const recipients = await tournamentManagerUids(db, tournamentId);
  if (recipients.length === 0) {
    logger.info(`Nenhum recipient (managerId/staff) pra notificar inscrição em ${tournamentId}`);
    return;
  }
  logger.info(`Notificando inscrição completa: tournamentId=${tournamentId} recipients=${recipients.join(",")}`);

  const who = teamName?.trim() || "Uma dupla";
  const where = categoryName ? ` em ${categoryName}` : "";

  await Promise.all(
    recipients.map((recipientUid) =>
      deliverNotificationToUser({
        userId: recipientUid,
        title: "Nova inscrição",
        body: `${who} se inscreveu${where}.`,
        type: "tournament_registration_created",
        data: {
          tournamentId,
          registrationId,
          categoryId,
          url: `/painel/eventos/${tournamentId}/inscricoes?registrationId=${registrationId}`,
        },
      }).catch(() => undefined),
    ),
  );
}

export const acceptTournamentPartnerInvite = onCall({
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT, ...asaasArenaSecrets],
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const inviteId = (request.data?.inviteId as string | undefined)?.trim() ?? "";
  if (!inviteId) {
    throw new HttpsError("invalid-argument", "inviteId é obrigatório.");
  }

  const projectId = getFirebaseProjectId();
  const db = getFirestore();

  await assertCanRegisterInTournament(db, uid);

  const inviteRef = db.collection(INVITES_COLLECTION).doc(inviteId);

  const inviteeLgpdAccepted = request.data?.lgpdAccepted === true;
  const inviteeUniform = parseUniformPayload(request.data?.inviteeUniform);

  const invitePreview = await inviteRef.get();
  if (!invitePreview.exists) {
    throw new HttpsError("not-found", "Convite não encontrado.");
  }
  const invitePreviewData = invitePreview.data()!;
  // Expiração é decidida FORA da transação: marcar `expired` lá dentro e em
  // seguida lançar descarta a escrita junto com a transação abortada, e o
  // convite ficava "pending" para sempre. Só toca em convite ainda pendente —
  // aceito/recusado/cancelado continua respondendo pelo status próprio.
  if (invitePreviewData.status === "pending") {
    const previewExpiresAt = invitePreviewData.expiresAt as Timestamp | undefined;
    if (
      previewExpiresAt &&
      typeof previewExpiresAt.toMillis === "function" &&
      previewExpiresAt.toMillis() < Date.now()
    ) {
      await inviteRef.update({status: "expired"});
      throw new HttpsError("failed-precondition", "Este convite expirou.");
    }
  }

  // Convite de SUBSTITUIÇÃO: fluxo próprio (gate de chaves, elegibilidade
  // pós-troca, herança de pagamento) — e sem `assertTournamentAcceptsRegistration`,
  // porque a troca vale com as inscrições encerradas. Import dinâmico para não
  // fechar ciclo de módulos (tournament-substitution importa helpers daqui).
  if (invitePreviewData.isSubstitutionInvite === true) {
    const {acceptSubstitutionInviteFor} = await import("./tournament-substitution.js");
    return await acceptSubstitutionInviteFor({
      db,
      projectId,
      uid,
      inviteId,
      inviteeLgpdAccepted,
      inviteeUniformRaw: request.data?.inviteeUniform,
    });
  }

  const previewTournamentId = invitePreviewData.tournamentId as string;
  const previewCategoryId = invitePreviewData.categoryId as string;
  const previewTournament = await loadTournamentDataForInvite(
    db,
    projectId,
    previewTournamentId,
  );
  if (!previewTournament) {
    throw new HttpsError("not-found", "Torneio não encontrado.");
  }
  const previewCategoryKeys = resolveCategoryMatchKeys(
    previewTournament,
    previewCategoryId,
  );
  const tournamentData = await assertTournamentAcceptsRegistration(
    db,
    projectId,
    previewTournamentId,
    previewCategoryId,
  );
  const shouldWaitlist =
    (tournamentData as Record<string, unknown>).__shouldWaitlist === true;
  const previewCategory = asTournamentCategory(
    findCategory(previewTournament, previewCategoryId),
  );
  if (!previewCategory) {
    throw new HttpsError("not-found", "Categoria não encontrada.");
  }
  // Conclusão da dupla: valida nível dos dois jogadores (convidador + convidado).
  await assertTeamLevelEligibility({
    db,
    tournament: previewTournament,
    category: previewCategory,
    uids: [invitePreviewData.inviterUid as string | undefined, uid],
  });
  await assertTeamAgeEligibility({
    db,
    tournament: previewTournament,
    category: previewCategory,
    uids: [invitePreviewData.inviterUid as string | undefined, uid],
  });
  // Dupla de gênero fixo fecha aqui: os DOIS precisam ter gênero declarado e
  // compatível (requireDeclared). Equipe valida composição na transação.
  if (!isTeamCategory(previewCategory)) {
    await assertTeamGenderEligibility({
      db,
      category: previewCategory,
      uids: [invitePreviewData.inviterUid as string | undefined, uid],
      requireDeclared: true,
    });
    // Dupla mista fecha aqui: os dois precisam ter gênero declarado e ser de
    // gêneros diferentes.
    await assertMixedDuoGenderEligibility({
      db,
      category: previewCategory,
      uids: [invitePreviewData.inviterUid as string | undefined, uid],
      requireDeclared: true,
    });
  }
  // Uniforme do convidado é opcional (informado depois); valida só se enviado.
  validateUniformPayload(
    previewCategory,
    inviteeUniform,
    inviteeUniform != null && categoryRequiresUniform(previewCategory),
  );

  const result = await db.runTransaction(async (tx) => {
    const inviteSnap = await tx.get(inviteRef);
    if (!inviteSnap.exists) {
      throw new HttpsError("not-found", "Convite não encontrado.");
    }
    const invite = inviteSnap.data()!;

    if (invite.inviteeUid !== uid) {
      throw new HttpsError("permission-denied", "Este convite não é para você.");
    }
    if (invite.status !== "pending") {
      throw new HttpsError("failed-precondition", "Este convite não está mais pendente.");
    }

    // Segunda linha de defesa (o convite pode expirar entre o preview e aqui).
    // Sem escrita: a transação aborta e descartaria qualquer `tx.update`.
    const expiresAt = invite.expiresAt as Timestamp | undefined;
    if (expiresAt && expiresAt.toMillis() < Date.now()) {
      throw new HttpsError("failed-precondition", "Este convite expirou.");
    }

    const tournamentId = invite.tournamentId as string;
    const categoryId = invite.categoryId as string;
    const inviterUid = invite.inviterUid as string;

    const teamsRef = db.collection(artifactsTeamsPath(projectId));
    const inscriptionsRef = db.collection(artifactsInscriptionsPath(projectId));
    const teamsPath = artifactsTeamsPath(projectId);

    // Convite de EQUIPE (trio+): entra na inscrição do capitão. Sem fusão de
    // reservas — o elenco cresce até o teamSize e só então sai de
    // partnerPending (o que o coloca na chave).
    if (invite.isTeamInvite === true) {
      const attachRegistrationId = String(
        invite.attachRegistrationId ?? "",
      ).trim();
      if (!attachRegistrationId) {
        throw new HttpsError("failed-precondition", "Convite inválido.");
      }
      const regRef = inscriptionsRef.doc(attachRegistrationId);
      const regSnap = await tx.get(regRef);
      if (!regSnap.exists) {
        throw new HttpsError(
          "failed-precondition",
          "A inscrição da equipe não existe mais.",
        );
      }
      const reg = regSnap.data()!;
      const teamSize = registrationTeamSize(reg, previewCategory);
      const teamId = String(reg.teamId ?? "").trim();
      const teamRef = teamId ? teamsRef.doc(teamId) : null;
      const teamSnap = teamRef ? await tx.get(teamRef) : null;
      if (!teamRef || !teamSnap?.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Equipe da inscrição não encontrada.",
        );
      }
      const team = teamSnap.data()!;
      const members = extractTeamMemberUids(team);
      if (members.includes(uid)) {
        throw new HttpsError(
          "failed-precondition",
          "Você já está nesta equipe.",
        );
      }
      if (isTeamRosterComplete(members.length, teamSize)) {
        throw new HttpsError(
          "failed-precondition",
          "A equipe já está completa.",
        );
      }

      const categoryRegs = await loadCategoryRegistrationsTx(
        tx,
        inscriptionsRef,
        teamsPath,
        tournamentId,
        previewCategoryKeys,
      );
      const alreadyInCategory = categoryRegs.some(
        (r) =>
          r.registrationId !== attachRegistrationId &&
          r.participantUids.includes(uid),
      );
      if (alreadyInCategory) {
        throw new HttpsError(
          "failed-precondition",
          "Você já possui inscrição nesta categoria.",
        );
      }

      // Composição de gênero revalidada contra o elenco ATUAL (a situação pode
      // ter mudado nas 48h do convite).
      const composition = parseGenderComposition(previewCategory, teamSize);
      if (composition) {
        const memberBuckets: Array<AthleteGenderBucket | null> = [];
        for (const memberUid of members) {
          const userSnap = await tx.get(db.doc(`users/${memberUid}`));
          const gender = userSnap.exists ? userSnap.data()?.gender : undefined;
          memberBuckets.push(
            normalizeAthleteGenderBucket(
              typeof gender === "string" ? gender : undefined,
            ),
          );
        }
        const mySnap = await tx.get(db.doc(`users/${uid}`));
        const myGender = mySnap.exists ? mySnap.data()?.gender : undefined;
        const joinCheck = evaluateTeamJoin({
          teamSize,
          composition,
          currentBuckets: memberBuckets,
          joiningBucket: normalizeAthleteGenderBucket(
            typeof myGender === "string" ? myGender : undefined,
          ),
        });
        if (!joinCheck.ok) {
          throw new HttpsError(
            "failed-precondition",
            teamJoinDenialMessage(joinCheck.reason, "self"),
          );
        }
      }

      const newMemberCount = members.length + 1;
      const rosterComplete = isTeamRosterComplete(newMemberCount, teamSize);

      const teamUpdate: Record<string, unknown> = {
        memberUids: FieldValue.arrayUnion(uid),
        updatedAt: FieldValue.serverTimestamp(),
      };
      // Espelho legado: os 2 primeiros membros continuam em player1/player2
      // para leitores antigos (pôster, ranking, joins do organizador).
      const legacyP2 =
        typeof team.player2Id === "string" ? team.player2Id.trim() : "";
      if (!legacyP2) teamUpdate.player2Id = uid;
      tx.update(teamRef, teamUpdate);

      const regUpdate: Record<string, unknown> = {
        participantUids: FieldValue.arrayUnion(uid),
        partnerPending: !rosterComplete,
        updatedAt: FieldValue.serverTimestamp(),
      };
      // Inscrição já paga por inteiro: quem entra não deve nada.
      if (reg.isPaid === true) {
        regUpdate.sharePaidUids = FieldValue.arrayUnion(uid);
      }
      if (inviteeUniform) {
        regUpdate[`uniformByUid.${uid}`] = uniformByUidEntry(inviteeUniform);
      }
      if (inviteeLgpdAccepted) {
        regUpdate.lgpdAcceptedUids = FieldValue.arrayUnion(uid);
        regUpdate[`lgpdAcceptedAt.${uid}`] = FieldValue.serverTimestamp();
        regUpdate.lgpdTermVersion = LGPD_TERM_VERSION;
      }
      tx.update(regRef, regUpdate);

      tx.update(inviteRef, {
        status: "accepted",
        teamId,
        registrationId: attachRegistrationId,
        acceptedAt: FieldValue.serverTimestamp(),
      });

      return {
        registrationId: attachRegistrationId,
        teamId,
        tournamentId,
        categoryId,
        isTeamInvite: true,
        rosterComplete,
        memberCount: newMemberCount,
        teamSize,
        teamName: String(reg.teamName ?? team.teamName ?? "").trim(),
      };
    }

    // O plano é reavaliado aqui (não no convite): nas 48h de validade os dois
    // podem ter reservado solo, cancelado ou fechado dupla com outra pessoa.
    const categoryRegs = await loadCategoryRegistrationsTx(
      tx,
      inscriptionsRef,
      teamsPath,
      tournamentId,
      previewCategoryKeys,
    );
    const plan = resolvePartnerRegistrationPlan(categoryRegs, inviterUid, uid);
    if (plan.kind === "blocked") {
      throw new HttpsError(
        "failed-precondition",
        registrationConflictMessage(plan.reason),
      );
    }

    // Modo anexar: a dupla ocupa uma reserva solo que já existe — do convidante
    // ou do convidado. A reserva do outro (quando os dois reservaram) é liberada.
    if (plan.kind === "attach") {
      const baseRegRef = inscriptionsRef.doc(plan.registrationId);
      // Todas as leituras antes de qualquer escrita (exigência da transaction).
      const baseRegSnap = await tx.get(baseRegRef);
      if (!baseRegSnap.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Inscrição solo não encontrada.",
        );
      }
      const baseReg = baseRegSnap.data()!;
      if (baseReg.partnerPending !== true) {
        throw new HttpsError(
          "failed-precondition",
          "Esta inscrição já tem parceiro.",
        );
      }

      // Quem já ocupa a reserva e quem está entrando nela.
      const baseOwnerUid =
        (baseReg.player1Id as string | undefined)?.trim() || inviterUid;
      const joiningUid = baseOwnerUid === uid ? inviterUid : uid;

      const releaseRegRef = plan.releaseRegistrationId
        ? inscriptionsRef.doc(plan.releaseRegistrationId)
        : null;
      const releaseRegSnap = releaseRegRef ? await tx.get(releaseRegRef) : null;

      const baseTeamId = (baseReg.teamId as string | undefined)?.trim() ?? "";
      const existingTeamSnap = baseTeamId
        ? await tx.get(teamsRef.doc(baseTeamId))
        : null;
      if (baseTeamId && !existingTeamSnap?.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Equipe da inscrição não encontrada.",
        );
      }

      const attachUpdate: Record<string, unknown> = {
        participantUids: FieldValue.arrayUnion(joiningUid),
        partnerPending: false,
        updatedAt: FieldValue.serverTimestamp(),
      };
      // Reserva já paga (pagou o total) → o parceiro entra sem taxa.
      if (baseReg.isPaid === true) {
        attachUpdate.sharePaidUids = FieldValue.arrayUnion(joiningUid);
      }

      // Uniforme: quem entra ocupa o slot do player2; o dono da reserva mantém
      // o player1 (e atualiza se acabou de informar um).
      const joiningUniform =
        joiningUid === uid ? inviteeUniform : inviterUniformFromInvite(invite);
      if (joiningUniform) {
        Object.assign(
          attachUpdate,
          registrationUniformForSlot(joiningUniform, "Player2"),
        );
      }
      if (joiningUid !== uid && inviteeUniform) {
        Object.assign(
          attachUpdate,
          registrationUniformForSlot(inviteeUniform, "Player1"),
        );
      }

      // Aceite LGPD dos dois: o do convidado vem desta chamada, o do convidante
      // ficou guardado no convite. Preserva o que a reserva já registrava.
      const existingLgpdUids = Array.isArray(baseReg.lgpdAcceptedUids)
        ? (baseReg.lgpdAcceptedUids as unknown[])
        : [];
      const lgpdUnion: string[] = [];
      if (inviteeLgpdAccepted && !existingLgpdUids.includes(uid)) {
        lgpdUnion.push(uid);
        attachUpdate[`lgpdAcceptedAt.${uid}`] = FieldValue.serverTimestamp();
      }
      if (
        invite.inviterLgpdAccepted === true &&
        inviterUid &&
        !existingLgpdUids.includes(inviterUid)
      ) {
        lgpdUnion.push(inviterUid);
        attachUpdate[`lgpdAcceptedAt.${inviterUid}`] =
          invite.inviterLgpdAcceptedAt ?? FieldValue.serverTimestamp();
      }
      // A reserva liberada some, mas o aceite que ela registrava não pode sumir.
      const releasedLgpdUids = Array.isArray(releaseRegSnap?.data()?.lgpdAcceptedUids)
        ? (releaseRegSnap!.data()!.lgpdAcceptedUids as unknown[])
        : [];
      for (const raw of releasedLgpdUids) {
        const carried = String(raw).trim();
        if (!carried) continue;
        if (existingLgpdUids.includes(carried)) continue;
        if (lgpdUnion.includes(carried)) continue;
        lgpdUnion.push(carried);
        const releasedAt = (
          releaseRegSnap?.data()?.lgpdAcceptedAt as Record<string, unknown> | undefined
        )?.[carried];
        attachUpdate[`lgpdAcceptedAt.${carried}`] =
          releasedAt ?? FieldValue.serverTimestamp();
      }
      if (lgpdUnion.length > 0) {
        attachUpdate.lgpdAcceptedUids = FieldValue.arrayUnion(...lgpdUnion);
        attachUpdate.lgpdTermVersion = LGPD_TERM_VERSION;
      }

      let teamId = baseTeamId;
      if (baseTeamId) {
        // Solo legado: já existe equipe de 1 atleta → preenche o player2.
        tx.update(teamsRef.doc(baseTeamId), {player2Id: joiningUid});
      } else {
        // Solo novo: CRIA a equipe agora (player1 + player2) — "criar equipe".
        const teamRef = teamsRef.doc();
        tx.set(teamRef, {
          player1Id: baseOwnerUid,
          player2Id: joiningUid,
          createdAt: FieldValue.serverTimestamp(),
        });
        teamId = teamRef.id;
        attachUpdate.teamId = teamId;
      }

      // Libera a reserva solo do outro atleta: a dupla ocupa uma vaga só.
      if (releaseRegRef && releaseRegSnap?.exists) {
        tx.delete(releaseRegRef);
      }

      tx.update(baseRegRef, attachUpdate);
      tx.update(inviteRef, {
        status: "accepted",
        teamId,
        registrationId: plan.registrationId,
        acceptedAt: FieldValue.serverTimestamp(),
      });
      return {
        registrationId: plan.registrationId,
        teamId,
        tournamentId,
        categoryId,
        releasedRegistrationId: plan.releaseRegistrationId,
      };
    }

    const teamRef = teamsRef.doc();
    const regRef = inscriptionsRef.doc();

    tx.set(teamRef, {
      player1Id: inviterUid,
      player2Id: uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    const registrationData: Record<string, unknown> = {
      teamId: teamRef.id,
      tournamentId,
      categoryId,
      participantUids: [inviterUid, uid],
      isPaid: false,
      paidAmount: 0,
      createdAt: FieldValue.serverTimestamp(),
      ...(shouldWaitlist ? {waitlist: true} : {}),
      ...registrationUniformFromInvite(invite),
    };
    if (inviteeUniform) {
      Object.assign(
        registrationData,
        registrationUniformPlayer2(inviteeUniform),
      );
    }

    // Aceites LGPD: convidante (capturado no envio do convite) + convidado.
    const lgpdUids: string[] = [];
    const lgpdAt: Record<string, unknown> = {};
    if (invite.inviterLgpdAccepted === true) {
      lgpdUids.push(inviterUid);
      lgpdAt[inviterUid] =
        invite.inviterLgpdAcceptedAt ?? FieldValue.serverTimestamp();
    }
    if (inviteeLgpdAccepted) {
      lgpdUids.push(uid);
      lgpdAt[uid] = FieldValue.serverTimestamp();
    }
    if (lgpdUids.length > 0) {
      registrationData.lgpdAcceptedUids = lgpdUids;
      registrationData.lgpdAcceptedAt = lgpdAt;
      registrationData.lgpdTermVersion = LGPD_TERM_VERSION;
    }
    tx.set(regRef, registrationData);

    tx.update(inviteRef, {
      status: "accepted",
      teamId: teamRef.id,
      registrationId: regRef.id,
      acceptedAt: FieldValue.serverTimestamp(),
    });

    return {
      registrationId: regRef.id,
      teamId: teamRef.id,
      tournamentId,
      categoryId,
    };
  });

  const teamResult = result as typeof result & {
    isTeamInvite?: boolean;
    rosterComplete?: boolean;
    memberCount?: number;
    teamSize?: number;
    teamName?: string;
  };

  if (teamResult.isTeamInvite === true) {
    if (teamResult.rosterComplete === true) {
      await markStaleTeamInvitesAfterRosterFull(
        db,
        result.tournamentId,
        result.registrationId,
        inviteId,
      );
    }
  } else {
    await markStaleInvitesAfterAccept(
      db,
      result.tournamentId,
      result.categoryId,
      (invitePreviewData.inviterUid as string | undefined)?.trim() ?? "",
      uid,
      inviteId,
    );
  }

  logger.info("Tournament partner invite accepted", {inviteId, ...result});

  const inviteAfter = (await inviteRef.get()).data();
  const inviterUid = (inviteAfter?.inviterUid as string | undefined)?.trim() ?? "";
  const inviteeName =
    (inviteAfter?.inviteeName as string | undefined)?.trim() || "Seu parceiro";
  const tournamentId = result.tournamentId;
  const categoryId = result.categoryId;
  const registrationId = result.registrationId;

  if (teamResult.isTeamInvite === true) {
    // Avisa o elenco (capitão incluído) sobre o novo integrante — com
    // deep-link para o pagamento quando a equipe fecha.
    const teamName = teamResult.teamName?.trim() || "sua equipe";
    const rosterComplete = teamResult.rosterComplete === true;
    const progress =
      teamResult.memberCount && teamResult.teamSize
        ? ` (${teamResult.memberCount}/${teamResult.teamSize})`
        : "";
    const url =
      `/torneios/${tournamentId}/inscricao` +
      `?registrationId=${encodeURIComponent(registrationId)}` +
      `&categoryId=${encodeURIComponent(categoryId)}` +
      (rosterComplete ? "&step=payment" : "&step=partner");
    try {
      const memberUids = await loadTeamMemberUids(db, projectId, result.teamId);
      const recipients = memberUids.filter((memberUid) => memberUid !== uid);
      await Promise.all(
        recipients.map((memberUid) =>
          deliverNotificationToUser({
            userId: memberUid,
            title: rosterComplete ? "Equipe completa!" : "Novo integrante",
            body: rosterComplete
              ? `${inviteeName} entrou na equipe ${teamName}. ` +
                "Conclua o pagamento da inscrição."
              : `${inviteeName} entrou na equipe ${teamName}${progress}.`,
            type: "tournament_partner_invite_accepted",
            data: {
              inviteId,
              tournamentId,
              categoryId,
              registrationId,
              url,
            },
          }).catch(() => undefined),
        ),
      );
    } catch (notifyError) {
      logger.warn("Falha ao notificar equipe do torneio", {
        inviteId,
        notifyError,
      });
    }
  } else if (inviterUid) {
    const paymentPath =
      `/torneios/${tournamentId}/inscricao` +
      `?registrationId=${encodeURIComponent(registrationId)}` +
      `&categoryId=${encodeURIComponent(categoryId)}` +
      `&inviteId=${encodeURIComponent(inviteId)}` +
      "&step=payment";
    try {
      await deliverNotificationToUser({
        userId: inviterUid,
        title: "Parceiro confirmou!",
        body: `${inviteeName} aceitou! Conclua o pagamento da inscrição.`,
        type: "tournament_partner_invite_accepted",
        data: {
          inviteId,
          tournamentId,
          categoryId,
          registrationId,
          url: paymentPath,
        },
      });
    } catch (notifyError) {
      logger.warn("Falha ao notificar convidador do torneio", {
        inviteId,
        inviterUid,
        notifyError,
      });
    }
  }

  // Dupla fecha ao aceitar (sempre 2/2); equipe só quando o elenco chega ao teamSize.
  const rosterNowComplete =
    teamResult.isTeamInvite === true ? teamResult.rosterComplete === true : true;
  if (rosterNowComplete) {
    try {
      await notifyOrganizersRegistrationCompleted({
        db,
        registrationId,
        tournamentId,
        categoryId,
        categoryName: previewCategory.categoryName,
        teamName: teamResult.isTeamInvite === true ? (teamResult.teamName ?? null) : null,
      });
    } catch (notifyError) {
      logger.warn("Falha ao notificar organizador da inscrição completa", {
        inviteId,
        notifyError,
      });
    }
  }

  try {
    await markTournamentPartnerInviteInboxResponse(uid, inviteId, "accepted", {
      tournamentId,
      categoryId,
      registrationId,
    });
  } catch (inboxError) {
    logger.warn("Falha ao atualizar inbox do convite aceito", {
      inviteId,
      uid,
      inboxError,
    });
  }

  return result;
});

export const cancelTournamentPartnerInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const inviteId = (request.data?.inviteId as string | undefined)?.trim() ?? "";
  const asDecline = request.data?.asDecline === true;

  if (!inviteId) {
    throw new HttpsError("invalid-argument", "inviteId é obrigatório.");
  }

  const db = getFirestore();
  const inviteRef = db.collection(INVITES_COLLECTION).doc(inviteId);
  const inviteSnap = await inviteRef.get();

  if (!inviteSnap.exists) {
    throw new HttpsError("not-found", "Convite não encontrado.");
  }

  const invite = inviteSnap.data()!;
  if (invite.status !== "pending") {
    throw new HttpsError("failed-precondition", "Este convite não está mais pendente.");
  }

  const isInviter = invite.inviterUid === uid;
  const isInvitee = invite.inviteeUid === uid;

  if (asDecline) {
    if (!isInvitee) {
      throw new HttpsError("permission-denied", "Apenas o convidado pode recusar.");
    }
    await inviteRef.update({status: "declined"});
    // Substituição: quem iniciou está esperando resolver um problema da equipe
    // — a recusa precisa chegar ativamente, não só sumir da lista.
    if (invite.isSubstitutionInvite === true) {
      const inviterUid = (invite.inviterUid as string | undefined)?.trim() ?? "";
      if (inviterUid) {
        try {
          await deliverNotificationToUser({
            userId: inviterUid,
            title: "Convite de substituição recusado",
            body:
              `${String(invite.inviteeName ?? "O atleta").trim() || "O atleta"} recusou entrar ` +
              `no lugar de ${String(invite.replacedName ?? "seu atleta").trim() || "seu atleta"}.`,
            type: "tournament_substitution_declined",
            data: {inviteId, tournamentId: String(invite.tournamentId ?? "").trim()},
          });
        } catch (notifyError) {
          logger.warn("Falha ao notificar recusa de substituição", {inviteId, notifyError});
        }
      }
    }
    try {
      await markTournamentPartnerInviteInboxResponse(uid, inviteId, "declined");
    } catch (inboxError) {
      logger.warn("Falha ao atualizar inbox do convite recusado", {
        inviteId,
        uid,
        inboxError,
      });
    }
    return {success: true, status: "declined"};
  }

  if (!isInviter && !isInvitee) {
    throw new HttpsError("permission-denied", "Você não pode cancelar este convite.");
  }

  await inviteRef.update({status: "cancelled"});
  return {success: true, status: "cancelled"};
});

/**
 * Define/atualiza o uniforme do atleta na sua inscrição APÓS a inscrição
 * (modelo "informar uniforme depois"). O caller só altera o próprio slot
 * (player1/player2, ou `uniformByUid` em equipe). Vale também na RESERVA SOLO,
 * antes de a dupla existir. Valida o tamanho contra a categoria.
 */
export const setRegistrationUniform = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const registrationId =
    (request.data?.registrationId as string | undefined)?.trim() ?? "";
  if (!registrationId) {
    throw new HttpsError("invalid-argument", "registrationId é obrigatório.");
  }

  const uniform = parseUniformPayload(request.data?.uniform);
  if (!uniform) {
    throw new HttpsError("invalid-argument", "Informe o uniforme.");
  }

  const projectId = getFirebaseProjectId();
  const db = getFirestore();

  const regRef = db
    .collection(artifactsInscriptionsPath(projectId))
    .doc(registrationId);
  const regSnap = await regRef.get();
  if (!regSnap.exists) {
    throw new HttpsError("not-found", "Inscrição não encontrada.");
  }
  const registration = regSnap.data()!;

  // Reserva solo NÃO tem doc em `teams` (a equipe nasce quando o parceiro
  // aceita o convite), então a autorização não pode sair do doc da equipe —
  // quem decide é `resolveUniformSlot`, que cai pra própria inscrição nesse
  // caso. Sem isso, informar o uniforme antes de fechar a dupla é impossível.
  const teamId = (registration.teamId as string | undefined)?.trim() ?? "";
  const team = teamId
    ? (await db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`).get()).data() ??
      {}
    : null;
  const slot = resolveUniformSlot(registration, team, uid);
  if (!slot) {
    throw new HttpsError(
      "permission-denied",
      "Você não é um dos atletas desta inscrição.",
    );
  }

  const tournamentId = (registration.tournamentId as string | undefined)?.trim() ?? "";
  const categoryId = (registration.categoryId as string | undefined)?.trim() ?? "";
  const tournament = await loadTournamentDataForInvite(db, projectId, tournamentId);
  if (!tournament) {
    throw new HttpsError("not-found", "Torneio não encontrado.");
  }
  const category = asTournamentCategory(findCategory(tournament, categoryId));
  if (!category) {
    throw new HttpsError("not-found", "Categoria não encontrada.");
  }

  // Valida o tamanho contra a categoria (se ela exige uniforme).
  validateUniformPayload(category, uniform, categoryRequiresUniform(category));

  // Equipe (trio+): uniforme por atleta no mapa `uniformByUid`; dupla mantém
  // os slots legados Player1/Player2.
  const update =
    slot === "byUid"
      ? {[`uniformByUid.${uid}`]: uniformByUidEntry(uniform)}
      : slot === "player1"
        ? registrationUniformPlayer1(uniform)
        : registrationUniformPlayer2(uniform);

  await regRef.update({
    ...update,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {ok: true};
});
