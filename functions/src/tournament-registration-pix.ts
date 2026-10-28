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
import {assertTeamAgeEligibility} from "./category-age-eligibility";
import {
  assertTournamentAcceptsRegistration,
  findCategory,
  loadTournamentData,
  resolveCategoryEntryFee,
  resolveCategoryLabel,
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
import {resolveRegistrationAttribution, type ResolvedAttribution} from "./squad-attribution";
import {followerDiscountFor, recordChargeDiscount, recordCommissionForCharge} from "./squad-commission-lifecycle";
import {discountFeeCapCents, tournamentFeeRule} from "./squad-fee-cap";
import {
  claimFreeShare,
  creditFreeShare,
  hasFreeShare,
  perkDiscountCents,
  recordPerkDiscount,
  resolveOwnPerk,
} from "./squad-own-perk";
import {
  PIX_CANCELLED_REGISTRATION_ALREADY_PAID,
  cancelOpenPixPendingCharges,
} from "./tournament-registration-pix-cancel";
import {athleteFeeReais, type FeeRule} from "./tournament-fees";

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
  /** Desconto do código de embaixador (NexaSquad), já fora do cobrado. */
  squadDiscountReais?: number;
  /** Desconto do próprio embaixador na parcela dele (benefício "Inscrições" do NexaSquad). */
  squadPerkReais?: number;
  /** Parte da taxa da nexaGO paga pelo atleta, por cima do preço (ausente = organizador paga). */
  serviceFeeReais?: number;
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
  /** Código de embaixador do NexaSquad digitado no checkout (vence o link/QR). */
  squadCode?: string;
};

/** O que a comissão do Squad precisa da cobrança, resolvido antes de cobrar. */
interface SquadChargeContext {
  attribution: ResolvedAttribution;
  tournamentId: string;
  categoryName: string;
  teamName: string | null;
  /** Quem esta cobrança converte: só o pagador, ou todos quando paga a dupla/equipe inteira. */
  convertedUids: string[];
  /** Desconto do seguidor sobre o preço desta cobrança (sai da taxa da nexaGO). */
  discountCents: number;
  discountPct: number;
}

/** Tudo que uma cobrança precisa, já validado e resolvido no gateway. */
interface PreparedRegistrationCharge {
  db: Firestore;
  projectId: string;
  registrationId: string;
  amountType: "share" | "full";
  /** Preço desta cobrança (parcela ou inteira) — o que entra na inscrição e no caixa. */
  chargeAmount: number;
  /** Parte da taxa que o atleta paga por cima do preço (`athleteFeeReais`); 0 quando o organizador paga. */
  serviceFeeReais: number;
  customerId: string;
  description: string;
  externalReference: string;
  expiresAtDate: Date;
  tournamentName: string;
  squad: SquadChargeContext | null;
  /** Desconto do próprio embaixador ("Inscrições" do pacote) na parcela dele; 0 = nenhum. */
  perkCents: number;
  perkPct: number;
  tournamentId: string;
}

/**
 * A parcela que o atleta vai quitar, já validada: autenticação, elegibilidade,
 * vaga e valor da cota. Comum à cobrança (PIX e cartão) e à parcela grátis do
 * embaixador do NexaSquad, que não passa pelo gateway.
 */
