/**
 * Processamento de webhooks Asaas para inscrições em torneio.
 */

import {
  FieldValue,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {roundMoney} from "./mercadopago-arena-helpers";
import {deleteAsaasPaymentOrThrow, type AsaasPaymentDetails} from "./asaas-booking-payment";
import {
  PIX_CANCELLED_REGISTRATION_ALREADY_PAID,
  cancelOpenPixPendingCharges,
} from "./tournament-registration-pix-cancel";
import {
  computeTournamentShareAmountReais,
  parseTournamentRegistrationExternalReference,
  resolveTournamentRegistrationCredit,
  sharePaidUidsFromRegistration,
} from "./tournament-registration-pix-helpers";
import {
  usesDynamicShare,
  registrationTeamSize,
} from "./tournament-team-category";
import {
  loadTeamMemberUids,
  markTeamRegistrationPaid,
} from "./tournament-team-roster";
import {
  findCategory,
  loadTournamentData,
  resolveCategoryEntryFee,
} from "./tournament-registration-guards";
import {deliverNotificationToUser} from "./notification-delivery";
import {registrationHoldClearedFields} from "./tournament-registration-hold-ops";
import {tournamentManagerUids} from "./tournament-acl";
import {organizerTournamentNotificationLinks} from "./organizer-notification-links";
import {creditTournamentWalletFromRegistration} from "./tournament-wallet";
import {computePlatformFeeReais, resolveOrganizerTournamentFeePercent} from "./platform-fees";
import {artifactsInscriptionsPath, getFirebaseProjectId} from "./firebase-paths";
import {
  parseRegistrationBillingType,
  resolvePaymentPhases,
  type RegistrationBillingType,
} from "./registration-payment-phases";
import {DEFAULT_CASHBACK_CONFIG, readCashbackConfig} from "./cashback-config";
import {toMillisOrNull} from "./cashback-rules";
import {
  applyCashbackIntent,
  buildCashbackIntent,
  cashbackIntentFields,
  intentHasWork,
  registrationCashbackLabel,
  resolveCashbackForPayment,
} from "./cashback-intent";
import {refundHoldOfPayment} from "./cashback-reversal";

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
 * Taxa que o gateway cobrou nesta cobrança, para repassar ao organizador.
 *
 * Sai do próprio pagamento (`value − netValue`) em vez de uma alíquota fixa no
 * código, que envelheceria calada a cada renegociação com o Asaas. Só vale
 * para cartão: no PIX a plataforma absorve o custo, como sempre absorveu.
 */
function resolveGatewayFeeReais(
  payment: AsaasPaymentDetails,
  billingType: RegistrationBillingType,
  grossReais: number,
): number {
  if (billingType !== "CREDIT_CARD") return 0;
  const net = Number(payment.netValue);
  if (!Number.isFinite(net) || net <= 0 || net > grossReais) {
    logger.error(
      "Asaas tournament registration: netValue ausente/inválido no cartão — " +
      "creditando sem descontar a taxa do gateway",
      {paymentId: payment.id, value: grossReais, netValue: payment.netValue},
    );
    return 0;
  }
  return roundMoney(grossReais - net);
}

export interface TournamentRegistrationWebhookDeps {
  cancelCharge: (asaasPaymentId: string) => Promise<void>;
}

const defaultDeps: TournamentRegistrationWebhookDeps = {
  cancelCharge: (asaasPaymentId) => deleteAsaasPaymentOrThrow(asaasPaymentId),
};

export async function processTournamentRegistrationAsaasNotification(
  db: Firestore,
  paymentId: string,
  payment: AsaasPaymentDetails,
  processedRef: DocumentReference,
  deps: TournamentRegistrationWebhookDeps = defaultDeps,
): Promise<void> {
  const parsed = parseTournamentRegistrationExternalReference(
    (payment.externalReference || "").trim(),
  );
  if (!parsed) {
    return;
  }

  const {registrationId, payerUid} = parsed;

  const processedSnap = await processedRef.get();
  const processed = processedSnap.data() ?? {};
  const outcome = typeof processed.outcome === "string" ? processed.outcome : "";

  // Desfecho terminal que não é "aprovado" (órfão, pagador duplicado,
  // recusado) encerra o assunto, como sempre encerrou.
  if (processedSnap.exists && outcome !== "approved") {
    logger.info(`Asaas tournament registration: payment ${paymentId} já processado`);
    return;
  }

  // Documento aprovado SEM marcador de fase é do acervo pré-cartão: ali as
  // duas fases sempre rodaram juntas, no mesmo evento.
  const legacyApproved = outcome === "approved" && processed.confirmedAt == null;
  const alreadyConfirmed = legacyApproved || processed.confirmedAt != null;
  const alreadyCredited = legacyApproved || processed.walletCreditedAt != null;

  const status = (payment.status || "").toUpperCase();
  const billingType = parseRegistrationBillingType(payment.billingType);
  const phases = resolvePaymentPhases({
    billingType,
    status,
    alreadyConfirmed,
    alreadyCredited,
  });

  if (
    !phases.confirm &&
    !phases.credit &&
    !ASAAS_NEGATIVE_TERMINAL_STATUSES.has(status)
  ) {
    logger.info(
      `Asaas tournament registration ${registrationId}: pagamento ${paymentId} ainda ${status}`,
    );
    return;
  }

  const projectId = getFirebaseProjectId();
  const registrationRef = db
    .collection(artifactsInscriptionsPath(projectId))
    .doc(registrationId);
  const pendingRef = registrationRef.collection("pixPending").doc(payerUid);

  const registrationSnap = await registrationRef.get();
  if (!registrationSnap.exists) {
    logger.warn(`Asaas tournament registration: inscrição ${registrationId} não encontrada`);
    await processedRef.set({
      kind: "tournamentRegistration",
      registrationId,
      outcome: "orphan",
      paymentStatus: status,
      processedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  const regData = registrationSnap.data()!;
  const tournamentId = regData.tournamentId as string;
  const categoryId = regData.categoryId as string;
  const tournament = await loadTournamentData(db, projectId, tournamentId);
  const entryFee = tournament ? resolveCategoryEntryFee(tournament, categoryId) : 0;
  const organizerId = typeof tournament?.managerId === "string" ?
    tournament.managerId.trim() : "";
  // Equipe e individual: cota dinâmica (restante ÷ pagadores que faltam; na
  // individual, a taxa inteira) — o aviso de divergência da metade fixa e o
  // crédito por parcela não se aplicam.
  const regTeamSize = registrationTeamSize(
    regData,
    tournament ? findCategory(tournament, categoryId) : null,
  );
  const isTeamRegistration = usesDynamicShare(regTeamSize);
  const expectedShare = isTeamRegistration
    ? 0
    : computeTournamentShareAmountReais(entryFee);

  if (phases.confirm || phases.credit) {
    const paidOnline = roundMoney(Number(payment.value) || 0);
    if (paidOnline <= 0) {
      logger.warn(`Asaas tournament registration ${registrationId}: valor inválido`);
      return;
    }

    // Tipo de cobrança gravado no doc pendente (parcela ou dupla inteira).
    const pendingSnap = await pendingRef.get();
    const amountType: "share" | "full" =
      pendingSnap.data()?.amountType === "full" ? "full" : "share";

    // Saldo de cashback usado nesta cobrança: o Asaas recebeu só o dinheiro,
    // mas para o torneio a parcela vale o bruto — a nexaGO cobre a diferença.
    // Numa rodada só de crédito (cartão RECEIVED depois do CONFIRMED) o valor
    // já foi gravado na intenção durante a confirmação — mais confiável do
    // que resolver de novo, pois o pendente pode ter sido reescrito ou
    // apagado por uma cobrança nova nesse meio tempo. Só recorre ao resolver
    // quando esse registro não existe.
    const processedAppliedCents = (processed.cashback as {appliedCents?: unknown} | undefined)
      ?.appliedCents;
    const {appliedCents, holdId} =
      !phases.confirm && typeof processedAppliedCents === "number" &&
      Number.isFinite(processedAppliedCents) ?
        {appliedCents: processedAppliedCents, holdId: null} :
        await resolveCashbackForPayment(db, payerUid, paymentId, pendingSnap.data());
    const grossOnline = roundMoney(paidOnline + appliedCents / 100);

    // Comissão negociada no cadastro do organizador; sem cadastro (ou com
    // valor fora da faixa) cai nos 8% padrão. Lida uma vez para as duas fases.
    // Falha aqui NUNCA pode derrubar a confirmação — só o crédito do caixa,
    // que sabe reprocessar numa reentrega, depende da taxa certa.
    let organizerFeePercent: number | null = organizerId ? null : 0;
    if (organizerId) {
      try {
        organizerFeePercent = resolveOrganizerTournamentFeePercent(
          (await db.doc(`organizers/${organizerId}`).get()).data(),
        );
      } catch (e) {
        logger.error(
          `Asaas tournament registration ${registrationId}: falha ao ler organizers/${organizerId} ` +
          "— taxa indisponível nesta rodada",
          e,
        );
      }
    }

    // Estado da inscrição para o log final; a fase de confirmação os reescreve.
    let newPaidAmount = Number(regData.paidAmount) || 0;
    let isPaid = regData.isPaid === true;

    // Só a autorização confirma a vaga. Quando apenas a fase de crédito roda
    // (o RECEIVED do cartão, depois que o CONFIRMED já confirmou), NADA daqui
    // pode rodar de novo: a checagem de pagamento duplicado logo abaixo testa
    // `sharePaidUids.includes(payerUid)`, que a fase 1 acabou de deixar true —
    // o evento cairia como `duplicate_payer` e a carteira nunca seria creditada.
    if (phases.confirm) {
      if (
        amountType === "share" &&
        expectedShare > 0 &&
        Math.abs(grossOnline - expectedShare) > 0.02
      ) {
        logger.warn(
          `Asaas tournament registration ${registrationId}: valor ${grossOnline} diverge da parcela ${expectedShare}`,
        );
      }

      const sharePaidUids = sharePaidUidsFromRegistration(regData);
      if (sharePaidUids.includes(payerUid)) {
        // Quem pagou a parcela foi ESTE pagamento? Só o lote de confirmação
        // grava o pendente como `paid` com o id dele — e no mesmo lote do
        // processado. Então é uma entrega concorrente (esta leu o processado
        // antes daquele lote e a inscrição depois), não um duplicado: nada a
        // devolver, e o processado aprovado (com a intenção) não é sobrescrito.
        const pending = pendingSnap.data();
        const paidByThisPayment = pending?.status === "paid" &&
          typeof pending.asaasPaymentId === "string" &&
          pending.asaasPaymentId.trim() === paymentId;
        if (paidByThisPayment || (await processedRef.get()).exists) {
          logger.info(
            `Asaas tournament registration ${registrationId}: pagamento ${paymentId} ` +
            "já confirmou esta parcela (entrega concorrente) — nada a fazer",
          );
          return;
        }
        // Dinheiro entrou sem crédito: a parcela deste atleta já constava paga
        // (em geral o parceiro pagou o integral antes deste PIX ser quitado).
        // Creditar de novo cobraria a mais, então sobra estorno manual — e isso
        // precisa ser barulhento, não um `return` silencioso. O saldo que esta
        // cobrança usou volta: sem crédito, não há o que consumir — aberta ou
        // já capturada pela varredura de 5 min (Asaas disse pago antes).
        await refundHoldOfPayment(db, payerUid, paymentId, Date.now());
        logger.error(
          `Asaas tournament registration ${registrationId}: pagamento duplicado de ` +
          `${payerUid} (R$ ${paidOnline}) — estorno manual necessário`,
          {registrationId, payerUid, paymentId, paidValue: paidOnline, cashbackAppliedCents: appliedCents},
        );
        await processedRef.set({
          kind: "tournamentRegistration",
          registrationId,
          payerUid,
          outcome: "duplicate_payer",
          paidValue: paidOnline,
          refundRequired: true,
          cashbackAppliedCents: appliedCents,
          processedAt: FieldValue.serverTimestamp(),
        });
        return;
      }

      // Credita o valor real (parcela ou taxa inteira) e decide a confirmação.
      // Em categoria de equipe a parcela creditada é o valor efetivamente pago
      // (a cota varia conforme quem já pagou), limitado ao que falta.
      const currentPaid = Number(regData.paidAmount) || 0;
      const credit = resolveTournamentRegistrationCredit({
        entryFee,
        amountType,
        currentPaidAmount: currentPaid,
        ...(isTeamRegistration ? {shareCreditReais: grossOnline} : {}),
      });
      newPaidAmount = credit.newPaidAmount;
      const wasPaidBefore = regData.isPaid === true;
      isPaid = credit.isPaid || wasPaidBefore;

      // "Dupla inteira": confirma os dois atletas (o parceiro não paga de novo).
      const participantUids = Array.isArray(regData.participantUids) ?
        (regData.participantUids as unknown[]).filter(
          (u): u is string => typeof u === "string" && u.trim().length > 0,
        ) :
        [];
      const uidsToConfirm =
        amountType === "full" && participantUids.length > 0 ?
          participantUids :
          [payerUid];

      // Doc de config indisponível não pode derrubar a confirmação: a reserva
      // de saldo ainda precisa ser capturada mesmo sem conseguir calcular o
      // ganho desta rodada.
      let cashbackConfig = DEFAULT_CASHBACK_CONFIG;
      try {
        cashbackConfig = await readCashbackConfig(db);
      } catch (e) {
        logger.error(
          `Asaas tournament registration ${registrationId}: falha ao ler appConfig/cashback ` +
          "— tratando como desligado nesta rodada",
          e,
        );
      }

      const intent = buildCashbackIntent({
        uid: payerUid,
        sourceType: "registration",
        sourceId: registrationId,
        tournamentId: typeof regData.tournamentId === "string" ? regData.tournamentId : null,
        arenaId: null,
        label: registrationCashbackLabel(
          typeof regData.tournamentName === "string" && regData.tournamentName.trim() ?
            regData.tournamentName.trim() :
            (typeof tournament?.name === "string" ? tournament.name : "Torneio"),
        ),
        eventAtMs: toMillisOrNull(tournament?.startAt ?? tournament?.startDate) ?? Date.now(),
        cashReais: paidOnline,
        appliedCents,
        feeReais: organizerId ? computePlatformFeeReais(grossOnline, organizerFeePercent ?? 0) : 0,
        holdId,
        config: cashbackConfig,
      });

      const batch = db.batch();
      batch.update(registrationRef, {
        paidAmount: newPaidAmount,
        isPaid,
        sharePaidUids: FieldValue.arrayUnion(...uidsToConfirm),
        // Pagamento na conta: a vaga deixa de ter prazo de garantia.
        ...registrationHoldClearedFields(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      batch.set(pendingRef, {
        status: "paid",
        asaasPaymentId: paymentId,
        paidAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      batch.set(processedRef, {
        kind: "tournamentRegistration",
        registrationId,
        payerUid,
        outcome: "approved",
        billingType,
        confirmedAt: FieldValue.serverTimestamp(),
        processedAt: FieldValue.serverTimestamp(),
        ...(intentHasWork(intent) ? cashbackIntentFields(intent) : {}),
      }, {merge: true});

      await batch.commit();

      // Captura a reserva de saldo e cria o lote pendente. Nunca lança: o que
      // falhar fica pendente para a varredura de 5 minutos.
      if (intentHasWork(intent)) {
        await applyCashbackIntent(db, processedRef, paymentId, Date.now());
      }

      // Inscrição confirmada fecha a janela dos outros atletas: sem isso o QR do
      // parceiro segue pagável até expirar (15 min) e o pagamento dele cai como
      // duplicado — sem crédito e sem estorno automático.
      if (isPaid) {
        const cancelledUids = await cancelOpenPixPendingCharges({
          registrationRef,
          reason: PIX_CANCELLED_REGISTRATION_ALREADY_PAID,
          skipUid: payerUid,
          cancelCharge: deps.cancelCharge,
        });
        if (cancelledUids.length > 0) {
          logger.info(
            `Asaas tournament registration ${registrationId}: cobrança PIX aberta ` +
            `cancelada de ${cancelledUids.join(", ")}`,
          );
        }
      }

      if (!wasPaidBefore && isPaid) {
        const teamId = typeof regData.teamId === "string" ? regData.teamId : "";
        try {
          await markTeamRegistrationPaid(db, projectId, teamId);
        } catch (genderError) {
          logger.warn(
            `Falha ao definir gender da equipe ${teamId} (registration ${registrationId})`,
            genderError,
          );
        }
        const tournamentName = typeof regData.tournamentName === "string" ?
          regData.tournamentName : "Torneio";
        const categoryName = typeof regData.categoryId === "string" ?
          regData.categoryId : "Categoria";
        const encodedTournamentName = encodeURIComponent(tournamentName);
        const encodedCategoryName = encodeURIComponent(categoryName);
        const url =
          `/torneios/${tournamentId}/inscricao/sucesso?registrationId=${registrationId}` +
          `&tournamentName=${encodedTournamentName}&categoryName=${encodedCategoryName}`;

        const athleteUids = await loadTeamMemberUids(db, projectId, teamId);
        const recipients = athleteUids.filter((uid) => uid !== payerUid);
        await Promise.all(
          recipients.map((uid) =>
            deliverNotificationToUser({
              userId: uid,
              title: "Inscricao confirmada",
              body: isTeamRegistration
                ? "Sua equipe concluiu o pagamento. Toque para ver o comprovante."
                : "Sua dupla concluiu o pagamento. Toque para ver o comprovante.",
              type: "tournament_registration_confirmed",
              data: {
                tournamentId,
                registrationId,
                url,
              },
            }),
          ),
        );

        // Avisa quem opera o torneio que o Pix do gateway confirmou sozinho — o organizador não
        // precisa conferir nada aqui (diferente do pagamento direto, que ele mesmo confirma).
        const teamNameLabel = typeof regData.teamName === "string" ? regData.teamName.trim() : "";
        const categoryLabel = tournament
          ? String(
              findCategory(tournament, categoryId)?.categoryName ??
                findCategory(tournament, categoryId)?.name ??
                "",
            ).trim()
          : "";
        const organizerRecipients = await tournamentManagerUids(db, tournamentId, tournament ?? undefined);
        await Promise.all(
          organizerRecipients.map((recipientUid) =>
            deliverNotificationToUser({
              userId: recipientUid,
              title: "Pagamento confirmado",
              body: `${teamNameLabel || "Uma dupla"} confirmou o pagamento${
                categoryLabel ? ` em ${categoryLabel}` : ""
              }.`,
              type: "tournament_payment_confirmed",
              data: {
                tournamentId,
                registrationId,
                categoryId,
                ...organizerTournamentNotificationLinks(tournamentId, registrationId),
              },
            }).catch(() => undefined),
          ),
        );
      }
    }

    // Credita o CAIXA DO TORNEIO (`tournamentWallets/{tournamentId}`) com o
    // líquido (bruto − taxa da plataforma − taxa do gateway). A plataforma
    // retém a sua taxa; o dono do evento e os gestores da equipe sacam depois.
    //
    // Só na LIQUIDAÇÃO: no cartão a vaga já foi garantida lá em cima, na
    // autorização, mas o dinheiro só chega à plataforma ~D+30. Creditar antes
    // seria a plataforma financiando o repasse — e o saque automático tiraria
    // caixa que ainda não entrou.
    if (phases.credit && organizerId) {
      try {
        // Taxa indisponível (leitura do organizador falhou): credita com uma
        // taxa errada seria pior do que não creditar — deixa pra reentrega.
        if (organizerFeePercent == null) {
          throw new Error("organizer fee unavailable");
        }
        await creditTournamentWalletFromRegistration(db, tournamentId, {
          ownerId: organizerId,
          registrationId,
          payerUid,
          paymentId,
          grossReais: grossOnline,
          platformFeeReais: computePlatformFeeReais(grossOnline, organizerFeePercent),
          // A taxa do gateway é sobre o que o Asaas cobrou (o dinheiro), não sobre o bruto.
          gatewayFeeReais: resolveGatewayFeeReais(payment, billingType, paidOnline),
          cashbackAppliedReais: appliedCents / 100,
        });
        // Marca a fase só no sucesso: crédito que falhou precisa poder ser
        // reprocessado por uma reentrega do evento.
        await processedRef.set({
          walletCreditedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
      } catch (walletErr) {
        logger.error(
          `Asaas tournament registration ${registrationId}: tournament wallet credit failed`,
          walletErr,
        );
      }
    }

    logger.info(
      `Asaas tournament registration ${registrationId}: pagamento de ${payerUid} ` +
      `(${billingType}, ${status}) — confirmou=${phases.confirm} creditou=${phases.credit} ` +
      `paidAmount=${newPaidAmount} isPaid=${isPaid}`,
    );
    return;
  }

  if (ASAAS_NEGATIVE_TERMINAL_STATUSES.has(status)) {
    // Estorno ou chargeback DEPOIS da vaga garantida. Não há desfazimento
    // automático (mesma lacuna que o estorno de PIX sempre teve), mas isso
    // precisa ser barulhento em vez de sumir num return silencioso.
    if (alreadyConfirmed) {
      logger.error(
        `Asaas tournament registration ${registrationId}: pagamento ${paymentId} ` +
        `virou ${status} DEPOIS de confirmar a inscrição — vaga e carteira ` +
        "seguem como estão, resolver à mão",
        {registrationId, payerUid, paymentId, status, billingType},
      );
      return;
    }

    await pendingRef.set({
      status: "expired",
      asaasPaymentStatus: status,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    await processedRef.set({
      kind: "tournamentRegistration",
      registrationId,
      payerUid,
      outcome: "rejected",
      asaasPaymentStatus: status,
      processedAt: FieldValue.serverTimestamp(),
    });
    logger.info(
      `Asaas tournament registration ${registrationId}: pagamento ${status} para ${payerUid}`,
    );
    return;
  }

  logger.warn(
    `Asaas tournament registration ${registrationId}: status não tratado: ${status}`,
  );
}
