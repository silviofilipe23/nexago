import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {creditOrganizerWalletFromRegistration} from "./organizer-wallet";

const ORGANIZER = "org1";
const WALLET_PATH = `organizerWallets/${ORGANIZER}`;

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
  await creditOrganizerWalletFromRegistration(
    fake as unknown as Firestore,
    ORGANIZER,
    {
      registrationId: "reg1",
      payerUid: "uidA",
      paymentId: "pay1",
      ...params,
    },
  );
}

describe("creditOrganizerWalletFromRegistration: taxa do gateway", () => {
  it("desconta a taxa do cartão do líquido do organizador", async () => {
    const fake = new FakeFirestore();

    await credit(fake, {
      grossReais: 100,
      platformFeeReais: 8,
      gatewayFeeReais: 3.29,
    });

    assert.equal(fake.store.get(WALLET_PATH)!["availableReais"], 88.71);
    const entry = ledgerEntry(fake);
    assert.equal(entry["gatewayFeeReais"], 3.29);
    assert.equal(entry["netReais"], 88.71);
    assert.equal(entry["grossReais"], 100);
  });

  it("sem taxa de gateway credita como sempre (caminho do PIX)", async () => {
    const fake = new FakeFirestore();

    await credit(fake, {grossReais: 100, platformFeeReais: 8});

    assert.equal(fake.store.get(WALLET_PATH)!["availableReais"], 92);
    assert.equal(ledgerEntry(fake)["gatewayFeeReais"], 0);
  });

  it("nunca credita negativo", async () => {
    const fake = new FakeFirestore();

    await credit(fake, {
      grossReais: 10,
      platformFeeReais: 8,
      gatewayFeeReais: 5,
    });

    assert.equal(fake.store.get(WALLET_PATH)!["availableReais"], 0);
  });
});