async function resolveRegistrationCheckout(
  callerUid: string,
  data: RegistrationChargeRequest,
) {
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

  // Nível não é rechecado aqui: todo atleta desta inscrição passou pela régua ao
  // entrar, e subir de nível depois não tira ninguém da vaga
  // (athletesEnteringCategory).
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

  return {
    db, projectId, registrationId, registrationRef, registration, amountType, tournamentId, categoryId,
    tournamentData, organizerRegistered, shouldWaitlist, team, athleteUids, entryFee, tournamentName,
    regTeamSize, isTeamRegistration, shareAmount, chargeAmount,
  };
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
  const {
    db, projectId, registrationId, registration, amountType, tournamentId, categoryId, tournamentData,
    organizerRegistered, shouldWaitlist, team, athleteUids, tournamentName, regTeamSize,
    isTeamRegistration, shareAmount, chargeAmount,
  } = await resolveRegistrationCheckout(callerUid, data);
  const cpfFromRequest =
    typeof data.cpfCnpj === "string" ? data.cpfCnpj :
      (typeof data.cpf === "string" ? data.cpf : "");

  // Regra da taxa (`tournament-fees.ts`): diz quanto da taxa vai por cima do preço ("Quem paga") e
  // é o teto do desconto do Squad. Sem regra não dá para saber o valor a cobrar: melhor recusar do
  // que cobrar a menos e o organizador pagar a parte do atleta.
  let feeRule: FeeRule | null;
  try {
    feeRule = await tournamentFeeRule(db, tournamentId, tournamentData as Record<string, unknown>);
  } catch (e) {
    logger.error("prepareRegistrationCharge: taxa do torneio indisponível", {registrationId, e});
    throw new HttpsError("unavailable", "Não foi possível calcular o valor agora. Tente novamente.");
  }
  const serviceFeeReais = feeRule ? athleteFeeReais(chargeAmount, feeRule) : 0;

  // Embaixador do NexaSquad: código digitado errado ou autoindicação para aqui, antes de cobrar,
  // para o atleta corrigir. Link/QR nunca derruba o checkout.
  let squad: SquadChargeContext | null = null;
  try {
    const attribution = await resolveRegistrationAttribution(
      db,
      {payerUid: callerUid, athleteUids, typedCode: data.squadCode},
      new Date(),
    );
    if (attribution) {
      const teamName = typeof team?.teamName === "string" ? team.teamName :
        typeof registration.teamName === "string" ? registration.teamName : null;
      // O desconto sai da taxa da nexaGO: nunca passa da taxa desta cobrança.
      const discount = await followerDiscountFor(db, {
        attribution,
        payerUid: callerUid,
        registrationId,
        priceCents: Math.round(chargeAmount * 100),
        feeCapCents: discountFeeCapCents(chargeAmount, feeRule),
      });
      squad = {
        attribution,
        tournamentId,
        categoryName: resolveCategoryLabel(tournamentData, categoryId),
        teamName,
        convertedUids: amountType === "full" ? athleteUids : [callerUid],
        discountCents: discount.cents,
        discountPct: discount.pct,
      };
    }
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    logger.warn("prepareRegistrationCharge: atribuição do Squad indisponível", e);
  }

  // Embaixador pagando a própria inscrição: % do pacote na parcela dele, bancado pela nexaGO como o
  // desconto do seguidor. Gratuidade não entra aqui: ela tem o caminho próprio, sem cobrança.
  let perkCents = 0;
  let perkPct = 0;
  try {
    const own = await resolveOwnPerk(db, callerUid, new Date());
    if (own?.type === "discount") {
      perkCents = perkDiscountCents(
        own.pct,
        Math.round(shareAmount * 100),
        Math.round(chargeAmount * 100),
        squad?.discountCents ?? 0,
      );
      perkPct = perkCents > 0 ? own.pct : 0;
    }
  } catch (e) {
    logger.warn("prepareRegistrationCharge: benefício do embaixador indisponível", e);
  }

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
    serviceFeeReais,
    customerId,
    description,
    externalReference,
    expiresAtDate,
    tournamentName,
    squad,
    perkCents,
    perkPct,
    tournamentId,
  };
}

/** O que as contas da cobrança usam de uma cobrança preparada. */
type ChargeAmounts = Pick<PreparedRegistrationCharge, "chargeAmount" | "serviceFeeReais"> & {
  squad: Pick<SquadChargeContext, "discountCents"> | null;
  /** Ausente nas contas antigas = 0. */
  perkCents?: number;
};

/** Centavos da parte da taxa paga pelo atleta. */
function serviceFeeCents(prepared: ChargeAmounts): number {
  return Math.round(prepared.serviceFeeReais * 100);
}

/**
 * O que o atleta deve nesta cobrança antes do cashback: preço + parte da taxa dele − desconto do
 * seguidor − desconto do embaixador na própria parcela (o cashback incide sobre isto).
 */
export function dueAfterSquadDiscount(prepared: ChargeAmounts): number {
  const discount = (prepared.squad?.discountCents ?? 0) + (prepared.perkCents ?? 0);
  return Math.round(prepared.chargeAmount * 100 + serviceFeeCents(prepared) - discount) / 100;
}

