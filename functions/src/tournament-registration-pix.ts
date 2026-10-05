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
  createAsaasCardCharge,
  createAsaasPixCharge,
} from "./asaas-booking-payment";
import {registrationHoldClearedFields} from
  "./tournament-registration-hold-ops";
import {computePixWindow} from "./tournament-registration-hold";
import {PLATFORM_FEE_FIXED_BRL} from "./mercadopago-arena-helpers";
import {assertCanRegisterInTournament} from "./athlete-tournament-access";
import {assertTeamLevelEligibility} from "./category-level-eligibility";
import {assertTeamAgeEligibility} from "./category-age-eligibility";
import {
  assertTournamentAcceptsRegistration,
  findCategory,
  loadTournamentData,
  resolveCategoryEntryFee,
} from "./tournament-registration-guards";
import {
  buildTournamentRegistrationExternalReference,
  canChargeTournamentFull,
  registrationAthleteUids,
  computeTournamentShareAmountReais,
  isFreeRegistrationFullyConfirmed,
  isDirectWithOrganizerPaymentMode,
  resolveDirectReservationMarks,
  resolveTournamentChargeReais,
  sharePaidUidsFromRegistration,
} from "./tournament-registration-pix-helpers";
import {
  usesDynamicShare,
  computeTeamMemberShareReais,
  registrationTeamSize,
} from "./tournament-team-category";
import {
  loadTeamMemberUids,
  markTeamRegistrationPaid,
} from "./tournament-team-roster";
import {
  deliverNotificationToUser,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_SUBJECT,
} from "./notification-delivery";
import {tournamentManagerUids} from "./tournament-acl";
import {organizerTournamentNotificationLinks} from "./organizer-notification-links";
import {artifactsInscriptionsPath, artifactsTeamsPath, getFirebaseProjectId} from "./firebase-paths";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  cashbackIdempotencyKey,
  cashbackResponseFields,
  defaultPreviousChargeOps,
  releaseCashbackHoldQuietly,
  reserveCashbackForCharge,
  retirePreviousCharge,
  type PreviousChargeOps,
} from "./cashback-checkout";
import {registrationCashbackLabel} from "./cashback-intent";
import {attachHoldPayment} from "./athlete-wallet";
import {isOrganizerRegistered} from "./organizer-create-registration-core";

const pixPaymentSecrets = [...asaasArenaSecrets, PLATFORM_FEE_FIXED_BRL];




type PixPaymentResponse = {
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string;
  expiresAt: string;
  amountReais: number;
  /** Parte paga com cashback (0 sem saldo). `amountReais` segue sendo o preço. */
  cashbackAppliedReais?: number;
  /** Valor efetivamente cobrado no Asaas. */
  chargedReais?: number;
};

async function loadTournamentEntryFee(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  categoryId: string,
): Promise<{entryFee: number; tournamentName: string}> {
  const tournament = await loadTournamentData(db, projectId, tournamentId);
  if (!tournament) {
    throw new HttpsError("not-found", "Torneio não encontrado");
  }
  if (!findCategory(tournament, categoryId)) {
    throw new HttpsError("not-found", "Categoria não encontrada");
  }
  const entryFee = resolveCategoryEntryFee(tournament, categoryId);
  const tournamentName = (tournament.name as string) || "Torneio";
  return {entryFee, tournamentName};
}

