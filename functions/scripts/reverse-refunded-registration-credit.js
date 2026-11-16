/* eslint-disable */
/**
 * Tira do caixa do torneio o crédito de inscrição que o Asaas estornou.
 *
 * O caso: o atleta pagou, a inscrição confirmou e o líquido entrou em
 * `tournamentWallets/{tournamentId}`. Depois o pagamento foi estornado (ou virou
 * chargeback). O webhook não desfaz nada nesse ponto — só loga
 * "virou REFUNDED DEPOIS de confirmar a inscrição ... resolver à mão" — e o caixa
 * segue mostrando, como disponível para saque, um dinheiro que já voltou para o
 * atleta.
 *
 * O script faz, numa transação só, para cada pagamento informado:
 *   - caixa: `availableReais −= líquido creditado`;
 *   - extrato: apaga a linha `credit` do pagamento — as telas (extrato do
 *     organizador, Arrecadação e Financeiro do backoffice) só entendem `credit`,
 *     então a linha tem de sair para o crédito e a taxa da plataforma deixarem
 *     de contar;
 *   - `asaas_processed_payments/{paymentId}`: `walletCreditReversedAt` +
 *     `walletCreditReversal` com a cópia inteira da linha apagada (é o rastro, e
 *     o que permite refazer a linha se for preciso).
 *
 * `walletCreditedAt` do pagamento NÃO é apagado de propósito: é ele que impede
 * uma reentrega do webhook ou a varredura de PIX de creditar o caixa de novo.
 *
 * Travas: recusa pagamento que não creditou este caixa, crédito duplicado no
 * extrato e caixa sem o valor disponível (o organizador já sacou ou reservou —
 * aí a decisão é de gente, não de script). Pagamento já revertido é pulado:
 * rodar de novo não faz nada.
 *
 * Use SÓ depois de confirmar o estorno (painel do Asaas, ou o log de erro do
 * `asaasWebhook` com o id do pagamento). O script não mexe na inscrição nem na
 * vaga.
 *
 * Pré-requisitos:
 *   gcloud auth application-default login
 *
 * Uso (na pasta functions/):
 *   node scripts/reverse-refunded-registration-credit.js --project volley-track-dev-4596c \
 *     --tournament <tournamentId> --payments pay_xxx,pay_yyy
 *   node scripts/reverse-refunded-registration-credit.js ... --yes
 * Opcional: --reason CHARGEBACK (padrão REFUNDED).
 */
const admin = require("firebase-admin");
const {planRefundedCreditReversal} = require("./lib/refunded-credit-reversal");

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}

const PROJECT = arg("project");
const TOURNAMENT_ID = arg("tournament");
const PAYMENT_IDS = [...new Set(String(arg("payments", "")).split(",").map((s) => s.trim()).filter(Boolean))];
const REASON = arg("reason", "REFUNDED");
const APPLY = process.argv.includes("--yes");
if (!PROJECT || !TOURNAMENT_ID || PAYMENT_IDS.length === 0) {
  console.error("Uso: --project <id> --tournament <tournamentId> --payments <pay_a,pay_b> [--reason <motivo>] [--yes]");
  process.exit(1);
}

admin.initializeApp({projectId: PROJECT});
const db = admin.firestore();
const {FieldValue} = admin.firestore;
const BRL = (v) => `R$ ${Number(v || 0).toFixed(2)}`;
const SCRIPT_TAG = "script:reverse-refunded-registration-credit";

async function main() {
  const walletRef = db.collection("tournamentWallets").doc(TOURNAMENT_ID);
  const ledgerCol = walletRef.collection("ledger");
  const processedRef = (paymentId) =>
    db.doc(`artifacts/${PROJECT}/public/data/asaas_processed_payments/${paymentId}`);
  console.log(`\nProjeto: ${PROJECT}  |  ${walletRef.path}  |  modo: ${APPLY ? "APLICAR" : "DRY-RUN"}\n`);

  await db.runTransaction(async (tx) => {
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists) throw new Error("o caixa deste torneio não existe");
    const processedSnaps = await Promise.all(PAYMENT_IDS.map((id) => tx.get(processedRef(id))));
    const ledgerSnaps = await Promise.all(
      PAYMENT_IDS.map((id) => tx.get(ledgerCol.where("asaasPaymentId", "==", id))),
    );

    const plan = planRefundedCreditReversal({
      wallet: walletSnap.data(),
      ledgerLines: ledgerSnaps.flatMap((s) => s.docs.map((d) => ({id: d.id, ...d.data()}))),
      processedByPaymentId: Object.fromEntries(PAYMENT_IDS.map((id, i) => [id, processedSnaps[i].data()])),
      paymentIds: PAYMENT_IDS,
    });

    console.log(`caixa: disponível=${BRL(plan.availableBeforeReais)} reservado=${BRL(walletSnap.data().pendingReais)}`);
    for (const id of plan.alreadyReversed) console.log(`  ${id}: já revertido — pulado`);
    for (const r of plan.reversals) {
      console.log(
        `  ${r.paymentId}: linha ${r.ledgerEntryId} bruto=${BRL(r.ledgerEntry.grossReais)} ` +
        `taxa=${BRL(r.ledgerEntry.platformFeeReais)} líquido=${BRL(r.netReais)} ` +
        `inscrição=${r.ledgerEntry.registrationId || "?"}`,
      );
    }
    if (plan.errors.length > 0) {
      throw new Error(`nada foi gravado:\n  - ${plan.errors.join("\n  - ")}`);
    }
    if (plan.reversals.length === 0) {
      console.log("\nNada a fazer.");
      return;
    }

    console.log(
      `\ndepois: disponível=${BRL(plan.availableAfterReais)} (−${BRL(plan.totalNetReais)}) | ` +
      `${plan.reversals.length} linha(s) fora do extrato | motivo=${REASON}`,
    );
    if (!APPLY) {
      console.log("\nDRY-RUN: nada gravado. Rode de novo com --yes para aplicar.");
      return;
    }

    tx.update(walletRef, {availableReais: plan.availableAfterReais, updatedAt: FieldValue.serverTimestamp()});
    for (const r of plan.reversals) {
      tx.delete(ledgerCol.doc(r.ledgerEntryId));
      tx.set(
        processedRef(r.paymentId),
        {
          walletCreditReversedAt: FieldValue.serverTimestamp(),
          walletCreditReversal: {
            reason: REASON,
            tournamentId: TOURNAMENT_ID,
            netReais: r.netReais,
            ledgerEntryId: r.ledgerEntryId,
            ledgerEntry: r.ledgerEntry,
            by: SCRIPT_TAG,
          },
        },
        {merge: true},
      );
    }
    console.log("\nAPLICADO.");
  });
}

main().catch((e) => {
  console.error(`\nERRO: ${e.message}`);
  process.exit(1);
});
