import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {assertCanRegisterInTournament} from "./athlete-tournament-access";
import {assertTeamLevelEligibility} from "./category-level-eligibility";
import {assertTeamAgeEligibility} from "./category-age-eligibility";
import {deliverNotificationToUser, markTournamentPartnerInviteInboxResponse} from "./notification-delivery";
import {
  assertTournamentAcceptsRegistration,
  findCategory,
  loadTournamentData,
  resolveCategoryMatchKeys,
} from "./tournament-registration-guards";
import {
  resolveInviteRegistrationAction,
  type InviterCategoryRegistration,
} from "./tournament-solo-registration";
import {
  assertNoPairConflictTx,
  pairAlreadyRegistered,
  parseCategoryRegistration,
  type ParsedCategoryRegistration,
} from "./tournament-pair-uniqueness";
import {formatCategoryInviteNotificationLabel} from "./category-display-labels";
import {artifactsInscriptionsPath, artifactsTeamsPath, getFirebaseProjectId} from "./firebase-paths";
import {registrationAthleteUids} from "./tournament-registration-pix-helpers";

const INVITES_COLLECTION = "tournamentRegistrationInvites";
const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

// Versão do termo LGPD/uso de imagem exibido nas UIs de inscrição. O aceite é
// opcional no payload (apps antigos não enviam); quando presente, fica
// registrado na inscrição para o organizador consultar.
const LGPD_TERM_VERSION = "2026-08";




type UniformType = "none" | "top_only" | "full";

