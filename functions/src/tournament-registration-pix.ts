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
  extendRegistrationHoldForPix,
  refreshRegistrationHold,
  registrationHoldClearedFields,
} from "./tournament-registration-hold-ops";
import {
  TOURNAMENT_REGISTRATION_PIX_EXPIRY_MINUTES,
} from "./arena-booking-payment-constants";
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
  MIN_TEAM_CATEGORY_SIZE,
  computeTeamMemberShareReais,
  registrationTeamSize,
} from "./tournament-team-category";
import {
  loadTeamMemberUids,
  setTeamGenderWhenRegistrationPaid,
} from "./tournament-team-roster";
import {
  deliverNotificationToUser,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_SUBJECT,
} from "./notification-delivery";
import {tournamentManagerUids} from "./tournament-acl";
import {artifactsInscriptionsPath, artifactsTeamsPath, getFirebaseProjectId} from "./firebase-paths";

const pixPaymentSecrets = [...asaasArenaSecrets, PLATFORM_FEE_FIXED_BRL];




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
    amountType?: string;
  };
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

  const tournamentData = await assertTournamentAcceptsRegistration(
    db,
    projectId,
    tournamentId,
    categoryId,
    // Esta inscrição já ocupa vaga: contá-la contra si mesma jogaria na fila
    // justamente quem está confirmando a vaga que já é dele.
    {occupancyExcludesRegistrationId: registrationId},
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

  // Cota do atleta: metade (dupla) ou, em categoria de equipe, o RESTANTE
  // dividido pelos pagadores que faltam (some o problema de centavos e absorve
  // um "full" anterior).
  const regTeamSize = registrationTeamSize(
    registration,
    findCategory(tournamentData, categoryId),
  );
  const isTeamRegistration = regTeamSize >= MIN_TEAM_CATEGORY_SIZE;
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
    `Inscrição ${tournamentName} — ${categoryId} ` +
    (amountType === "full"
      ? isTeamRegistration
        ? "(equipe inteira)"
        : "(dupla inteira)"
      : "(sua parcela)");

  const externalReference = buildTournamentRegistrationExternalReference(
    registrationId,
    callerUid,
  );

  let charge;
  try {
    charge = await createAsaasPixCharge({
      customerId,
      valueReais: chargeAmount,
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
    amountReais: chargeAmount,
    amountType,
    status: "pending",
    payerUid: callerUid,
    paymentExpiresAt: Timestamp.fromDate(expiresAtDate),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // A vaga não pode cair com uma cobrança viva na mão do atleta.
  await extendRegistrationHoldForPix(
    db,
    projectId,
    registrationId,
    expiresAtDate,
  );

  return {
    paymentId: charge.paymentId,
    qrCode: charge.qrCode,
    qrCodeBase64: charge.qrCodeBase64,
    expiresAt: expiresAtDate.toISOString(),
    amountReais: chargeAmount,
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
  // Sem cobrança viva, o prazo volta ao que o estado do elenco manda.
  await refreshRegistrationHold(db, projectId, registrationId);
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
async function notifyOrganizersPaymentDeclared({
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
          url: `/painel/eventos/${tournamentId}/inscricoes`,
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
    // Confirmada: a vaga deixa de ter prazo.
    ...registrationHoldClearedFields(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (!wasPaidBefore && isPaid && teamId) {
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

/** Reserva vaga em torneio com pagamento direto ao organizador (sem PIX).
 *
 *  `amountType: "full"` declara a inscrição INTEIRA de uma vez — é como o
 *  atleta sem dupla garante a vaga pagando o valor integral (o parceiro que
 *  aceitar o convite depois entra sem taxa). Só é aceito quando ainda não há
 *  pagamento parcial, espelhando o guard do PIX in-app. */
export const reserveDirectOrganizerRegistration = onCall({
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
    // Esta inscrição já ocupa vaga: contá-la contra si mesma jogaria na fila
    // justamente quem está confirmando a vaga que já é dele.
    {occupancyExcludesRegistrationId: registrationId},
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
    // Declarou pagamento: a vaga deixa de ter prazo.
    ...registrationHoldClearedFields(),
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
