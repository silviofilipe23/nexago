/**
 * Processamento de webhooks Asaas para reservas de arena (`arenaBookings`).
 */

import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {ARENA_BOOKING_PAYMENT_REF_PREFIX} from "./arena-booking-payment-constants";
import {ARENA_BOOKING_PRICING, readArenaBookingChargeTotalReais} from "./arena-booking-pricing";
import {arenaSquadDiscountCents, markArenaSquadDiscountConfirmedQuietly} from "./squad-arena-discount";
import {
  arenaBookingNetReais,
  creditArenaWalletFromBooking,
  creditArenaWalletFromBookingPayment,
  holdArenaAwaitingSettlement,
  releaseArenaAwaitingSettlement,
} from "./arena-wallet";
import {resolveGatewayFeeReais} from "./asaas-gateway-fee";
import {
  parseRegistrationBillingType,
  resolvePaymentPhases,
  type RegistrationBillingType,
} from "./registration-payment-phases";
import {roundMoney} from "./mercadopago-arena-helpers";
import {resolveArenaBookingFeePercent} from "./arena-entitlement";
import {computePlatformFeeReais} from "./platform-fees";
import {releaseArenaBookingHold} from "./mercadopago-arena-booking-webhook";
import type {AsaasPaymentDetails} from "./asaas-booking-payment";
import {
  finalizeArenaBookingIfAllSharesResolved,
  parseArenaBookingShareExternalReference,
  supersededPaymentIdsOf,
} from "./arena-booking-split";
import {resolveAthleteCpfCnpj, resolveAthletePayerName} from "./asaas-customer";
import {CANCELED_BOOKING_STATUSES, normalizeBookingStatus} from "./slot-vacancy-alerts";
import {
  requestInvoiceForPaidBooking,
  shouldAttemptFiscalInvoice,
} from "./fiscal/payment-hooks";
import {
  DEFAULT_CASHBACK_CONFIG,
  readCashbackConfig,
  type CashbackConfig,
} from "./cashback-config";
import {bookingEventAtMs} from "./cashback-rules";
import {
  applyCashbackIntent,
  bookingCashbackLabel,
  buildCashbackIntent,
  cashbackIntentFields,
  intentHasWork,
  resolveCashbackForPayment,
} from "./cashback-intent";

const ARENA_BOOKINGS = "arenaBookings";
const ARENA_SLOTS = "arenaSlots";
const PAYMENT_SHARES = "paymentShares";

/** Não confirma reserva — aguarda RECEIVED ou evento negativo. */
const ASAAS_NON_TERMINAL_STATUSES = new Set([
  "PENDING",
  "AWAITING_RISK_ANALYSIS",
  "CONFIRMED",
]);

const ASAAS_PAID_STATUSES = new Set(["RECEIVED", "RECEIVED_IN_CASH"]);

const ASAAS_NEGATIVE_TERMINAL_STATUSES = new Set([
  "OVERDUE",
  "REFUNDED",
  "REFUND_REQUESTED",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
  "DUNNING_REQUESTED",
  "DUNNING_RECEIVED",
  "DELETED",
]);

/**
 * Nome e CPF do atleta pagador, para a nota fiscal. Mesma resolução usada na
 * cobrança PIX (resolveAthletePayerName + resolveAthleteCpfCnpj) — o webhook
 * não tem CPF em escopo, só o uid do titular/pagador.
 */
async function resolvePayerForInvoice(
  athleteId: string | undefined,
): Promise<{nome: string; cpfCnpj: string} | null> {
  if (!athleteId) return null;
  const nome = await resolveAthletePayerName(athleteId);
  try {
    const cpfCnpj = await resolveAthleteCpfCnpj(athleteId);
    return {nome, cpfCnpj};
  } catch {
    return null;
  }
}

/**
 * Doc de config indisponível não pode derrubar a confirmação: o lote de
 * confirmação ainda não foi gravado, o roteador responde 200 e o Asaas não
 * reentrega — a reserva paga ficaria `pending_payment`. Cai no padrão
 * (desligado): a reserva de saldo ainda é capturada, só o ganho desta rodada
 * não é calculado.
 */
async function readCashbackConfigOrOff(db: Firestore, context: string): Promise<CashbackConfig> {
  try {
    return await readCashbackConfig(db);
  } catch (e) {
    logger.error(
      `Asaas arena booking ${context}: falha ao ler appConfig/cashback ` +
      "— tratando como desligado nesta rodada",
      e,
    );
    return DEFAULT_CASHBACK_CONFIG;
  }
}