/** Milissegundos de um campo de data do Firestore, ou `null` se não houver. */
function timestampMs(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
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

/**
 * Mata a cobrança pendente do atleta antes de uma nova (ou a pedido dele). O
 * saldo que ela reservou só volta com prova de que morreu: se o atleta já a
 * pagou e o webhook ainda não chegou, o DELETE é recusado e a reserva fica
 * para o webhook capturar — a cobrança nova reserva só o que sobrou.
 */
export async function cancelExistingPixPending(
  db: Firestore,
  projectId: string,
  registrationId: string,
  payerUid: string,
  ops: PreviousChargeOps = defaultPreviousChargeOps,
): Promise<void> {
  const pendingRef = pixPendingRef(db, projectId, registrationId, payerUid);
  const pendingSnap = await pendingRef.get();
  if (!pendingSnap.exists) return;
  const pending = pendingSnap.data() ?? {};
  const asaasId = (pending.asaasPaymentId as string | undefined)?.trim();
  await retirePreviousCharge(
    db,
    {uid: payerUid, trackingPath: pendingRef.path, paymentId: asaasId},
    Date.now(),
    ops,
  );
  await pendingRef.delete();
}

/** Entrada das callables de cobrança (PIX e cartão têm a mesma). */
type RegistrationChargeRequest = {
  registrationId?: string;
  cpf?: string;
  cpfCnpj?: string;
  amountType?: string;
  useCashback?: boolean;
};

/** Tudo que uma cobrança precisa, já validado e resolvido no gateway. */
interface PreparedRegistrationCharge {
  db: Firestore;
  projectId: string;
  registrationId: string;
  amountType: "share" | "full";
  chargeAmount: number;
  customerId: string;
  description: string;
  externalReference: string;
  expiresAtDate: Date;
  tournamentName: string;
}

/**
 * Tudo que vem ANTES de existir uma cobrança: autenticação, elegibilidade,
 * prazo da vaga, valor da cota e cliente no gateway. É idêntico para PIX e
 * cartão — o que muda é só o `billingType` na hora de criar a cobrança.
 *
 * `methodLabel` entra nas mensagens voltadas ao atleta ("Informe seu CPF para
 * pagar com PIX" / "com cartão").
 */
async function prepareRegistrationCharge(
  callerUid: string,
  data: RegistrationChargeRequest,
  methodLabel: string,
): Promise<PreparedRegistrationCharge> {
  const amountType: "share" | "full" =
    data.amountType === "full" ? "full" : "share";
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

  // "Pagar o total" é permitido no solo (garante a vaga; o parceiro entra sem
  // taxa depois). Exige apenas que não haja pagamento parcial prévio, para não
  // cobrar a mais (parceiro pagou parcela + alguém paga a dupla = cobrança dupla).
  if (
    amountType === "full" &&
    !canChargeTournamentFull({
      paidAmount: Number(registration.paidAmount) || 0,
      sharePaidUids,
    })
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Já há pagamento parcial nesta inscrição; conclua a parcela restante.",
    );
  }

  const teamId = registration.teamId as string;
  const tournamentId = registration.tournamentId as string;
  const categoryId = registration.categoryId as string;
  // Inscrita pelo organizador: o prazo do torneio não vale para pagá-la.
  const organizerRegistered = isOrganizerRegistered(registration);

  const tournamentData = await assertTournamentAcceptsRegistration(
    db,
    projectId,
    tournamentId,
    categoryId,
    {
      // Esta inscrição já ocupa vaga: contá-la contra si mesma jogaria na fila
      // justamente quem está confirmando a vaga que já é dele.
      occupancyExcludesRegistrationId: registrationId,
      allowClosedRegistration: organizerRegistered,
    },
  );

  if (isDirectWithOrganizerPaymentMode(tournamentData.paymentMode)) {
    throw new HttpsError(
      "failed-precondition",
      "Este torneio usa pagamento direto com o organizador.",
    );
  }

  // Se a categoria está lotada, a inscrição pode entrar na fila.
  // O guard sinaliza isso via `__shouldWaitlist` (sem persistir no documento aqui).
  const shouldWaitlist =
    (tournamentData as Record<string, unknown>).__shouldWaitlist === true;
  if (shouldWaitlist) {
    await registrationRef.update({
      waitlist: true,
      ...registrationHoldClearedFields(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  // Solo novo não tem equipe ainda: identifica os atletas pela inscrição.
  let team: Record<string, unknown> | null = null;
  if (teamId) {
    const teamSnap = await db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`).get();
    if (!teamSnap.exists) {
      throw new HttpsError("not-found", "Equipe não encontrada");
    }
    team = teamSnap.data()!;
  }
  const athleteUids = registrationAthleteUids(registration, team);
  if (!athleteUids.includes(callerUid)) {
    throw new HttpsError("permission-denied", "Você não é um dos atletas desta inscrição");
  }

  await assertTeamLevelEligibility({
    db,
    tournament: tournamentData,
    category: findCategory(tournamentData, categoryId),
    uids: athleteUids,
  });
  await assertTeamAgeEligibility({
    db,
    tournament: tournamentData,
    category: findCategory(tournamentData, categoryId),
    uids: athleteUids,
  });

  const {entryFee, tournamentName} = await loadTournamentEntryFee(
    db,
    projectId,
    tournamentId,
    categoryId,
  );
  if (entryFee <= 0) {
    throw new HttpsError("failed-precondition", "Categoria sem taxa de inscrição");
  }

  // Cota do atleta: metade (dupla) ou, em equipe e individual, o RESTANTE
  // dividido pelos pagadores que faltam (some o problema de centavos e absorve
  // um "full" anterior; na individual é a taxa inteira).
  const regTeamSize = registrationTeamSize(
    registration,
    findCategory(tournamentData, categoryId),
  );
  const isTeamRegistration = usesDynamicShare(regTeamSize);
  const shareAmount = isTeamRegistration
    ? computeTeamMemberShareReais({
        entryFee,
        paidAmount: Number(registration.paidAmount) || 0,
        confirmedCount: sharePaidUids.length,
        teamSize: regTeamSize,
      })
    : computeTournamentShareAmountReais(entryFee);
  if (shareAmount <= 0) {
    throw new HttpsError("failed-precondition", "Valor da parcela inválido");
  }
  // Valor efetivo: parcela ou a taxa inteira ("pagar pela equipe").
  const chargeAmount =
    amountType === "full"
      ? resolveTournamentChargeReais(entryFee, "full")
      : shareAmount;

  // A cobrança cabe no prazo da vaga; nunca o estica. Inscrição que acabou de
  // ir para a fila perdeu o prazo ali em cima — e fila não tem prazo nenhum.
  const pixWindow = computePixWindow({
    nowMs: Date.now(),
    holdExpiresAtMs: shouldWaitlist ?
      null :
      timestampMs(registration.holdExpiresAt),
    // Inscrita pelo organizador: o fim das inscrições não é teto da cobrança —
    // depois dele, o teto mataria toda cobrança antes de nascer.
    registrationClosesAtMs: organizerRegistered ?
      null :
      timestampMs(tournamentData.registrationClosesAt),
  });
  // Decidido ANTES de matar a cobrança anterior: sem tempo para uma nova, o QR
  // que o atleta já tem na mão continua sendo a melhor chance dele.
  if (!pixWindow.ok) {
    throw new HttpsError(
      "failed-precondition",
      pixWindow.reason === "registrationClosingSoon" ?
        "As inscrições deste torneio estão encerrando — não há tempo para " +
          "concluir o pagamento." :
        "O prazo para garantir sua vaga está acabando. Faça a inscrição de " +
          "novo para ter tempo de pagar.",
    );
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
        `Informe seu CPF para pagar com ${methodLabel}.`,
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
        `Informe seu CPF para pagar com ${methodLabel}.`,
      );
    }
    logger.error("prepareRegistrationCharge customer failed", e);
    throw new HttpsError("internal", "Não foi possível preparar o pagamento.");
  }

  const expiresAtDate = new Date(pixWindow.expiresAtMs);
  const description =
    `Inscrição ${tournamentName} — ${categoryId} ` +
    (regTeamSize === 1
      ? "(individual)"
      : amountType === "full"
        ? isTeamRegistration
          ? "(equipe inteira)"
          : "(dupla inteira)"
        : "(sua parcela)");

  const externalReference = buildTournamentRegistrationExternalReference(
    registrationId,
    callerUid,
  );

  return {
    db,
    projectId,
    registrationId,
    amountType,
    chargeAmount,
    customerId,
    description,
    externalReference,
    expiresAtDate,
    tournamentName,
  };
}

export const createTournamentRegistrationPixPayment = onCall({
  region: CLIENT_FACING_REGIONS,
  secrets: pixPaymentSecrets,
}, async (request): Promise<PixPaymentResponse> => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Faça login para pagar.");
  }

  const {
    db, projectId, registrationId, amountType, chargeAmount,
    customerId, description, externalReference, expiresAtDate, tournamentName,
  } = await prepareRegistrationCharge(
    callerUid,
    (request.data ?? {}) as RegistrationChargeRequest,
    "PIX",
  );

  const pendingDocRef = pixPendingRef(db, projectId, registrationId, callerUid);
  const cashback = await reserveCashbackForCharge(db, {
    uid: callerUid,
    useCashback: (request.data as RegistrationChargeRequest | undefined)?.useCashback,
    priceReais: chargeAmount,
    sourceType: "registration",
    sourceId: registrationId,
    trackingPath: pendingDocRef.path,
    label: registrationCashbackLabel(tournamentName),
    nowMs: Date.now(),
  });

  let charge;
  try {
    charge = await createAsaasPixCharge({
      customerId,
      valueReais: cashback.chargeReais,
      dueDate: expiresAtDate,
      description,
      externalReference,
      idempotencyKey: cashbackIdempotencyKey(`tournament-reg-pix-${registrationId}-${callerUid}`, cashback.holdId),
    });
  } catch (e) {
    await releaseCashbackHoldQuietly(db, callerUid, cashback.holdId, Date.now());
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

  if (cashback.holdId) {
    await attachHoldPayment(db, callerUid, cashback.holdId, charge.paymentId);
  }

  await pendingDocRef.set({
    asaasPaymentId: charge.paymentId,
    amountReais: chargeAmount,
    amountType,
    billingType: "PIX",
    status: "pending",
    payerUid: callerUid,
    paymentExpiresAt: Timestamp.fromDate(expiresAtDate),
    cashbackAppliedCents: cashback.appliedCents,
    cashbackHoldId: cashback.holdId,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    paymentId: charge.paymentId,
    qrCode: charge.qrCode,
    qrCodeBase64: charge.qrCodeBase64,
    expiresAt: expiresAtDate.toISOString(),
    amountReais: chargeAmount,
    ...cashbackResponseFields(cashback),
  };
});

type CardPaymentResponse = {
  paymentId: string;
  /** Checkout hospedado do Asaas — o atleta digita o cartão lá, não aqui. */
  invoiceUrl: string;
  expiresAt: string;
  amountReais: number;
  /** Parte paga com cashback (0 sem saldo). `amountReais` segue sendo o preço. */
  cashbackAppliedReais?: number;
  /** Valor efetivamente cobrado no Asaas. */
  chargedReais?: number;
};

/**
 * Cobrança de inscrição por cartão de crédito.
 *
 * Devolve o checkout HOSPEDADO do Asaas: nenhum dado de cartão passa por esta
 * função, pelo portal ou pelo Firestore. A vaga é confirmada pelo webhook na
 * autorização (`CONFIRMED`) — ver `registration-payment-phases.ts`.
 */
export const createTournamentRegistrationCardPayment = onCall({
  region: CLIENT_FACING_REGIONS,
  secrets: pixPaymentSecrets,
}, async (request): Promise<CardPaymentResponse> => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Faça login para pagar.");
  }

  const {
    db, projectId, registrationId, amountType, chargeAmount,
    customerId, description, externalReference, expiresAtDate, tournamentName,
  } = await prepareRegistrationCharge(
    callerUid,
    (request.data ?? {}) as RegistrationChargeRequest,
    "cartão",
  );

  const pendingDocRef = pixPendingRef(db, projectId, registrationId, callerUid);
  const cashback = await reserveCashbackForCharge(db, {
    uid: callerUid,
    useCashback: (request.data as RegistrationChargeRequest | undefined)?.useCashback,
    priceReais: chargeAmount,
    sourceType: "registration",
    sourceId: registrationId,
    trackingPath: pendingDocRef.path,
    label: registrationCashbackLabel(tournamentName),
    nowMs: Date.now(),
  });

  let charge;
  try {
    charge = await createAsaasCardCharge({
      customerId,
      valueReais: cashback.chargeReais,
      dueDate: expiresAtDate,
      description,
      externalReference,
      idempotencyKey: cashbackIdempotencyKey(`tournament-reg-card-${registrationId}-${callerUid}`, cashback.holdId),
    });
  } catch (e) {
    await releaseCashbackHoldQuietly(db, callerUid, cashback.holdId, Date.now());
    if (e instanceof AsaasApiError) {
      logger.error(
        "createTournamentRegistrationCardPayment Asaas failed:",
        e.httpStatus,
        e.body,
      );
      const hint = e.message.toLowerCase();
      if (hint.includes("cpf") || hint.includes("cnpj")) {
        throw new HttpsError("failed-precondition", e.message);
      }
      throw new HttpsError(
        "internal",
        "Não foi possível abrir o checkout. Tente novamente.",
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "ASAAS_API_KEY_MISSING") {
      throw new HttpsError(
        "failed-precondition",
        "Pagamento online temporariamente indisponível.",
      );
    }
    logger.error("createTournamentRegistrationCardPayment charge failed", e);
    throw new HttpsError(
      "internal",
      "Não foi possível abrir o checkout. Tente novamente.",
    );
  }

  if (cashback.holdId) {
    await attachHoldPayment(db, callerUid, cashback.holdId, charge.paymentId);
  }

  await pendingDocRef.set({
    asaasPaymentId: charge.paymentId,
    amountReais: chargeAmount,
    amountType,
    billingType: "CREDIT_CARD",
    status: "pending",
    payerUid: callerUid,
    paymentExpiresAt: Timestamp.fromDate(expiresAtDate),
    cashbackAppliedCents: cashback.appliedCents,
    cashbackHoldId: cashback.holdId,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    paymentId: charge.paymentId,
    invoiceUrl: charge.invoiceUrl,
    expiresAt: expiresAtDate.toISOString(),
    amountReais: chargeAmount,
    ...cashbackResponseFields(cashback),
  };
});

/** Cancela cobrança PIX pendente da parcela (sem cancelar a inscrição). */
export const cancelPendingTournamentRegistrationPix = onCall({
  region: CLIENT_FACING_REGIONS,
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
  const teamId = (registration.teamId as string | undefined)?.trim() ?? "";
  let team: Record<string, unknown> | null = null;
  if (teamId) {
    const teamSnap = await db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`).get();
    if (!teamSnap.exists) {
      throw new HttpsError("not-found", "Equipe não encontrada");
    }
    team = teamSnap.data()!;
  }
  if (!registrationAthleteUids(registration, team).includes(callerUid)) {
    throw new HttpsError("permission-denied", "Você não é um dos atletas desta inscrição");
  }

  const sharePaidUids = sharePaidUidsFromRegistration(registration);
  if (sharePaidUids.includes(callerUid)) {
    throw new HttpsError("failed-precondition", "Sua parcela já foi paga.");
  }

  await cancelExistingPixPending(db, projectId, registrationId, callerUid);
  // O prazo da vaga NÃO é recalculado aqui. Ele era, enquanto a cobrança o
  // esticava: sem cobrança viva, "voltar ao que o elenco manda" desfazia a
  // esticada. Agora a cobrança nasce dentro do prazo e nunca o move — e um
  // recálculo aqui daria `agora + minutos`, um prazo NOVO em cheio. As duas
  // telas chamam esta função sozinhas quando o QR expira, então isso tornava o
  // prazo infinito justamente para quem deixou o tempo passar: expirava,
  // renovava, expirava de novo.
  return {registrationId, status: "cancelled"};
});

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
  const athleteUids = await loadTeamMemberUids(db, projectId, teamId);
  const recipients = athleteUids.filter((uid) => uid !== confirmedByUid);
  const teamBody =
    athleteUids.length > 2
      ? "Sua equipe concluiu a inscrição. Toque para ver o comprovante."
      : "Sua dupla concluiu a inscrição. Toque para ver o comprovante.";
  const encodedCategoryName = encodeURIComponent(categoryId);
  const url =
    `/torneios/${tournamentId}/inscricao/sucesso?registrationId=${registrationId}` +
    `&categoryName=${encodedCategoryName}`;

  await Promise.all(
    recipients.map((uid) =>
      deliverNotificationToUser({
        userId: uid,
        title: "Inscricao confirmada",
        body: teamBody,
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

/** Avisa quem opera o torneio que uma dupla declarou ter pago direto no Pix do organizador.
 *
 *  Só dispara quando os DOIS atletas declararam: é quando existe o valor cheio para bater no
 *  extrato. Avisar a cada declaração individual dobraria o volume sem dar o que conferir.
 *
 *  O modo `directWithOrganizer` não tem webhook — ninguém verifica se o dinheiro caiu. Sem este
 *  aviso a declaração morre no doc, que é o que acontecia antes: o portal marcava a inscrição
 *  como paga e o organizador nunca soubera que precisava conferir. */
export async function notifyOrganizersPaymentDeclared({
  db,
  registrationId,
  tournamentId,
  tournamentData,
  categoryId,
  teamName,
}: {
  db: Firestore;
  registrationId: string;
  tournamentId: string;
  tournamentData: Record<string, unknown>;
  categoryId: string;
  teamName: string | null;
}): Promise<void> {
  const recipients = await tournamentManagerUids(db, tournamentId, tournamentData);
  if (recipients.length === 0) return;

  const category = findCategory(tournamentData, categoryId);
  const categoryName = String(
    category?.categoryName ?? category?.name ?? categoryId ?? "",
  ).trim();
  const who = teamName?.trim() || "Uma dupla";
  const where = categoryName ? ` em ${categoryName}` : "";

  await Promise.all(
    recipients.map((uid) =>
      deliverNotificationToUser({
        userId: uid,
        title: "Pagamento a conferir",
        body: `${who} declarou que pagou a inscrição${where}. Confira o recebimento e confirme.`,
        type: "tournament_payment_declared",
        data: {
          tournamentId,
          registrationId,
          categoryId,
          ...organizerTournamentNotificationLinks(tournamentId),
        },
      }),
    ),
  );
}

/** Confirma inscrição gratuita (taxa zero) sem PIX. */
export const confirmFreeTournamentRegistration = onCall({
  region: CLIENT_FACING_REGIONS,
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

  const tournamentData = await assertTournamentAcceptsRegistration(
    db,
    projectId,
    tournamentId,
    categoryId,
    // Esta inscrição já ocupa vaga: contá-la contra si mesma jogaria na fila
    // justamente quem está confirmando a vaga que já é dele.
    {occupancyExcludesRegistrationId: registrationId},
  );

  const shouldWaitlist =
    (tournamentData as Record<string, unknown>).__shouldWaitlist === true;

  // Solo novo (free) não tem equipe ainda: identifica pela inscrição.
  let team: Record<string, unknown> | null = null;
  if (teamId) {
    const teamSnap = await db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`).get();
    if (!teamSnap.exists) {
      throw new HttpsError("not-found", "Equipe não encontrada");
    }
    team = teamSnap.data()!;
  }
  const teamUids = registrationAthleteUids(registration, team);
  if (!teamUids.includes(callerUid)) {
    throw new HttpsError("permission-denied", "Você não é um dos atletas desta inscrição");
  }

  await assertTeamLevelEligibility({
    db,
    tournament: tournamentData,
    category: findCategory(tournamentData, categoryId),
    uids: teamUids,
  });
  await assertTeamAgeEligibility({
    db,
    tournament: tournamentData,
    category: findCategory(tournamentData, categoryId),
    uids: teamUids,
  });

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

  const updatedSharePaidUids = [...sharePaidUids, callerUid];
  const wasPaidBefore = registration.isPaid === true;
  // Elenco incompleto nunca conclui sozinho; só quando a dupla/equipe fechar.
  const isPaid = isFreeRegistrationFullyConfirmed(
    teamUids,
    updatedSharePaidUids,
    registrationTeamSize(registration, findCategory(tournamentData, categoryId)),
  );

  await registrationRef.update({
    sharePaidUids: FieldValue.arrayUnion(callerUid),
    isPaid,
    ...(shouldWaitlist ? {waitlist: true} : {}),
    // Só a inscrição FECHADA perde o prazo. A confirmação de um atleta só não
    // paga vaga nenhuma — categoria gratuita não tem dinheiro envolvido — e
    // apagar o campo aqui prendia a vaga para sempre com a dupla incompleta,
    // justamente o que o prazo veio resolver. Incompleta, o relógio que já
    // estava correndo segue de pé, intocado.
    ...(isPaid ? registrationHoldClearedFields() : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (!wasPaidBefore && isPaid && teamId) {
    try {
      await markTeamRegistrationPaid(db, projectId, teamId);
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

/** Reserva vaga em torneio com pagamento direto ao organizador (sem PIX).
 *
 *  `amountType: "full"` declara a inscrição INTEIRA de uma vez — é como o
 *  atleta sem dupla garante a vaga pagando o valor integral (o parceiro que
 *  aceitar o convite depois entra sem taxa). Só é aceito quando ainda não há
 *  pagamento parcial, espelhando o guard do PIX in-app. */
export const reserveDirectOrganizerRegistration = onCall({
  region: CLIENT_FACING_REGIONS,
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Faça login para reservar sua vaga.");
  }

  const data = (request.data ?? {}) as {
    registrationId?: string;
    amountType?: string;
  };
  const amountType: "share" | "full" =
    data.amountType === "full" ? "full" : "share";
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
    throw new HttpsError("failed-precondition", "Esta inscrição já foi confirmada");
  }

  const sharePaidUids = sharePaidUidsFromRegistration(registration);
  if (sharePaidUids.includes(callerUid)) {
    throw new HttpsError("failed-precondition", "Você já reservou sua vaga.");
  }

  // Mesmo guard do PIX in-app: 'full' com parcela já declarada cobraria a mais.
  if (
    amountType === "full" &&
    !canChargeTournamentFull({
      paidAmount: Number(registration.paidAmount) || 0,
      sharePaidUids,
    })
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Já há pagamento parcial nesta inscrição; informe apenas a parcela restante.",
    );
  }

  const teamId = registration.teamId as string;
  const tournamentId = registration.tournamentId as string;
  const categoryId = registration.categoryId as string;

  const tournamentData = await assertTournamentAcceptsRegistration(
    db,
    projectId,
    tournamentId,
    categoryId,
    {
      // Esta inscrição já ocupa vaga: contá-la contra si mesma jogaria na fila
      // justamente quem está confirmando a vaga que já é dele.
      occupancyExcludesRegistrationId: registrationId,
      // Inscrita pelo organizador: o prazo do torneio não vale para declará-la.
      allowClosedRegistration: isOrganizerRegistered(registration),
    },
  );

  if (!isDirectWithOrganizerPaymentMode(tournamentData.paymentMode)) {
    throw new HttpsError(
      "failed-precondition",
      "Este torneio não usa pagamento direto com o organizador.",
    );
  }

  const shouldWaitlist =
    (tournamentData as Record<string, unknown>).__shouldWaitlist === true;

  // Solo novo (direto) não tem equipe ainda: identifica pela inscrição.
  let team: Record<string, unknown> | null = null;
  if (teamId) {
    const teamSnap = await db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`).get();
    if (!teamSnap.exists) {
      throw new HttpsError("not-found", "Equipe não encontrada");
    }
    team = teamSnap.data()!;
  }
  const teamUids = registrationAthleteUids(registration, team);
  if (!teamUids.includes(callerUid)) {
    throw new HttpsError("permission-denied", "Você não é um dos atletas desta inscrição");
  }

  await assertTeamLevelEligibility({
    db,
    tournament: tournamentData,
    category: findCategory(tournamentData, categoryId),
    uids: teamUids,
  });
  await assertTeamAgeEligibility({
    db,
    tournament: tournamentData,
    category: findCategory(tournamentData, categoryId),
    uids: teamUids,
  });

  const {entryFee} = await loadTournamentEntryFee(
    db,
    projectId,
    tournamentId,
    categoryId,
  );
  if (entryFee <= 0) {
    throw new HttpsError(
      "failed-precondition",
      "Esta categoria é gratuita. Use a confirmação sem pagamento.",
    );
  }

  const {uidsToMark, registrationClosed: bothAthletesReserved} =
    resolveDirectReservationMarks({
      amountType,
      callerUid,
      teamUids,
      sharePaidUids,
      expectedSize: registrationTeamSize(
        registration,
        findCategory(tournamentData, categoryId),
      ),
    });

  await registrationRef.update({
    sharePaidUids: FieldValue.arrayUnion(...uidsToMark),
    isPaid: bothAthletesReserved,
    paymentChannel: "directOrganizer",
    // Entra na fila de conferência do organizador só quando a inscrição fecha — é quando existe
    // o valor cheio para bater no extrato (a dupla declarou, ou um atleta declarou o integral).
    // O portal deriva o selo "A conferir" deste campo (e não de `paymentChannel`) para que
    // inscrições diretas ANTERIORES a este fluxo não apareçam retroativamente como pendentes de
    // uma conferência que ninguém vai fazer.
    ...(bothAthletesReserved ? {declaredPaidAt: FieldValue.serverTimestamp()} : {}),
    ...(shouldWaitlist ? {waitlist: true} : {}),
    // Só a inscrição FECHADA perde o prazo — a dupla inteira declarou, ou um
    // atleta declarou o integral. A declaração de PARCELA não basta: é honra,
    // sem webhook e sem dinheiro na plataforma (nem entra na fila "A conferir"
    // do organizador, que só olha `declaredPaidAt`). Apagar o campo nela
    // prendia a vaga para sempre com o elenco ainda incompleto. Quem receber a
    // baixa do organizador vira imune por `organizerConfirmedShareUids`.
    ...(bothAthletesReserved ? registrationHoldClearedFields() : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (bothAthletesReserved) {
    try {
      await notifyOrganizersPaymentDeclared({
        db,
        registrationId,
        tournamentId,
        tournamentData,
        categoryId,
        teamName: typeof team?.teamName === "string" ? team.teamName : null,
      });
    } catch (notifyError) {
      logger.warn(
        `Falha ao avisar organizador da declaração de pagamento ${registrationId}`,
        notifyError,
      );
    }
  }

  if (bothAthletesReserved && teamId) {
    try {
      await markTeamRegistrationPaid(db, projectId, teamId);
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
        `Falha ao notificar reserva direta ${registrationId}`,
        notifyError,
      );
    }
  }

  return {
    registrationId,
    reserved: true,
    bothAthletesReserved,
  };
});
