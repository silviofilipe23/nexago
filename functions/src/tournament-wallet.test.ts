import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {creditTournamentWalletFromRegistration} from "./tournament-wallet";

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