/** Com desconto ou taxa por cima a cobrança é outra: chave própria, para o Asaas não devolver a antiga. */
export function chargeIdempotencySuffix(prepared: ChargeAmounts): string {
  const discount = prepared.squad?.discountCents ?? 0;
  const perk = prepared.perkCents ?? 0;
  const fee = serviceFeeCents(prepared);
  return (discount > 0 ? `-sq${discount}` : "") + (perk > 0 ? `-pk${perk}` : "") + (fee > 0 ? `-tx${fee}` : "");
}

/** Desconto do embaixador na resposta da cobrança (só quando houve). */
function perkResponseFields(prepared: PreparedRegistrationCharge): {squadPerkReais?: number} {
  return prepared.perkCents > 0 ? {squadPerkReais: prepared.perkCents / 100} : {};
}

/**
 * Registra o desconto do embaixador por `paymentId` (o webhook soma ao bruto). Melhor esforço, como a
 * comissão: o desconto também vai no `pixPending`, que o webhook usa se este registro faltar.
 */
async function recordPerkQuietly(prepared: PreparedRegistrationCharge, payerUid: string, paymentId: string): Promise<void> {
  if (prepared.perkCents <= 0) return;
  try {
    await recordPerkDiscount(prepared.db, {
      paymentId,
      uid: payerUid,
      registrationId: prepared.registrationId,
      tournamentId: prepared.tournamentId,
      cents: prepared.perkCents,
      pct: prepared.perkPct,
    }, new Date());
  } catch (e) {
    logger.error("Desconto do embaixador não registrado na cobrança", {registrationId: prepared.registrationId, paymentId, e});
  }
}

/** Campos da parte do atleta na resposta da cobrança (só quando ele paga algo). */
function serviceFeeResponseFields(prepared: ChargeAmounts): {serviceFeeReais?: number} {
  return prepared.serviceFeeReais > 0 ? {serviceFeeReais: prepared.serviceFeeReais} : {};
}

/**
 * Desconto do seguidor (por `paymentId`) e comissão pendente do embaixador, depois que a cobrança
 * existe. Melhor esforço: a cobrança já foi criada e o atleta precisa do QR/checkout mesmo que
 * isto falhe — o desconto também está no `pixPending`, que o webhook usa se este registro faltar.
 */
async function recordSquadCommissionQuietly(
  prepared: PreparedRegistrationCharge,
  payerUid: string,
  paymentId: string,
  chargedReais: number,
): Promise<void> {
  if (!prepared.squad) return;
  try {
    if (prepared.squad.discountCents > 0) {
      await recordChargeDiscount(prepared.db, {
        paymentId,
        registrationId: prepared.registrationId,
        payerUid,
        ambassadorId: prepared.squad.attribution.ambassador.uid,
        cents: prepared.squad.discountCents,
        pct: prepared.squad.discountPct,
      }, new Date());
    }
    await recordCommissionForCharge(prepared.db, {
      attribution: prepared.squad.attribution,
      registrationId: prepared.registrationId,
      tournamentId: prepared.squad.tournamentId,
      tournamentName: prepared.tournamentName,
      categoryName: prepared.squad.categoryName,
      teamName: prepared.squad.teamName,
      paymentId,
      payerUid,
      convertedUids: prepared.squad.convertedUids,
      // A comissão é sobre a inscrição: a parte da taxa paga pelo atleta não entra.
      grossCents: Math.max(0, Math.round(chargedReais * 100) - serviceFeeCents(prepared)),
    }, new Date());
  } catch (e) {
    logger.error("Comissão do Squad não registrada na cobrança", {
      registrationId: prepared.registrationId,
      payerUid,
      paymentId,
      e,
    });
  }
}