type ConfirmArenaBookingInput = {
  bookingRef: DocumentReference;
  booking: DocumentData;
  bookingId: string;
  paymentId: string;
  processedRef: DocumentReference;
  billingType: RegistrationBillingType;
  arenaId: string | null;
  cashPaid: number;
  paidOnline: number;
  dueOnsite: number;
  paymentStatus: "paid" | "partial";
  appliedCents: number;
  holdId: string | null;
  squadDiscountCents: number;
  platformFee: number;
};

/**
 * Fase de CONFIRMAÇÃO: reserva `confirmed`, slots `booked`, doc do pagamento
 * `approved` com `confirmedAt`, desconto do embaixador, cashback e nota fiscal.
 * Roda uma vez por pagamento — no PIX junto com o crédito, no cartão na
 * autorização. O crédito da carteira é a outra fase, fora daqui.
 */
async function confirmArenaBookingPayment(db: Firestore, input: ConfirmArenaBookingInput): Promise<void> {
  const {booking, bookingId, paymentId, processedRef, arenaId} = input;
  const intent = buildCashbackIntent({
    uid: typeof booking.athleteId === "string" ? booking.athleteId : "",
    sourceType: "booking",
    sourceId: bookingId,
    tournamentId: null,
    arenaId,
    label: bookingCashbackLabel(String(booking.arenaName ?? "Arena"), booking.date),
    eventAtMs: bookingEventAtMs(booking.date, booking.startTime) ?? Date.now(),
    cashReais: input.cashPaid,
    appliedCents: input.appliedCents,
    // O teto do cashback ganho é a taxa que sobrou depois do desconto do seguidor.
    feeReais: Math.max(0, roundMoney(input.platformFee - input.squadDiscountCents / 100)),
    holdId: input.holdId,
    config: await readCashbackConfigOrOff(db, bookingId),
  });

  const batch = db.batch();
  batch.update(input.bookingRef, {
    status: "confirmed",
    paymentStatus: input.paymentStatus,
    paymentChannel: input.billingType === "CREDIT_CARD" ? "card" : (booking.paymentChannel ?? "pix"),
    paymentProvider: "asaas",
    amountPaidOnlineReais: input.paidOnline,
    amountDueOnsiteReais: input.dueOnsite,
    asaasPaymentId: paymentId,
    asaasPaidAmount: input.cashPaid,
    cashbackAppliedReais: input.appliedCents / 100,
    squadDiscountReais: input.squadDiscountCents / 100,
    asaasPaidAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const slotsSnap = await db
    .collection(ARENA_SLOTS)
    .where("bookingId", "==", bookingId)
    .get();
  for (const doc of slotsSnap.docs) {
    batch.update(doc.ref, {
      status: "booked",
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  batch.set(processedRef, {
    kind: "arenaBooking",
    bookingId,
    outcome: "approved",
    billingType: input.billingType,
    confirmedAt: FieldValue.serverTimestamp(),
    processedAt: FieldValue.serverTimestamp(),
    ...(intentHasWork(intent) ? cashbackIntentFields(intent) : {}),
  }, {merge: true});

  await batch.commit();
  await markArenaSquadDiscountConfirmedQuietly(db, paymentId, input.squadDiscountCents, new Date());

  if (intentHasWork(intent)) {
    await applyCashbackIntent(db, processedRef, paymentId, Date.now());
  }

  if (!arenaId) return;
  try {
    // A resolução do pagador custa uma busca de nome + uma de CPF: só
    // vale a pena quando a arena realmente emite nota automaticamente.
    const athleteId = booking.athleteId as string | undefined;
    const payer = (await shouldAttemptFiscalInvoice(db, arenaId))
      ? await resolvePayerForInvoice(athleteId)
      : null;
    if (payer) {
      await requestInvoiceForPaidBooking(db, {
        arenaId,
        bookingId,
        asaasPaymentId: paymentId,
        grossReais: input.paidOnline,
        tomador: {nome: payer.nome, cpfCnpj: payer.cpfCnpj},
        tomadorUid: athleteId ?? null,
      });
    }
  } catch (fiscalErr) {
    logger.error(`Asaas arena booking ${bookingId}: fiscal request failed`, fiscalErr);
  }
}

export async function processArenaBookingAsaasNotification(
  db: Firestore,
  paymentId: string,
  payment: AsaasPaymentDetails,
  processedRef: DocumentReference,
): Promise<void> {
  const externalRef = (payment.externalReference || "").trim();
  if (!externalRef.startsWith(ARENA_BOOKING_PAYMENT_REF_PREFIX)) {
    return;
  }

  const processedSnap = await processedRef.get();
  const processed = processedSnap.data() ?? {};
  const outcome = typeof processed.outcome === "string" ? processed.outcome : "";
  // Desfecho terminal que não é "aprovado" (órfão, estorno marcado, recusado)
  // encerra o assunto, como sempre encerrou.
  if (processedSnap.exists && outcome !== "approved") {
    logger.info(`Asaas arena booking: payment ${paymentId} já processado`);
    return;
  }
  // Aprovado SEM marcador de fase é do acervo PIX: ali confirmação e crédito
  // sempre rodaram juntos, no mesmo evento.
  const legacyApproved = outcome === "approved" && processed.confirmedAt == null;
  const alreadyConfirmed = legacyApproved || processed.confirmedAt != null;
  const alreadyCredited = legacyApproved || processed.walletCreditedAt != null;
  const alreadyAwaitingSettlement = processed.awaitingSettlement != null;

  const bookingId = externalRef.slice(ARENA_BOOKING_PAYMENT_REF_PREFIX.length).trim();
  if (!bookingId) {
    logger.warn("Asaas arena booking: externalReference sem bookingId");
    return;
  }

  const status = (payment.status || "").toUpperCase();
  // Cartão: a autorização (`CONFIRMED`) garante o horário na hora; o dinheiro
  // só chega na liquidação (`RECEIVED`, ~D+32), e só então a carteira da arena
  // é creditada. PIX: as duas fases andam juntas no `RECEIVED`.
  const billingType = parseRegistrationBillingType(payment.billingType);
  const phases = resolvePaymentPhases({
    billingType,
    status,
    alreadyConfirmed,
    alreadyCredited,
    alreadyAwaitingSettlement,
  });
  const negative = ASAAS_NEGATIVE_TERMINAL_STATUSES.has(status);

  if (!phases.confirm && !phases.credit && !phases.awaitSettlement && !negative) {
    logger.info(
      `Asaas arena booking ${bookingId}: pagamento ${paymentId} ainda ${status} — aguardando`,
    );
    return;
  }

  if (negative && alreadyConfirmed) {
    // Estorno ou chargeback DEPOIS do horário garantido (cartão). Não há
    // desfazimento automático — mesma lacuna do estorno de PIX —, mas a reserva
    // não é cancelada por baixo do atleta, o valor sai do "a liberar" (a arena
    // não espera um dinheiro que não vem) e o caso grita no log.
    if (alreadyAwaitingSettlement && !alreadyCredited) {
      try {
        await releaseArenaAwaitingSettlement(db, processedRef, status);
      } catch (awaitErr) {
        logger.error(`Asaas arena booking ${bookingId}: falha ao tirar ${paymentId} do "a liberar"`, awaitErr);
      }
    }
    // Cartão: estorno/chargeback depois do horário garantido é caso para uma
    // pessoa. PIX: o acervo sempre ignorou esse evento em silêncio (estorno
    // feito no painel do Asaas) — fica informativo para não virar ruído.
    const log = billingType === "CREDIT_CARD" ? logger.error : logger.info;
    log(
      `Asaas arena booking ${bookingId}: pagamento ${paymentId} virou ${status} DEPOIS de ` +
      "confirmar a reserva — reserva e carteira seguem como estão, resolver à mão",
      {bookingId, paymentId, status, billingType},
    );
    return;
  }

  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) {
    logger.warn(`Asaas arena booking: reserva ${bookingId} não encontrada`);
    if (processedSnap.exists) return;
    await processedRef.set({
      kind: "arenaBooking",
      bookingId,
      outcome: "orphan",
      paymentStatus: status,
      processedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  const booking = bookingSnap.data()!;

  // Reserva dividida: o pagamento passou para as fatias (`arenaBookingShare:`) e a
  // cobrança da reserva inteira foi substituída. Três casos:
  // 1. Divisão concluída (`hasSplitShares`) + evento pago: confirmar e creditar seria
  //    cobrança em dobro, então só marca para estorno (`stale_charge_after_split`).
  // 2. Divisão concluída OU em andamento (cobrança já em `supersededAsaasPaymentIds`,
  //    gravado antes do cancelamento na Asaas — cobre a corrida entre esse cancelamento
  //    e este webhook chegando primeiro) + evento negativo (vencida/removida): não
  //    cancela a reserva que as fatias estão pagando (ou que a divisão ainda pode
  //    desfazer), e NÃO grava "processado", para um RECEIVED tardio da mesma cobrança
  //    ainda cair no caso 1 como estorno.
  // 3. Divisão em andamento + evento pago: a cobrança original não pode ter sido
  //    cancelada (Asaas recusa cancelar PIX já pago), então Task 1 vai fazer rollback
  //    da divisão (fatias canceladas, reserva volta a depender só desta cobrança) — o
  //    pagamento segue o fluxo normal de confirmação abaixo, em vez de cair aqui.
  const splitDone = booking.hasSplitShares === true;
  const splitInProgress = !splitDone && supersededPaymentIdsOf(booking).includes(paymentId);
  // "Pago" aqui é o que CONFIRMA a reserva: liquidação do PIX ou autorização
  // do cartão. Com a reserva já confirmada (crédito do cartão chegando), as
  // guardas de divisão e de cancelamento abaixo não se aplicam.
  const paid = phases.confirm;
  if (splitDone && paid) {
    const paidValue = roundMoney(Number(payment.value) || 0);
    logger.error(
      `Asaas arena booking ${bookingId}: pagamento ${paymentId} da cobrança ` +
      "substituída pela divisão — estorno necessário",
      {paymentId, bookingId, paidValue},
    );
    await processedRef.set({
      kind: "arenaBooking",
      bookingId,
      outcome: "stale_charge_after_split",
      refundRequired: true,
      paidValue,
      asaasPaymentStatus: status,
      processedAt: FieldValue.serverTimestamp(),
    });
    return;
  }
  if ((splitDone || splitInProgress) && !paid) {
    logger.info(
      `Asaas arena booking ${bookingId}: evento ${status} da cobrança ${paymentId} ` +
      "substituída pela divisão — ignorado",
    );
    return;
  }
  // splitInProgress && paid: segue para o fluxo normal de confirmação abaixo.

  // Pago depois do cancelamento: cancelar `pending_payment` com escrita direta (app
  // antigo do atleta, gestor da arena) deixa o PIX aberto na Asaas, e o trigger de
  // slot já liberou locks e horário.
  // Confirmar aqui daria uma reserva paga sem quadra segura (risco de reserva em
  // dobro), então só marca para estorno — mesmo padrão do `stale_charge_after_split`.
  const bookingStatus = normalizeBookingStatus(booking.status);
  if (paid && CANCELED_BOOKING_STATUSES.has(bookingStatus)) {
    const paidValue = roundMoney(Number(payment.value) || 0);
    logger.error(
      `Asaas arena booking ${bookingId}: pagamento ${paymentId} chegou com a reserva ` +
      "já cancelada — estorno necessário",
      {paymentId, bookingId, paidValue, bookingStatus},
    );
    await processedRef.set({
      kind: "arenaBooking",
      bookingId,
      outcome: "paid_after_cancel",
      refundRequired: true,
      paidValue,
      bookingStatus,
      asaasPaymentStatus: status,
      processedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  // Reserva já paga por OUTRA cobrança (PIX com aviso atrasado e o atleta
  // pagou o cartão também, ou o contrário): confirmar de novo trocaria o
  // pagamento da reserva e creditaria a arena duas vezes. Só marca o estorno.
  const bookingPaymentStatus = String(booking.paymentStatus ?? "").toLowerCase();
  const confirmedByOther = typeof booking.asaasPaymentId === "string" &&
    booking.asaasPaymentId.trim() !== "" && booking.asaasPaymentId !== paymentId;
  if (
    phases.confirm && bookingStatus === "confirmed" && confirmedByOther &&
    (bookingPaymentStatus === "paid" || bookingPaymentStatus === "partial")
  ) {
    const paidValue = roundMoney(Number(payment.value) || 0);
    logger.error(
      `Asaas arena booking ${bookingId}: pagamento ${paymentId} chegou com a reserva já paga ` +
      `por ${booking.asaasPaymentId} — estorno necessário`,
      {paymentId, bookingId, paidValue, billingType},
    );
    await processedRef.set({
      kind: "arenaBooking",
      bookingId,
      outcome: "duplicate_payment",
      refundRequired: true,
      paidValue,
      billingType,
      asaasPaymentStatus: status,
      processedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  if (phases.confirm || phases.credit || phases.awaitSettlement) {
    const amount = Number(payment.value) || 0;
    if (amount <= 0) {
      logger.warn(`Asaas arena booking ${bookingId}: valor inválido`);
      return;
    }

    // Total do servidor: com `amountReais` adulterado no doc, o sinal de 50%
    // fecharia como "pago" e a arena não cobraria o resto no local. Já sem o
    // crédito de chuva usado na criação (essa parte não passa pelo Asaas).
    const totalReais = await readArenaBookingChargeTotalReais(db, bookingId, booking);
    const fraction = Number(booking.paymentFraction) || 1;
    // Para a arena, o saldo de cashback é dinheiro recebido online (a nexaGO
    // cobre): tudo que lê `amountPaidOnlineReais` segue certo sem mudar.
    // Resolve pelo paymentId, não só pelo tracking do booking: um PIX
    // regenerado reescreve `cashbackAppliedCents`/`cashbackHoldId` para a
    // cobrança nova, e um pagamento tardio da cobrança antiga não pode ler
    // o saldo/hold de uma cobrança diferente.
    const {appliedCents, holdId} = await resolveCashbackForPayment(
      db,
      typeof booking.athleteId === "string" ? booking.athleteId : "",
      paymentId,
      booking,
    );
    // Desconto do código de embaixador (NexaSquad): também sai da taxa da nexaGO, então entra no
    // bruto como o cashback — a arena recebe o mesmo líquido. Lido do servidor, nunca da reserva.
    const squadDiscountCents = await arenaSquadDiscountCents(
      db,
      paymentId,
      (await db.collection(ARENA_BOOKING_PRICING).doc(bookingId).get()).data(),
      `reserva ${bookingId}`,
    );
    const cashPaid = roundMoney(amount);
    const paidOnline = roundMoney(cashPaid + appliedCents / 100 + squadDiscountCents / 100);
    const dueOnsite = roundMoney(Math.max(0, totalReais - paidOnline));
    const isPartial = fraction < 0.99 || dueOnsite > 0.02;
    const paymentStatus = isPartial ? "partial" : "paid";
    const arenaId = booking.arenaId as string | undefined;

    // Taxa por plano: 8% Starter, 6% Pro, 5% Elite; sem plano titular = 8%.
    let platformFee = 0;
    if (arenaId) {
      const arenaSnap = await db.collection("arenas").doc(arenaId).get();
      const feePercent = resolveArenaBookingFeePercent(arenaSnap.data() ?? {}, Date.now());
      platformFee = computePlatformFeeReais(paidOnline, feePercent);
    }

    const gatewayFee = resolveGatewayFeeReais(payment, billingType, cashPaid);

    if (phases.confirm) {
      await confirmArenaBookingPayment(db, {
        bookingRef,
        booking,
        bookingId,
        paymentId,
        processedRef,
        billingType,
        arenaId: arenaId ?? null,
        cashPaid,
        paidOnline,
        dueOnsite,
        paymentStatus,
        appliedCents,
        holdId,
        squadDiscountCents,
        platformFee,
      });
    }

    // "A liberar": cartão aprovado cujo dinheiro só entra na carteira na
    // liquidação. Falha aqui não derruba nada — sem o marcador, uma reentrega
    // do `CONFIRMED` soma depois.
    if (phases.awaitSettlement && arenaId) {
      try {
        await holdArenaAwaitingSettlement(db, processedRef, {
          arenaId,
          netReais: arenaBookingNetReais({
            grossReais: paidOnline,
            platformFeeReais: platformFee,
            gatewayFeeReais: gatewayFee,
          }),
        });
      } catch (awaitErr) {
        logger.error(`Asaas arena booking ${bookingId}: falha ao somar o "a liberar"`, awaitErr);
      }
    }

    // Credita a carteira só na LIQUIDAÇÃO: no cartão o horário já foi garantido
    // acima, mas o dinheiro só chega à plataforma ~D+32. Idempotente pelo doc
    // do pagamento (`walletCreditedAt`), marcado na mesma transação do crédito.
    if (phases.credit && arenaId) {
      try {
        await creditArenaWalletFromBookingPayment(db, {
          arenaId,
          bookingId,
          paymentId,
          grossReais: paidOnline,
          platformFeeReais: platformFee,
          gatewayFeeReais: gatewayFee,
          cashbackAppliedReais: appliedCents / 100,
          squadDiscountReais: squadDiscountCents / 100,
          processedRef,
        });
      } catch (walletErr) {
        logger.error(`Asaas arena booking ${bookingId}: wallet credit failed`, walletErr);
      }
    }

    logger.info(
      `Asaas arena booking ${bookingId}: pagamento ${paymentId} (${billingType}, ${status}) — ` +
      `confirmou=${phases.confirm} creditou=${phases.credit} a_liberar=${phases.awaitSettlement} ` +
      `amount=${amount}`,
    );
    return;
  }

  if (negative) {
    // Só a cobrança ATUAL de uma reserva ainda pendente solta o horário. Uma
    // cobrança velha (trocada por outra, ou que não pôde ser apagada) vencendo
    // no dia seguinte cancelaria uma reserva já confirmada e apagaria os locks.
    // Sem gravar "processado": um pagamento tardio dessa cobrança ainda cai
    // nas guardas de estorno acima.
    const currentPaymentId = typeof booking.asaasPaymentId === "string" ? booking.asaasPaymentId.trim() : "";
    if (bookingStatus !== "pending_payment" || (currentPaymentId && currentPaymentId !== paymentId)) {
      logger.info(
        `Asaas arena booking ${bookingId}: ${status} da cobrança ${paymentId} ignorado — ` +
        `reserva ${bookingStatus || "?"}, cobrança atual ${currentPaymentId || "nenhuma"}`,
      );
      return;
    }
    const mpStatus = status === "OVERDUE" ? "expired" : status.toLowerCase();
    await releaseArenaBookingHold(db, bookingRef, booking, bookingId, paymentId, mpStatus);
    await processedRef.set({
      kind: "arenaBooking",
      bookingId,
      outcome: "rejected",
      asaasPaymentStatus: status,
      processedAt: FieldValue.serverTimestamp(),
    });
    logger.info(`Asaas arena booking ${bookingId}: pagamento ${status}, reserva cancelada`);
    return;
  }

  logger.warn(`Asaas arena booking ${bookingId}: status Asaas não tratado: ${status}`);
}

/**
 * Split de pagamento: resolve o pagamento de UMA fatia
 * (`arenaBookings/{bookingId}/paymentShares/{shareId}`), distinta do
 * pagamento único da reserva tratado acima — `externalReference` usa o
 * prefixo `arenaBookingShare:` (vs. `arenaBooking:`), então nunca colidem.
 */
export async function processArenaBookingShareAsaasNotification(
  db: Firestore,
  paymentId: string,
  payment: AsaasPaymentDetails,
  processedRef: DocumentReference,
): Promise<void> {
  const parsed = parseArenaBookingShareExternalReference(
    (payment.externalReference || "").trim(),
  );
  if (!parsed) return;
  const {bookingId, shareId} = parsed;

  const processedSnap = await processedRef.get();
  if (processedSnap.exists) {
    logger.info(`Asaas arena booking share: payment ${paymentId} já processado`);
    return;
  }

  const status = (payment.status || "").toUpperCase();
  if (ASAAS_NON_TERMINAL_STATUSES.has(status)) {
    logger.info(
      `Asaas arena booking share ${bookingId}/${shareId}: pagamento ${paymentId} ainda ${status}`,
    );
    return;
  }

  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const shareRef = bookingRef.collection(PAYMENT_SHARES).doc(shareId);
  const shareSnap = await shareRef.get();
  if (!shareSnap.exists) {
    logger.warn(`Asaas arena booking share: fatia ${shareId} não encontrada (reserva ${bookingId})`);
    await processedRef.set({
      kind: "arenaBookingShare",
      bookingId,
      shareId,
      outcome: "orphan",
      paymentStatus: status,
      processedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  const share = shareSnap.data()!;
  if ((share.status as string | undefined) !== "pending") {
    // Já paga ou já expirada (covered_by_organizer) — não reprocessa.
    await processedRef.set({
      kind: "arenaBookingShare",
      bookingId,
      shareId,
      outcome: "already_resolved",
      paymentStatus: status,
      processedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  if (ASAAS_PAID_STATUSES.has(status)) {
    const paidOnline = roundMoney(Number(payment.value) || 0);
    if (paidOnline <= 0) {
      logger.warn(`Asaas arena booking share ${bookingId}/${shareId}: valor inválido`);
      return;
    }

    const bookingSnap = await bookingRef.get();
    const booking = bookingSnap.data() ?? {};
    const arenaId = booking.arenaId as string | undefined;

    let platformFee = 0;
    if (arenaId) {
      const arenaSnap = await db.collection("arenas").doc(arenaId).get();
      const feePercent = resolveArenaBookingFeePercent(arenaSnap.data() ?? {}, Date.now());
      platformFee = computePlatformFeeReais(paidOnline, feePercent);
    }

    // Cota de amigo: ganha cashback sobre o que pagou; não usa saldo na v1.
    const intent = buildCashbackIntent({
      uid: typeof share.payerAthleteId === "string" ? share.payerAthleteId : "",
      sourceType: "booking",
      sourceId: bookingId,
      tournamentId: null,
      arenaId: arenaId ?? null,
      label: bookingCashbackLabel(String(booking.arenaName ?? "Arena"), booking.date),
      eventAtMs: bookingEventAtMs(booking.date, booking.startTime) ?? Date.now(),
      cashReais: paidOnline,
      appliedCents: 0,
      feeReais: platformFee,
      holdId: null,
      config: await readCashbackConfigOrOff(db, `${bookingId}/${shareId}`),
    });

    const batch = db.batch();
    batch.set(shareRef, {
      status: "paid",
      asaasPaidAmount: paidOnline,
      paidAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    batch.set(bookingRef, {
      amountPaidOnlineReais: FieldValue.increment(paidOnline),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    batch.set(processedRef, {
      kind: "arenaBookingShare",
      bookingId,
      shareId,
      outcome: "approved",
      processedAt: FieldValue.serverTimestamp(),
      ...(intentHasWork(intent) ? cashbackIntentFields(intent) : {}),
    });
    await batch.commit();

    if (intentHasWork(intent)) {
      await applyCashbackIntent(db, processedRef, paymentId, Date.now());
    }

    if (arenaId) {
      try {
        await creditArenaWalletFromBooking(db, arenaId, bookingId, paidOnline, platformFee);
      } catch (walletErr) {
        logger.error(
          `Asaas arena booking share ${bookingId}/${shareId}: wallet credit failed`,
          walletErr,
        );
      }

      try {
        const payerAthleteId = share.payerAthleteId as string | undefined;
        const payer = (await shouldAttemptFiscalInvoice(db, arenaId))
          ? await resolvePayerForInvoice(payerAthleteId)
          : null;
        if (payer) {
          await requestInvoiceForPaidBooking(db, {
            arenaId,
            bookingId,
            shareId,
            asaasPaymentId: paymentId,
            grossReais: paidOnline,
            tomador: {nome: payer.nome, cpfCnpj: payer.cpfCnpj},
            tomadorUid: payerAthleteId ?? null,
          });
        }
      } catch (fiscalErr) {
        logger.error(
          `Asaas arena booking share ${bookingId}/${shareId}: fiscal request failed`,
          fiscalErr,
        );
      }
    }

    try {
      await finalizeArenaBookingIfAllSharesResolved(db, bookingId);
    } catch (finalizeErr) {
      logger.error(
        `Asaas arena booking share ${bookingId}/${shareId}: finalize failed`,
        finalizeErr,
      );
    }

    logger.info(
      `Asaas arena booking share ${bookingId}/${shareId}: paga, paymentId=${paymentId}, amount=${paidOnline}`,
    );
    return;
  }

  if (ASAAS_NEGATIVE_TERMINAL_STATUSES.has(status)) {
    // Não expira aqui: o job `expireArenaBookingPaymentShares` cuida da
    // transferência pro dono no prazo certo (2h antes do jogo). Só registra
    // o evento pra não reprocessar o mesmo paymentId.
    await processedRef.set({
      kind: "arenaBookingShare",
      bookingId,
      shareId,
      outcome: "rejected",
      asaasPaymentStatus: status,
      processedAt: FieldValue.serverTimestamp(),
    });
    logger.info(`Asaas arena booking share ${bookingId}/${shareId}: pagamento ${status}`);
    return;
  }

  logger.warn(
    `Asaas arena booking share ${bookingId}/${shareId}: status Asaas não tratado: ${status}`,
  );
}
