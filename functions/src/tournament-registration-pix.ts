import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import * as logger from "firebase-functions/logger";
import {AsaasApiError, asaasArenaSecrets} from "./asaas-client";
import {
  getOrCreateAsaasCustomer,
  resolveAthleteCpfCnpj,
} from "./asaas-customer";
import {
  createAsaasPixCharge,
  deleteAsaasPaymentIfOpen,
} from "./asaas-booking-payment";
import {
  TOURNAMENT_REGISTRATION_PIX_EXPIRY_MINUTES,
} from "./arena-booking-payment-constants";
import {PLATFORM_FEE_FIXED_BRL} from "./mercadopago-arena-helpers";
import {assertCanRegisterInTournament} from "./athlete-tournament-access";
import {
  buildTournamentRegistrationExternalReference,
  computeTeamGenderLabel,
  computeTournamentShareAmountReais,
  isFreeRegistrationFullyConfirmed,
  normalizeAthleteGenderBucket,
  sharePaidUidsFromRegistration,
} from "./tournament-registration-pix-helpers";
import {deliverNotificationToUser} from "./notification-delivery";

const pixPaymentSecrets = [...asaasArenaSecrets, PLATFORM_FEE_FIXED_BRL];

function getFirebaseProjectId(): string {
  return process.env.GCLOUD_PROJECT || "volley-track-2dd3b";
}

function artifactsInscriptionsPath(projectId: string): string {
  return `artifacts/${projectId}/public/data/inscriptions`;
}

function artifactsTeamsPath(projectId: string): string {
  return `artifacts/${projectId}/public/data/teams`;
}

type PixPaymentResponse = {
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string;
  expiresAt: string;
  amountReais: number;
};

async function loadTournamentEntryFee(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  categoryId: string,
): Promise<{entryFee: number; tournamentName: string}> {
  let tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!tournamentSnap.exists) {
    tournamentSnap = await db
      .doc(`artifacts/${projectId}/public/data/tournaments/${tournamentId}`)
      .get();
  }
  if (!tournamentSnap.exists) {
    throw new HttpsError("not-found", "Torneio não encontrado");
  }
  const tournament = tournamentSnap.data()!;
  const categories = (tournament.categories || []) as Array<{
    categoryName: string;
    entryFee?: number;
  }>;
  const category = categories.find((c) => c.categoryName === categoryId);
  const entryFee = category?.entryFee ?? 0;
  const tournamentName = (tournament.name as string) || "Torneio";
  return {entryFee, tournamentName};
}

function pixPendingRef(
  db: Firestore,
  projectId: string,
  registrationId: string,
  payerUid: string,
) {
  return db
    .collection(artifactsInscriptionsPath(projectId))
    .doc(registrationId)
    .collection("pixPending")
    .doc(payerUid);
}

async function cancelExistingPixPending(
  db: Firestore,
  projectId: string,
  registrationId: string,
  payerUid: string,
): Promise<void> {
  const pendingRef = pixPendingRef(db, projectId, registrationId, payerUid);
  const pendingSnap = await pendingRef.get();
  if (!pendingSnap.exists) return;
  const asaasId = (pendingSnap.data()?.asaasPaymentId as string | undefined)?.trim();
  if (asaasId) {
    await deleteAsaasPaymentIfOpen(asaasId);
  }
  await pendingRef.delete();
}