export const createTournamentRegistrationPixPayment = onCall({
  region: CLIENT_FACING_REGIONS,
  secrets: pixPaymentSecrets,
}, async (request): Promise<PixPaymentResponse> => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Faça login para pagar.");
  }

  const prepared = await prepareRegistrationCharge(
    callerUid,
    (request.data ?? {}) as RegistrationChargeRequest,
    "PIX",
  );
  const {
    db, projectId, registrationId, amountType, chargeAmount,
    customerId, description, externalReference, expiresAtDate, tournamentName,
  } = prepared;

  const pendingDocRef = pixPendingRef(db, projectId, registrationId, callerUid);
  const cashback = await reserveCashbackForCharge(db, {
    uid: callerUid,
    useCashback: (request.data as RegistrationChargeRequest | undefined)?.useCashback,
    // O desconto do seguidor (NexaSquad) sai antes do cashback: o saldo cobre o que sobra
    // (inclusive a parte da taxa paga pelo atleta).
    priceReais: dueAfterSquadDiscount(prepared),
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
      // Com desconto a cobrança é outra: chave própria, para o Asaas não devolver a cheia.
      idempotencyKey: cashbackIdempotencyKey(
        `tournament-reg-pix-${registrationId}-${callerUid}${chargeIdempotencySuffix(prepared)}`,
        cashback.holdId,
      ),
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
    // Desconto do seguidor (NexaSquad): o webhook soma ao bruto para o organizador receber igual.
    squadDiscountCents: prepared.squad?.discountCents ?? 0,
    // Desconto do embaixador na própria parcela: idem.
    ...(prepared.perkCents > 0 ? {squadPerkCents: prepared.perkCents} : {}),
    // Parte da taxa paga pelo atleta: o webhook tira do bruto (o caixa e a parcela são sobre o preço).
    ...(serviceFeeCents(prepared) > 0 ? {serviceFeeCents: serviceFeeCents(prepared)} : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await recordPerkQuietly(prepared, callerUid, charge.paymentId);
  await recordSquadCommissionQuietly(prepared, callerUid, charge.paymentId, cashback.chargeReais);

  return {
    paymentId: charge.paymentId,
    qrCode: charge.qrCode,
    qrCodeBase64: charge.qrCodeBase64,
    expiresAt: expiresAtDate.toISOString(),
    amountReais: chargeAmount,
    ...cashbackResponseFields(cashback),
    ...(prepared.squad?.discountCents ? {squadDiscountReais: prepared.squad.discountCents / 100} : {}),
    ...perkResponseFields(prepared),
    ...serviceFeeResponseFields(prepared),
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
  /** Desconto do código de embaixador (NexaSquad), já fora do cobrado. */
  squadDiscountReais?: number;
  /** Desconto do próprio embaixador na parcela dele (benefício "Inscrições" do NexaSquad). */
  squadPerkReais?: number;
  /** Parte da taxa da nexaGO paga pelo atleta, por cima do preço (ausente = organizador paga). */
  serviceFeeReais?: number;
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

  const prepared = await prepareRegistrationCharge(
    callerUid,
    (request.data ?? {}) as RegistrationChargeRequest,
    "cartão",
  );
  const {
    db, projectId, registrationId, amountType, chargeAmount,
    customerId, description, externalReference, expiresAtDate, tournamentName,
  } = prepared;

  const pendingDocRef = pixPendingRef(db, projectId, registrationId, callerUid);
  const cashback = await reserveCashbackForCharge(db, {
    uid: callerUid,
    useCashback: (request.data as RegistrationChargeRequest | undefined)?.useCashback,
    // O desconto do seguidor (NexaSquad) sai antes do cashback: o saldo cobre o que sobra
    // (inclusive a parte da taxa paga pelo atleta).
    priceReais: dueAfterSquadDiscount(prepared),
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
      // Com desconto a cobrança é outra: chave própria, para o Asaas não devolver a cheia.
      idempotencyKey: cashbackIdempotencyKey(
        `tournament-reg-card-${registrationId}-${callerUid}${chargeIdempotencySuffix(prepared)}`,
        cashback.holdId,
      ),
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
    // Desconto do seguidor (NexaSquad): o webhook soma ao bruto para o organizador receber igual.
    squadDiscountCents: prepared.squad?.discountCents ?? 0,
    // Desconto do embaixador na própria parcela: idem.
    ...(prepared.perkCents > 0 ? {squadPerkCents: prepared.perkCents} : {}),
    // Parte da taxa paga pelo atleta: o webhook tira do bruto (o caixa e a parcela são sobre o preço).
    ...(serviceFeeCents(prepared) > 0 ? {serviceFeeCents: serviceFeeCents(prepared)} : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await recordPerkQuietly(prepared, callerUid, charge.paymentId);
  await recordSquadCommissionQuietly(prepared, callerUid, charge.paymentId, cashback.chargeReais);

  return {
    paymentId: charge.paymentId,
    invoiceUrl: charge.invoiceUrl,
    expiresAt: expiresAtDate.toISOString(),
    amountReais: chargeAmount,
    ...cashbackResponseFields(cashback),
    ...(prepared.squad?.discountCents ? {squadDiscountReais: prepared.squad.discountCents / 100} : {}),
    ...perkResponseFields(prepared),
    ...serviceFeeResponseFields(prepared),
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

  // Nível não é rechecado aqui: todo atleta desta inscrição passou pela régua ao
  // entrar, e subir de nível depois não tira ninguém da vaga
  // (athletesEnteringCategory).
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

/**
 * NexaSquad: parcela grátis do embaixador ("Inscrições" do pacote: N por mês). Confirma a parcela
 * dele sem cobrança e credita o organizador como se ela tivesse sido paga — quem banca é a nexaGO.
 * Só a própria parcela: pagando a dupla/equipe inteira, o embaixador usa a cobrança normal.
 */
export const confirmSquadFreeTournamentRegistration = onCall({
  region: CLIENT_FACING_REGIONS,
  secrets: pixPaymentSecrets,
}, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Faça login para confirmar a inscrição.");
  }
  const data = (request.data ?? {}) as RegistrationChargeRequest;
  const checkout = await resolveRegistrationCheckout(callerUid, {registrationId: data.registrationId, amountType: "share"});
  const {db, projectId, registrationId, registrationRef, tournamentId, categoryId, tournamentData} = checkout;
  const now = new Date();
  if (!hasFreeShare(await resolveOwnPerk(db, callerUid, now))) {
    throw new HttpsError("failed-precondition", "Você não tem inscrição grátis do NexaSquad disponível.");
  }

  // Cobrança aberta desta parcela morre antes: paga depois, viraria pagamento em dobro.
  await cancelExistingPixPending(db, projectId, registrationId, callerUid);
  const claim = await claimFreeShare(db, {
    uid: callerUid,
    registrationRef,
    tournamentId,
    entryFee: checkout.entryFee,
    shareReais: checkout.shareAmount,
    isTeamRegistration: checkout.isTeamRegistration,
    waitlist: checkout.shouldWaitlist,
  }, now);

  try {
    await creditFreeShare(db, {
      tournamentId,
      tournament: tournamentData as Record<string, unknown>,
      registrationId,
      payerUid: callerUid,
      claim,
    });
  } catch (e) {
    // A vaga já está garantida; o crédito fica marcável pelo uso (`walletCreditedAt` ausente).
    logger.error("Parcela grátis do Squad: caixa do torneio não creditado", {registrationId, useId: claim.useRef.id, e});
  }

  if (claim.isPaid) {
    const teamId = typeof checkout.registration.teamId === "string" ? checkout.registration.teamId : "";
    // Inscrição fechada: o PIX aberto do parceiro, se pago, cairia como duplicado sem estorno automático.
    await cancelOpenPixPendingCharges({
      registrationRef,
      reason: PIX_CANCELLED_REGISTRATION_ALREADY_PAID,
      skipUid: callerUid,
    });
    if (teamId) {
      try {
        await markTeamRegistrationPaid(db, projectId, teamId);
      } catch (genderError) {
        logger.warn(`Falha ao definir gender da equipe ${teamId} (registration ${registrationId})`, genderError);
      }
      try {
        await notifyRegistrationFullyConfirmed({
          db, projectId, registrationId, tournamentId, categoryId, teamId, confirmedByUid: callerUid,
        });
      } catch (notifyError) {
        logger.warn(`Falha ao notificar inscrição ${registrationId} (parcela grátis do Squad)`, notifyError);
      }
    }
  }

  return {registrationId, isPaid: claim.isPaid, squadFreeReais: claim.shareReais};
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

  // Nível não é rechecado aqui: todo atleta desta inscrição passou pela régua ao
  // entrar, e subir de nível depois não tira ninguém da vaga
  // (athletesEnteringCategory).
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
