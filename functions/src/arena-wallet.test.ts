import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  creditArenaWalletFromClubPayment,
  debitArenaWalletForClubRefund,
} from "./arena-wallet";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

function walletData(fake: FakeFirestore): Record<string, unknown> {
  return fake.store.get("arenaWallets/arena1") ?? {};
}

function ledgerEntries(fake: FakeFirestore): Record<string, unknown>[] {
  return [...fake.store.entries()]
    .filter(([path]) => path.startsWith("arenaWallets/arena1/ledger/"))
    .map(([, data]) => data);
}

describe("arena-wallet clubinho", () => {
  it("credita o líquido (bruto − taxa) e registra ledger com a sessão", async () => {
    const {fake, db} = makeDb();
    await creditArenaWalletFromClubPayment(db, "arena1", {
      sessionId: "club_c1_2026-07-24",
      participantId: "uid1",
      grossReais: 15,
      platformFeeReais: 0.75,
    });

    assert.equal(walletData(fake)["availableReais"], 14.25);
    const entries = ledgerEntries(fake);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!["type"], "credit");
    assert.equal(entries[0]!["source"], "club");
    assert.equal(entries[0]!["clubSessionId"], "club_c1_2026-07-24");
    assert.equal(entries[0]!["netReais"], 14.25);
    assert.equal(entries[0]!["platformFeeReais"], 0.75);
  });

  it("debita o líquido no estorno, podendo ficar negativo", async () => {
    const {fake, db} = makeDb();
    await creditArenaWalletFromClubPayment(db, "arena1", {
      sessionId: "club_c1_2026-07-24",
      participantId: "uid1",
      grossReais: 15,
      platformFeeReais: 0.75,
    });
    // Simula saque anterior: saldo abaixo do crédito.
    fake.seedDoc("arenaWallets/arena1", {arenaId: "arena1", availableReais: 5, pendingReais: 0});

    await debitArenaWalletForClubRefund(db, "arena1", {
      sessionId: "club_c1_2026-07-24",
      participantId: "uid1",
      netReais: 14.25,
    });

    assert.equal(walletData(fake)["availableReais"], -9.25);
    const refund = ledgerEntries(fake).find((e) => e["type"] === "refund");
    assert.ok(refund);
    assert.equal(refund!["netReais"], -14.25);
    assert.equal(refund!["participantId"], "uid1");
  });

  it("ignora débito de valor não positivo", async () => {
    const {fake, db} = makeDb();
    await debitArenaWalletForClubRefund(db, "arena1", {
      sessionId: "s",
      participantId: "u",
      netReais: 0,
    });
    assert.equal(fake.store.size, 0);
  });
});