export const createTournamentRegistrationPixPayment = onCall({
  secrets: pixPaymentSecrets,
}, async (request): Promise<PixPaymentResponse> => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Faça login para pagar.");
  }

  const data = (request.data ?? {}) as {
    registrationId?: string;
    cpf?: string;
    cpfCnpj?: string;
  };
  const registrationId =
    typeof data.registrationId === "string" ? data.registrationId.trim() : "";
  const cpfFromRequest =
    typeof data.cpfCnpj === "string" ? data.cpfCnpj :
      (typeof data.cpf === "string" ? data.cpf : "");
  if (!registrationId) {
    throw new HttpsError("invalid-argument", "registrationId é obrigatório");
  }

  const projectId = getFirebaseProjectId();
  const db = getFirestore();

  await assertCanRegisterInTournament(db, callerUid);

  const registrationRef = db
    .collection(artifactsInscriptionsPath(projectId))
    .doc(registrationId);
  const registrationSnap = await registrationRef.get();
  if (!registrationSnap.exists) {
    throw new HttpsError("not-found", "Inscrição não encontrada");
  }

  const registration = registrationSnap.data()!;
  if (registration.isPaid === true) {
    throw new HttpsError("failed-precondition", "Esta inscrição já foi confirmada");
  }

  const sharePaidUids = sharePaidUidsFromRegistration(registration);
  if (sharePaidUids.includes(callerUid)) {
    throw new HttpsError("failed-precondition", "Sua parcela já foi paga.");
  }

  const teamId = registration.teamId as string;
  const tournamentId = registration.tournamentId as string;
  const categoryId = registration.categoryId as string;

  const teamSnap = await db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`).get();
  if (!teamSnap.exists) {
    throw new HttpsError("not-found", "Equipe não encontrada");
  }
  const team = teamSnap.data()!;
  if (team.player1Id !== callerUid && team.player2Id !== callerUid) {
    throw new HttpsError("permission-denied", "Você não é um dos atletas desta inscrição");
  }

  const {entryFee, tournamentName} = await loadTournamentEntryFee(
    db,
    projectId,
    tournamentId,
    categoryId,
  );
  if (entryFee <= 0) {
    throw new HttpsError("failed-precondition", "Categoria sem taxa de inscrição");
  }

  const shareAmount = computeTournamentShareAmountReais(entryFee);
  if (shareAmount <= 0) {
    throw new HttpsError("failed-precondition", "Valor da parcela inválido");
  }

  await cancelExistingPixPending(db, projectId, registrationId, callerUid);

  let payerEmail = "pagamento@nexago.app";
  let payerName: string | undefined;
  try {
    const user = await getAuth().getUser(callerUid);
    if (user.email?.trim()) payerEmail = user.email!.trim();
    payerName = user.displayName?.trim() || undefined;
  } catch {
    // fallback
  }

  let cpfCnpj: string;
  try {
    cpfCnpj = await resolveAthleteCpfCnpj(callerUid, cpfFromRequest);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "ASAAS_CUSTOMER_CPF_REQUIRED") {
      throw new HttpsError(
        "failed-precondition",
        "Informe seu CPF para pagar com PIX.",
      );
    }
    throw e;
  }

  let customerId: string;
  try {
    customerId = await getOrCreateAsaasCustomer(
      callerUid,
      payerEmail,
      payerName,
      cpfCnpj,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "ASAAS_API_KEY_MISSING") {
      throw new HttpsError(
        "failed-precondition",
        "Pagamento online temporariamente indisponível.",
      );
    }
    if (msg === "ASAAS_CUSTOMER_CPF_REQUIRED") {
      throw new HttpsError(
        "failed-precondition",
        "Informe seu CPF para pagar com PIX.",
      );
    }
    logger.error("createTournamentRegistrationPixPayment customer failed", e);
    throw new HttpsError("internal", "Não foi possível preparar o pagamento.");
  }

  const expiresAtDate = new Date(
    Date.now() + TOURNAMENT_REGISTRATION_PIX_EXPIRY_MINUTES * 60 * 1000,
  );
  const description =
    `Inscrição ${tournamentName} — ${categoryId} (sua parcela)`;

  const externalReference = buildTournamentRegistrationExternalReference(
    registrationId,
    callerUid,
  );

  let charge;
  try {
    charge = await createAsaasPixCharge({
      customerId,
      valueReais: shareAmount,
      dueDate: expiresAtDate,
      description,
      externalReference,
      idempotencyKey: `tournament-reg-pix-${registrationId}-${callerUid}`,
    });
  } catch (e) {
    if (e instanceof AsaasApiError) {
      logger.error(
        "createTournamentRegistrationPixPayment Asaas failed:",
        e.httpStatus,
        e.body,
      );
      const hint = e.message.toLowerCase();
      if (hint.includes("cpf") || hint.includes("cnpj")) {
        throw new HttpsError("failed-precondition", e.message);
      }
      throw new HttpsError("internal", "Não foi possível gerar o PIX. Tente novamente.");
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "ASAAS_API_KEY_MISSING") {
      throw new HttpsError(
        "failed-precondition",
        "Pagamento online temporariamente indisponível.",
      );
    }
    if (msg === "ASAAS_PIX_QR_MISSING") {
      throw new HttpsError(
        "failed-precondition",
        "PIX criado, mas o QR Code ainda não está disponível. Tente novamente em alguns segundos.",
      );
    }
    logger.error("createTournamentRegistrationPixPayment charge failed", e);
    throw new HttpsError("internal", "Não foi possível gerar o PIX. Tente novamente.");
  }

  await pixPendingRef(db, projectId, registrationId, callerUid).set({
    asaasPaymentId: charge.paymentId,
    amountReais: shareAmount,
    status: "pending",
    payerUid: callerUid,
    paymentExpiresAt: Timestamp.fromDate(expiresAtDate),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    paymentId: charge.paymentId,
    qrCode: charge.qrCode,
    qrCodeBase64: charge.qrCodeBase64,
    expiresAt: expiresAtDate.toISOString(),
    amountReais: shareAmount,
  };
});

/** Cancela cobrança PIX pendente da parcela (sem cancelar a inscrição). */
export const cancelPendingTournamentRegistrationPix = onCall({
  secrets: pixPaymentSecrets,
}, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }

  const data = (request.data ?? {}) as {registrationId?: string};
  const registrationId =
    typeof data.registrationId === "string" ? data.registrationId.trim() : "";
  if (!registrationId) {
    throw new HttpsError("invalid-argument", "registrationId é obrigatório");
  }

  const projectId = getFirebaseProjectId();
  const db = getFirestore();
  const registrationRef = db
    .collection(artifactsInscriptionsPath(projectId))
    .doc(registrationId);
  const registrationSnap = await registrationRef.get();
  if (!registrationSnap.exists) {
    throw new HttpsError("not-found", "Inscrição não encontrada");
  }

  const registration = registrationSnap.data()!;
  const teamId = registration.teamId as string;
  const teamSnap = await db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`).get();
  if (!teamSnap.exists) {
    throw new HttpsError("not-found", "Equipe não encontrada");
  }
  const team = teamSnap.data()!;
  if (team.player1Id !== callerUid && team.player2Id !== callerUid) {
    throw new HttpsError("permission-denied", "Você não é um dos atletas desta inscrição");
  }

  const sharePaidUids = sharePaidUidsFromRegistration(registration);
  if (sharePaidUids.includes(callerUid)) {
    throw new HttpsError("failed-precondition", "Sua parcela já foi paga.");
  }

  await cancelExistingPixPending(db, projectId, registrationId, callerUid);
  return {registrationId, status: "cancelled"};
});