type TournamentCategory = {
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

type UniformPayload = {
  sizeTop?: string;
  sizeShorts?: string;
  jerseyNumber?: number;
  jerseyName?: string;
};

const DEFAULT_TOP_SIZES = ["PP", "P", "M", "G", "GG", "XGG"];
const DEFAULT_SHORTS_SIZES = ["PP", "P", "M", "G", "GG", "XGG"];

function asTournamentCategory(
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

function categoryRequiresUniform(category: TournamentCategory): boolean {
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

function parseUniformPayload(raw: unknown): UniformPayload | null {
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

function validateUniformPayload(
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

function registrationUniformFromInvite(
  invite: Record<string, unknown>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const sizeTop = invite.inviterSizeTop;
  const sizeShorts = invite.inviterSizeShorts;
  const jerseyNumber = invite.inviterJerseyNumber;
  const jerseyName = invite.inviterJerseyName;
  if (typeof sizeTop === "string" && sizeTop.trim()) {
    out.sizeTopPlayer1 = sizeTop.trim();
  }
  if (typeof sizeShorts === "string" && sizeShorts.trim()) {
    out.sizeShortsPlayer1 = sizeShorts.trim();
  }
  if (typeof jerseyNumber === "number") {
    out.jerseyNumberPlayer1 = jerseyNumber;
  }
  if (typeof jerseyName === "string" && jerseyName.trim()) {
    out.jerseyNamePlayer1 = jerseyName.trim();
  }
  return out;
}

function registrationUniformPlayer2(
  uniform: UniformPayload,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (uniform.sizeTop) out.sizeTopPlayer2 = uniform.sizeTop;
  if (uniform.sizeShorts) out.sizeShortsPlayer2 = uniform.sizeShorts;
  if (uniform.jerseyNumber != null) {
    out.jerseyNumberPlayer2 = uniform.jerseyNumber;
  }
  if (uniform.jerseyName) out.jerseyNamePlayer2 = uniform.jerseyName;
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
  const out: Record<string, string | number> = {};
  if (uniform.sizeTop) out.sizeTopPlayer1 = uniform.sizeTop;
  if (uniform.sizeShorts) out.sizeShortsPlayer1 = uniform.sizeShorts;
  if (uniform.jerseyNumber != null) {
    out.jerseyNumberPlayer1 = uniform.jerseyNumber;
  }
  if (uniform.jerseyName) out.jerseyNamePlayer1 = uniform.jerseyName;
  return out;
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

export const sendTournamentPartnerInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const tournamentId = (request.data?.tournamentId as string | undefined)?.trim() ?? "";
  const categoryId = (request.data?.categoryId as string | undefined)?.trim() ?? "";
  const inviteeUid = (request.data?.inviteeUid as string | undefined)?.trim() ?? "";
  const inviteeName = (request.data?.inviteeName as string | undefined)?.trim() ?? "Atleta";
  const inviterName = (request.data?.inviterName as string | undefined)?.trim() ?? "Atleta";

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

  const categoryKeys = resolveCategoryMatchKeys(tournament, categoryId);

  const uniformRequired = categoryRequiresUniform(category);
  const inviterLgpdAccepted = request.data?.lgpdAccepted === true;
  const inviterUniform = parseUniformPayload(request.data?.inviterUniform);
  // Uniforme é opcional na inscrição (coletado depois); valida só se enviado.
  validateUniformPayload(
    category,
    inviterUniform,
    inviterUniform != null && uniformRequired,
  );

  // Solo: se o convidador já tem uma inscrição solo (parceiro pendente) onde é
  // player1, o convite ANEXA o convidado a ela; dupla completa bloqueia.
  const inviterRegs = await loadAthleteCategoryRegistrations(
    db,
    projectId,
    uid,
    tournamentId,
    categoryKeys,
  );
  const regAction = resolveInviteRegistrationAction(inviterRegs);
  if (regAction.kind === "blocked") {
    throw new HttpsError(
      "failed-precondition",
      "Você já possui inscrição nesta categoria."
    );
  }
  if (await userHasCategoryRegistration(db, projectId, inviteeUid, tournamentId, categoryKeys)) {
    throw new HttpsError(
      "failed-precondition",
      "Este parceiro já está inscrito nesta categoria."
    );
  }

  const categoryRegs = await loadCategoryRegistrationsForPairCheck(
    db,
    projectId,
    tournamentId,
    categoryKeys,
  );
  if (pairAlreadyRegistered(categoryRegs, uid, inviteeUid)) {
    throw new HttpsError(
      "failed-precondition",
      "Já existe uma dupla com vocês dois nesta categoria.",
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
    // Modo anexar: convite preenche a inscrição solo existente do convidador.
    // attachTeamId só existe em solo legado (com equipe); no solo novo a equipe
    // é criada no aceite.
    ...(regAction.kind === "attach"
      ? {
          attachRegistrationId: regAction.registrationId,
          ...(regAction.teamId ? {attachTeamId: regAction.teamId} : {}),
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

  return {inviteId: ref.id};
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
  await regRef.set(regData);

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
 * Cancela a reserva/inscrição do próprio atleta — somente enquanto não paga
 * (`isPaid !== true`). Cobre solo (sem `teams` doc, identificado por
 * `player1Id`/`participantUids` na própria inscrição) e dupla já formada
 * (via `teams.player1Id`/`player2Id`).
 */
export const cancelTournamentRegistration = onCall(async (request) => {
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

  if (registration.isPaid === true) {
    throw new HttpsError(
      "failed-precondition",
      "Inscrição já confirmada não pode ser cancelada por aqui. Fale com o organizador.",
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

  const tournamentId =
    (registration.tournamentId as string | undefined)?.trim() ?? "";
  const categoryId = (registration.categoryId as string | undefined)?.trim() ?? "";

  // Convites pendentes ligados a esta inscrição (solo aguardando parceiro)
  // não devem sobreviver à reserva cancelada.
  const invitesSnap = await db
    .collection(INVITES_COLLECTION)
    .where("tournamentId", "==", tournamentId)
    .where("status", "==", "pending")
    .get();
  const batch = db.batch();
  let cancelledInvites = 0;
  for (const doc of invitesSnap.docs) {
    const data = doc.data();
    const attachId = (data.attachRegistrationId as string | undefined)?.trim() ?? "";
    const inviter = (data.inviterUid as string | undefined)?.trim() ?? "";
    const matchesThisRegistration =
      attachId === registrationId ||
      (attachId === "" && inviter === uid && data.categoryId === categoryId);
    if (!matchesThisRegistration) continue;
    batch.update(doc.ref, {
      status: "cancelled",
      cancelReason: "registration_cancelled",
      updatedAt: FieldValue.serverTimestamp(),
    });
    cancelledInvites++;
  }
  if (cancelledInvites > 0) await batch.commit();

  // Avisa o outro atleta da dupla, se já houver um.
  const otherUids = athleteUids.filter((id) => id !== uid);
  if (otherUids.length > 0) {
    await Promise.all(
      otherUids.map((otherUid) =>
        deliverNotificationToUser({
          userId: otherUid,
          title: "Inscrição cancelada",
          body: "Seu parceiro cancelou a reserva da vaga. A inscrição foi removida.",
          type: "tournament_registration_cancelled",
          data: {tournamentId, url: `/torneios/${tournamentId}`},
        }).catch(() => undefined),
      ),
    );
  }

  await regRef.delete();

  logger.info("Tournament registration cancelled by athlete", {
    registrationId,
    tournamentId,
    categoryId,
    uid,
    cancelledInvites,
  });

  return {ok: true, registrationId};
});

export const acceptTournamentPartnerInvite = onCall(async (request) => {
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

    const expiresAt = invite.expiresAt as Timestamp | undefined;
    if (expiresAt && expiresAt.toMillis() < Date.now()) {
      tx.update(inviteRef, {status: "expired"});
      throw new HttpsError("failed-precondition", "Este convite expirou.");
    }

    const tournamentId = invite.tournamentId as string;
    const categoryId = invite.categoryId as string;
    const inviterUid = invite.inviterUid as string;

    const teamsRef = db.collection(artifactsTeamsPath(projectId));
    const inscriptionsRef = db.collection(artifactsInscriptionsPath(projectId));
    const teamsPath = artifactsTeamsPath(projectId);

    const attachRegId = (invite.attachRegistrationId as string | undefined)?.trim();

    await assertNoPairConflictTx(
      tx,
      inscriptionsRef,
      teamsPath,
      tournamentId,
      previewCategoryKeys,
      inviterUid,
      uid,
      attachRegId ? {ignoreRegistrationId: attachRegId} : undefined,
    );

    // Modo anexar: o convite preenche a inscrição solo existente do convidador
    // em vez de criar uma nova (vaga já estava reservada).
    const attachTeamId = (invite.attachTeamId as string | undefined)?.trim();
    if (attachRegId) {
      const existingRegRef = inscriptionsRef.doc(attachRegId);
      const existingRegSnap = await tx.get(existingRegRef);
      if (!existingRegSnap.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Inscrição solo não encontrada.",
        );
      }
      const existingReg = existingRegSnap.data()!;
      if (existingReg.partnerPending !== true) {
        throw new HttpsError(
          "failed-precondition",
          "Esta inscrição já tem parceiro.",
        );
      }
      const inviterId =
        (existingReg.player1Id as string | undefined)?.trim() ||
        (invite.inviterUid as string | undefined)?.trim() ||
        "";

      const attachUpdate: Record<string, unknown> = {
        participantUids: FieldValue.arrayUnion(uid),
        partnerPending: false,
        updatedAt: FieldValue.serverTimestamp(),
      };
      // Inscrição já paga pelo solo (pagou o total) → parceiro entra sem taxa.
      if (existingReg.isPaid === true) {
        attachUpdate.sharePaidUids = FieldValue.arrayUnion(uid);
      }
      if (inviteeUniform) {
        Object.assign(attachUpdate, registrationUniformPlayer2(inviteeUniform));
      }

      // Registra o aceite LGPD do convidado e, se a inscrição solo ainda não
      // tiver, o do convidante (capturado no envio do convite).
      const existingLgpdUids = Array.isArray(existingReg.lgpdAcceptedUids)
        ? (existingReg.lgpdAcceptedUids as unknown[])
        : [];
      const lgpdUnion: string[] = [];
      if (inviteeLgpdAccepted) {
        lgpdUnion.push(uid);
        attachUpdate[`lgpdAcceptedAt.${uid}`] = FieldValue.serverTimestamp();
      }
      if (
        invite.inviterLgpdAccepted === true &&
        inviterId &&
        !existingLgpdUids.includes(inviterId)
      ) {
        lgpdUnion.push(inviterId);
        attachUpdate[`lgpdAcceptedAt.${inviterId}`] =
          invite.inviterLgpdAcceptedAt ?? FieldValue.serverTimestamp();
      }
      if (lgpdUnion.length > 0) {
        attachUpdate.lgpdAcceptedUids = FieldValue.arrayUnion(...lgpdUnion);
        attachUpdate.lgpdTermVersion = LGPD_TERM_VERSION;
      }

      let teamId = attachTeamId ?? "";
      if (attachTeamId) {
        // Solo legado: já existe equipe de 1 atleta → preenche o player2.
        const existingTeamRef = teamsRef.doc(attachTeamId);
        const existingTeamSnap = await tx.get(existingTeamRef);
        if (!existingTeamSnap.exists) {
          throw new HttpsError(
            "failed-precondition",
            "Equipe da inscrição não encontrada.",
          );
        }
        tx.update(existingTeamRef, {player2Id: uid});
      } else {
        // Solo novo: CRIA a equipe agora (player1 + player2) — "criar equipe".
        const teamRef = teamsRef.doc();
        tx.set(teamRef, {
          player1Id: inviterId,
          player2Id: uid,
          createdAt: FieldValue.serverTimestamp(),
        });
        teamId = teamRef.id;
        attachUpdate.teamId = teamId;
      }

      tx.update(existingRegRef, attachUpdate);
      tx.update(inviteRef, {
        status: "accepted",
        teamId,
        registrationId: attachRegId,
        acceptedAt: FieldValue.serverTimestamp(),
      });
      return {
        registrationId: attachRegId,
        teamId,
        tournamentId,
        categoryId,
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

  await markStaleInvitesAfterAccept(
    db,
    result.tournamentId,
    result.categoryId,
    (invitePreviewData.inviterUid as string | undefined)?.trim() ?? "",
    uid,
    inviteId,
  );

  logger.info("Tournament partner invite accepted", {inviteId, ...result});

  const inviteAfter = (await inviteRef.get()).data();
  const inviterUid = (inviteAfter?.inviterUid as string | undefined)?.trim() ?? "";
  const inviteeName =
    (inviteAfter?.inviteeName as string | undefined)?.trim() || "Seu parceiro";
  const tournamentId = result.tournamentId;
  const categoryId = result.categoryId;
  const registrationId = result.registrationId;

  if (inviterUid) {
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
 * (player1/player2). Valida o tamanho contra a categoria.
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

  const teamId = (registration.teamId as string | undefined)?.trim() ?? "";
  if (!teamId) {
    throw new HttpsError("failed-precondition", "Equipe inválida.");
  }
  const teamSnap = await db
    .doc(`${artifactsTeamsPath(projectId)}/${teamId}`)
    .get();
  const team = teamSnap.data() ?? {};
  const player1Id =
    typeof team.player1Id === "string" ? team.player1Id.trim() : "";
  const player2Id =
    typeof team.player2Id === "string" ? team.player2Id.trim() : "";
  const isPlayer1 = player1Id === uid;
  const isPlayer2 = player2Id === uid;
  if (!isPlayer1 && !isPlayer2) {
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

  const update = isPlayer1
    ? registrationUniformPlayer1(uniform)
    : registrationUniformPlayer2(uniform);

  await regRef.update({
    ...update,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {ok: true};
});
