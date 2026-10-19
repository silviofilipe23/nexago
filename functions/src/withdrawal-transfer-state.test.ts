/**
 * Fechamento da aprovação do saque e o que conta como "transferência atual",
 * sobre `FakeFirestore`. O caso que importa: o webhook de falha chegando entre
 * o envio do PIX e o fechamento não pode deixar a reserva ser consumida.
 */
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {processArenaWithdrawalTransferWebhook} from "./asaas-withdrawal-webhook";
import {reserveTournamentWithdrawalAmount} from "./tournament-wallet";
import {
  finalizeApprovedWithdrawal,
  isCurrentTransfer,
  manualReviewBlockReason,
  nextTransferAttempt,
} from "./withdrawal-transfer-state";

const SAQUE = "organizerWithdrawals/saque-1";
const CAIXA = "tournamentWallets/copa";

function cenario(payoutStatus: string) {
  const fake = new FakeFirestore();
  fake.seedDoc(CAIXA, {tournamentId: "copa", availableReais: 100, pendingReais: 120});
  fake.seedDoc(SAQUE, {
    tournamentId: "copa", organizerId: "dono", amountReais: 120,
    status: "pending", payoutProvider: "asaas", payoutStatus, asaasTransferId: "tra_1",
  });
  const db = fake as unknown as Firestore;
  const ref = fake.doc(SAQUE) as unknown as DocumentReference;
  return {fake, db, ref};
}

describe("finalizeApprovedWithdrawal", () => {
  it("PIX criado: consome a reserva e aprova", async () => {
    const {fake, db, ref} = cenario("sent");

    await finalizeApprovedWithdrawal(db, "organizer", ref, 120, {reviewedBy: "admin"});

    assert.equal(fake.store.get(CAIXA)?.pendingReais, 0);
    assert.equal(fake.store.get(CAIXA)?.availableReais, 100);
    assert.equal(fake.store.get(SAQUE)?.status, "approved");
  });

  it("falha chegou antes do fechamento: nada é consumido e o saque segue na fila", async () => {
    const {fake, db, ref} = cenario("failed");

    await assert.rejects(
      () => finalizeApprovedWithdrawal(db, "organizer", ref, 120, {reviewedBy: "admin"}),
      /TRANSFER_NOT_CONCLUDED/,
    );

    assert.equal(fake.store.get(CAIXA)?.pendingReais, 120);
    assert.equal(fake.store.get(SAQUE)?.status, "pending");
  });

  it("recusado enquanto o envio corria: não consome nem reaprova", async () => {
    const {fake, db, ref} = cenario("sent");
    await ref.update({status: "rejected"});

    await assert.rejects(
      () => finalizeApprovedWithdrawal(db, "organizer", ref, 120, {reviewedBy: "admin"}),
      /WITHDRAWAL_ALREADY_REVIEWED/,
    );

    assert.equal(fake.store.get(CAIXA)?.pendingReais, 120);
    assert.equal(fake.store.get(SAQUE)?.status, "rejected");
  });

  it("corrida inteira: PIX criado → CANCELLED chega → fechamento não consome", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(CAIXA, {tournamentId: "copa", availableReais: 220, pendingReais: 0});
    const db = fake as unknown as Firestore;
    await reserveTournamentWithdrawalAmount(db, "copa", 120);
    fake.seedDoc(SAQUE, {
      tournamentId: "copa", organizerId: "dono", amountReais: 120, status: "pending",
      payoutProvider: "asaas", payoutStatus: "sent", asaasTransferId: "tra_1",
    });
    const ref = fake.doc(SAQUE) as unknown as DocumentReference;

    await processArenaWithdrawalTransferWebhook(db, "TRANSFER_CANCELLED", {
      id: "tra_1", externalReference: "organizerWithdrawal:saque-1",
    }, async () => undefined);
    await assert.rejects(
      () => finalizeApprovedWithdrawal(db, "organizer", ref, 120, {reviewedBy: "admin"}),
      /TRANSFER_NOT_CONCLUDED/,
    );

    // Disponível 100 + 120 reservados: o admin ainda pode tentar de novo ou recusar.
    assert.deepEqual(
      {available: fake.store.get(CAIXA)?.availableReais, pending: fake.store.get(CAIXA)?.pendingReais},
      {available: 100, pending: 120},
    );
    assert.equal(fake.store.get(SAQUE)?.payoutStatus, "failed");
  });
});

describe("isCurrentTransfer", () => {
  it("sem id no evento ou sem id gravado, vale a referência", () => {
    assert.ok(isCurrentTransfer({asaasTransferId: "tra_1"}, undefined));
    assert.ok(isCurrentTransfer({}, "tra_1"));
  });

  it("mesmo id é a atual; outro id ou id aposentado não", () => {
    assert.ok(isCurrentTransfer({asaasTransferId: "tra_2"}, "tra_2"));
    assert.ok(!isCurrentTransfer({asaasTransferId: "tra_2"}, "tra_1"));
    assert.ok(!isCurrentTransfer({failedTransferIds: ["tra_1"]}, "tra_1"));
  });
});

describe("manualReviewBlockReason", () => {
  it("PIX concluído ou em andamento bloqueia recusar e pago por fora", () => {
    assert.match(manualReviewBlockReason({payoutStatus: "paid"}) ?? "", /Aprovar e pagar/);
    assert.match(manualReviewBlockReason({payoutStatus: "sent"}) ?? "", /em andamento/);
  });

  it("pendente, falho ou nunca enviado pode ser fechado à mão", () => {
    for (const payoutStatus of ["pending", "failed", undefined]) {
      assert.equal(manualReviewBlockReason({payoutStatus}), null, String(payoutStatus));
    }
  });
});

describe("nextTransferAttempt", () => {
  it("começa em 1 e avança a partir do gravado", () => {
    assert.equal(nextTransferAttempt({}), 1);
    assert.equal(nextTransferAttempt({transferAttempt: 2}), 3);
    assert.equal(nextTransferAttempt({transferAttempt: "lixo"}), 1);
  });
});