async function loadUserGenderBucket(
  db: Firestore,
  uid: string,
): Promise<ReturnType<typeof normalizeAthleteGenderBucket>> {
  if (!uid) return null;
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) return null;
  const gender = snap.data()?.gender;
  return normalizeAthleteGenderBucket(
    typeof gender === "string" ? gender : undefined,
  );
}

async function setTeamGenderWhenRegistrationPaid(
  db: Firestore,
  projectId: string,
  teamId: string,
): Promise<void> {
  if (!teamId) return;

  const teamRef = db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists) {
    logger.warn(`Team ${teamId} não encontrado para definir gender`);
    return;
  }

  const data = teamSnap.data() ?? {};
  const player1Id = typeof data.player1Id === "string" ? data.player1Id.trim() : "";
  const player2Id = typeof data.player2Id === "string" ? data.player2Id.trim() : "";
  if (!player1Id || !player2Id) return;

  const [g1, g2] = await Promise.all([
    loadUserGenderBucket(db, player1Id),
    loadUserGenderBucket(db, player2Id),
  ]);
  const teamGender = computeTeamGenderLabel(g1, g2);
  if (!teamGender) {
    logger.warn(
      `Team ${teamId}: não foi possível calcular gender (p1=${String(g1)} p2=${String(g2)})`,
    );
    return;
  }

  await teamRef.set(
    {
      gender: teamGender,
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
}

async function notifyRegistrationFullyConfirmed({
  db,
  projectId,
  registrationId,
  tournamentId,
  categoryId,
  teamId,
  confirmedByUid,
}: {
  db: Firestore;
  projectId: string;
  registrationId: string;
  tournamentId: string;
  categoryId: string;
  teamId: string;
  confirmedByUid: string;
}): Promise<void> {
  const teamSnap = await db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`).get();
  if (!teamSnap.exists) return;
  const team = teamSnap.data() ?? {};
  const athleteUids = [team.player1Id, team.player2Id]
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter((id, idx, arr) => id.length > 0 && arr.indexOf(id) === idx);
  const recipients = athleteUids.filter((uid) => uid !== confirmedByUid);
  const encodedCategoryName = encodeURIComponent(categoryId);
  const url =
    `/torneios/${tournamentId}/inscricao/sucesso?registrationId=${registrationId}` +
    `&categoryName=${encodedCategoryName}`;

  await Promise.all(
    recipients.map((uid) =>
      deliverNotificationToUser({
        userId: uid,
        title: "Inscricao confirmada",
        body: "Sua dupla concluiu a inscrição. Toque para ver o comprovante.",
        type: "tournament_registration_confirmed",
        data: {
          tournamentId,
          registrationId,
          url,
        },
      }),
    ),
  );
}

/** Confirma inscrição gratuita (taxa zero) sem PIX. */
export const confirmFreeTournamentRegistration = onCall({
}, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Faça login para confirmar a inscrição.");
  }

  const data = (request.data ?? {}) as {registrationId?: string};
  const registrationId =
    typeof data.registrationId === "string" ? data.registrationId.trim() : "";
  if (!registrationId) {
    throw new HttpsError("invalid-argument", "registrationId é obrigatório");
  }

  const projectId = getFirebaseProjectId();
  const db = getFirestore();

  await assertCanRegisterInTournament(db, callerUid);

  const registrationRef = db
    .collection(artifactsInscriptionsPath(projectId))
    .doc(registrationId);
  const registrationSnap = await registrationRef.get();
  if (!registrationSnap.exists) {
    throw new HttpsError("not-found", "Inscrição não encontrada");
  }

  const registration = registrationSnap.data()!;
  if (registration.isPaid === true) {
    return {registrationId, isPaid: true, alreadyConfirmed: true};
  }

  const sharePaidUids = sharePaidUidsFromRegistration(registration);
  if (sharePaidUids.includes(callerUid)) {
    throw new HttpsError("failed-precondition", "Você já confirmou sua inscrição.");
  }

  const teamId = registration.teamId as string;
  const tournamentId = registration.tournamentId as string;
  const categoryId = registration.categoryId as string;

  const teamSnap = await db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`).get();
  if (!teamSnap.exists) {
    throw new HttpsError("not-found", "Equipe não encontrada");
  }
  const team = teamSnap.data()!;
  const player1Id = typeof team.player1Id === "string" ? team.player1Id.trim() : "";
  const player2Id = typeof team.player2Id === "string" ? team.player2Id.trim() : "";
  if (player1Id !== callerUid && player2Id !== callerUid) {
    throw new HttpsError("permission-denied", "Você não é um dos atletas desta inscrição");
  }

  const {entryFee} = await loadTournamentEntryFee(
    db,
    projectId,
    tournamentId,
    categoryId,
  );
  if (entryFee > 0) {
    throw new HttpsError(
      "failed-precondition",
      "Esta categoria possui taxa de inscrição. Use o pagamento PIX.",
    );
  }

  const teamUids = [player1Id, player2Id];
  const updatedSharePaidUids = [...sharePaidUids, callerUid];
  const wasPaidBefore = registration.isPaid === true;
  const isPaid = isFreeRegistrationFullyConfirmed(teamUids, updatedSharePaidUids);

  await registrationRef.update({
    sharePaidUids: FieldValue.arrayUnion(callerUid),
    isPaid,
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (!wasPaidBefore && isPaid) {
    try {
      await setTeamGenderWhenRegistrationPaid(db, projectId, teamId);
    } catch (genderError) {
      logger.warn(
        `Falha ao definir gender da equipe ${teamId} (registration ${registrationId})`,
        genderError,
      );
    }
    try {
      await notifyRegistrationFullyConfirmed({
        db,
        projectId,
        registrationId,
        tournamentId,
        categoryId,
        teamId,
        confirmedByUid: callerUid,
      });
    } catch (notifyError) {
      logger.warn(
        `Falha ao notificar inscrição gratuita ${registrationId}`,
        notifyError,
      );
    }
  }

  return {registrationId, isPaid, alreadyConfirmed: false};
});
