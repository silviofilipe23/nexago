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
  computeTournamentShareAmountReais,
  sharePaidUidsFromRegistration,
} from "./tournament-registration-pix-helpers";

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
