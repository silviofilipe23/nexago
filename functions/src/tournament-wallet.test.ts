import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  creditTournamentWalletFromRegistration,
  reserveTournamentWithdrawalAmount,
  releaseTournamentWithdrawalReservation,
  assertTournamentWithdrawalReservationValid,
} from "./tournament-wallet";

const TOURNAMENT = "t1";
const OWNER = "ownerUid";
const WALLET_PATH = `tournamentWallets/${TOURNAMENT}`;

function ledgerEntry(fake: FakeFirestore): Record<string, unknown> {
  const entry = [...fake.store.entries()].find(([path]) =>
    path.startsWith(`${WALLET_PATH}/ledger/`),
  );
  assert.ok(entry, "nenhum lançamento no ledger");
  return entry[1];
}

async function credit(
  fake: FakeFirestore,
  params: {grossReais: number; platformFeeReais: number; gatewayFeeReais?: number},
): Promise<void> {
  await creditTournamentWalletFromRegistration(
    fake as unknown as Firestore,
    TOURNAMENT,
    {ownerId: OWNER, registrationId: "reg1", payerUid: "uidA", paymentId: "pay1", ...params},
  );
}

describe("creditTournamentWalletFromRegistration", () => {
  it("credita o líquido no caixa do torneio e grava o dono", async () => {
    const fake = new FakeFirestore();
    await credit(fake, {grossReais: 100, platformFeeReais: 8});

    const wallet = fake.store.get(WALLET_PATH)!;
    assert.equal(wallet["availableReais"], 92);
    assert.equal(wallet["pendingReais"], 0);
    assert.equal(wallet["tournamentId"], TOURNAMENT);
    assert.equal(wallet["ownerId"], OWNER);
    assert.equal(ledgerEntry(fake)["netReais"], 92);
    assert.equal(ledgerEntry(fake)["registrationId"], "reg1");
  });

  it("soma no saldo que já existe, sem zerar o pendente", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(WALLET_PATH, {availableReais: 50, pendingReais: 30});
    await credit(fake, {grossReais: 100, platformFeeReais: 8});

    const wallet = fake.store.get(WALLET_PATH)!;
    assert.equal(wallet["availableReais"], 142);
    assert.equal(wallet["pendingReais"], 30);
  });

  it("desconta a taxa do gateway do líquido", async () => {
    const fake = new FakeFirestore();
    await credit(fake, {grossReais: 100, platformFeeReais: 8, gatewayFeeReais: 3.29});
    assert.equal(fake.store.get(WALLET_PATH)!["availableReais"], 88.71);
  });
});

describe("reserva de saque no caixa do torneio", () => {
  it("move do disponível para o pendente", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(WALLET_PATH, {availableReais: 100, pendingReais: 0});

    await reserveTournamentWithdrawalAmount(fake as unknown as Firestore, TOURNAMENT, 40);

    const wallet = fake.store.get(WALLET_PATH)!;
    assert.equal(wallet["availableReais"], 60);
    assert.equal(wallet["pendingReais"], 40);
  });

  it("recusa saque acima do disponível", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(WALLET_PATH, {availableReais: 30, pendingReais: 0});

    await assert.rejects(
      () => reserveTournamentWithdrawalAmount(fake as unknown as Firestore, TOURNAMENT, 40),
      /INSUFFICIENT_BALANCE/,
    );
    assert.equal(fake.store.get(WALLET_PATH)!["availableReais"], 30);
  });

  it("caixa inexistente não tem saldo nenhum", async () => {
    const fake = new FakeFirestore();
    await assert.rejects(
      () => reserveTournamentWithdrawalAmount(fake as unknown as Firestore, TOURNAMENT, 1),
      /INSUFFICIENT_BALANCE/,
    );
  });

  it("aprovar consome o pendente; rejeitar devolve ao disponível", async () => {
    const aprovado = new FakeFirestore();
    aprovado.seedDoc(WALLET_PATH, {availableReais: 60, pendingReais: 40});
    await releaseTournamentWithdrawalReservation(
      aprovado as unknown as Firestore, TOURNAMENT, 40, true,
    );
    assert.equal(aprovado.store.get(WALLET_PATH)!["availableReais"], 60);
    assert.equal(aprovado.store.get(WALLET_PATH)!["pendingReais"], 0);

    const rejeitado = new FakeFirestore();
    rejeitado.seedDoc(WALLET_PATH, {availableReais: 60, pendingReais: 40});
    await releaseTournamentWithdrawalReservation(
      rejeitado as unknown as Firestore, TOURNAMENT, 40, false,
    );
    assert.equal(rejeitado.store.get(WALLET_PATH)!["availableReais"], 100);
    assert.equal(rejeitado.store.get(WALLET_PATH)!["pendingReais"], 0);
  });

  it("validação recusa pagar mais do que está reservado", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(WALLET_PATH, {availableReais: 0, pendingReais: 10});
    await assert.rejects(
      () => assertTournamentWithdrawalReservationValid(
        fake as unknown as Firestore, TOURNAMENT, 40,
      ),
      /WITHDRAWAL_RESERVATION_INVALID/,
    );
  });

  it("validação recusa PIX de caixa com saldo negativo", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(WALLET_PATH, {availableReais: -5, pendingReais: 40});
    await assert.rejects(
      () => assertTournamentWithdrawalReservationValid(
        fake as unknown as Firestore, TOURNAMENT, 40,
      ),
      /WALLET_STATE_INVALID/,
    );
  });
});
