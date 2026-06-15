import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {assertCanRegisterInTournament} from "./athlete-tournament-access";
import {deliverNotificationToUser} from "./notification-delivery";
import {
  assertTournamentAcceptsRegistration,
  loadTournamentData,
} from "./tournament-registration-guards";

const INVITES_COLLECTION = "tournamentRegistrationInvites";
const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

function getFirebaseProjectId(): string {
  return process.env.GCLOUD_PROJECT || "volley-track-2dd3b";
}

function artifactsTeamsPath(projectId: string): string {
  return `artifacts/${projectId}/public/data/teams`;
}

function artifactsInscriptionsPath(projectId: string): string {
  return `artifacts/${projectId}/public/data/inscriptions`;
}

type UniformType = "none" | "top_only" | "full";

type TournamentCategory = {
  categoryName: string;
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

function findCategory(
  tournament: Record<string, unknown>,
  categoryId: string,
): TournamentCategory | null {
  const categories = (tournament.categories || []) as TournamentCategory[];
  return categories.find((c) => c.categoryName === categoryId) ?? null;
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

async function userHasCategoryRegistration(
  db: Firestore,
  projectId: string,
  uid: string,
  tournamentId: string,
  categoryId: string,
): Promise<boolean> {
  const inscriptionsRef = db.collection(artifactsInscriptionsPath(projectId));
  const snap = await inscriptionsRef.where("tournamentId", "==", tournamentId).get();
  const teamsRef = db.collection(artifactsTeamsPath(projectId));

  for (const doc of snap.docs) {
    const data = doc.data();
    if ((data.categoryId as string) !== categoryId) continue;
    const teamId = data.teamId as string | undefined;
    if (!teamId) continue;
    const teamSnap = await teamsRef.doc(teamId).get();
    if (!teamSnap.exists) continue;
    const team = teamSnap.data()!;
    if (team.player1Id === uid || team.player2Id === uid) {
      return true;
    }
  }
  return false;
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

  return snap.docs.some((d) => {
    const data = d.data();
    return data.categoryId === categoryId && data.inviteeUid === inviteeUid;
  });
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
  const category = findCategory(tournament, categoryId);
  if (!category) {
    throw new HttpsError("not-found", "Categoria não encontrada neste torneio.");
  }

  const uniformRequired = categoryRequiresUniform(category);
  const inviterUniform = parseUniformPayload(request.data?.inviterUniform);
  validateUniformPayload(category, inviterUniform, uniformRequired);

  if (await userHasCategoryRegistration(db, projectId, uid, tournamentId, categoryId)) {
    throw new HttpsError(
      "failed-precondition",
      "Você já possui inscrição nesta categoria."
    );
  }
  if (await userHasCategoryRegistration(db, projectId, inviteeUid, tournamentId, categoryId)) {
    throw new HttpsError(
      "failed-precondition",
      "Este parceiro já está inscrito nesta categoria."
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
  };
  if (inviterUniform) {
    Object.assign(
      inviteData,
      uniformToInviteFields(inviterUniform, "inviter"),
    );
  }
  await ref.set(inviteData);

  try {
    await deliverNotificationToUser({
      userId: inviteeUid,
      title: "Convite para torneio",
      body: `${inviterName} te convidou para formar dupla · ${categoryId}`,
      type: "tournament_partner_invite",
      data: {
        inviteId: ref.id,
        tournamentId,
        categoryId,
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
  await assertTournamentAcceptsRegistration(
    db,
    projectId,
    previewTournamentId,
    previewCategoryId,
  );
  const previewCategory = findCategory(previewTournament, previewCategoryId);
  if (!previewCategory) {
    throw new HttpsError("not-found", "Categoria não encontrada.");
  }
  validateUniformPayload(
    previewCategory,
    inviteeUniform,
    categoryRequiresUniform(previewCategory),
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
      ...registrationUniformFromInvite(invite),
    };
    if (inviteeUniform) {
      Object.assign(
        registrationData,
        registrationUniformPlayer2(inviteeUniform),
      );
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
    return {success: true, status: "declined"};
  }

  if (!isInviter && !isInvitee) {
    throw new HttpsError("permission-denied", "Você não pode cancelar este convite.");
  }

  await inviteRef.update({status: "cancelled"});
  return {success: true, status: "cancelled"};
});
