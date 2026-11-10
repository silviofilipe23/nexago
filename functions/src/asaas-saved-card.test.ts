import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {HttpsError} from "firebase-functions/v2/https";
import {AsaasApiError} from "./asaas-client";
import {makeDb} from "./arena-schedule.test-helper";
import {
  CARD_ATTEMPTS_MESSAGE,
  CARD_INVALID_MESSAGE,
  CARD_REFUSED_TOKENIZE_MESSAGE,
  cardValidForDueDate,
  getMyPaymentCardCore,
  readSavedCard,
  saveMyPaymentCardCore,
  type SavedCardDeps,
} from "./asaas-saved-card";

const CARD_NUMBER = "4111111111111111";
const CCV = "123";

type Data = Record<string, unknown>;

function validInput(over: Data = {}): Data {
  return {
    number: "4111 1111 1111 1111", holderName: "Maria Souza", expiryMonth: "12", expiryYear: "2099",
    ccv: CCV, postalCode: "74000-000", addressNumber: "10", ...over,
  };
}

function fakeDeps(over: Partial<SavedCardDeps> & {tokenizeCalls?: unknown[]; clock?: {t: Date}} = {}): SavedCardDeps {
  const clock = over.clock ?? {t: new Date("2026-11-10T12:00:00Z")};
  return {
    resolveCustomer: async () => "cus_1",
    registerCustomer: async () => "cus_1",
    holderInfo: async () => ({name: "Maria Souza", email: "m@x.com", cpfCnpj: "52998224725", phone: "62999990000"}),
    tokenize: async (input) => {
      over.tokenizeCalls?.push(input);
      return {creditCardToken: "tok_1", creditCardBrand: "visa", creditCardNumber: "4242"};
    },
    now: () => clock.t,
    envTag: () => "sandbox",
    ...over,
  };
}

async function rejects(p: Promise<unknown>, code: string, message?: string): Promise<void> {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof HttpsError, `esperava HttpsError, veio ${String(e)}`);
    assert.equal(e.code, code);
    if (message != null) assert.equal(e.message, message);
    return true;
  });
}

describe("saveMyPaymentCardCore", () => {
  it("saves token, brand and last4 only", async () => {
    const {fake, db} = makeDb();
    const res = await saveMyPaymentCardCore(db, "u1", validInput(), "1.2.3.4", fakeDeps());
    assert.deepEqual(res, {brand: "VISA", last4: "4242"});
    const doc = fake.store.get("users/u1/asaas/savedCard")!;
    assert.deepEqual(Object.keys(doc).sort(), [
      "brand", "createdAt", "creditCardToken", "customerId", "env", "expiryMonth", "expiryYear",
      "holderName", "last4", "remoteIp", "updatedAt",
    ]);
    assert.equal(doc["env"], "sandbox");
    assert.equal(doc["remoteIp"], "1.2.3.4");
    assert.equal(doc["expiryMonth"], 12);
    assert.equal(doc["expiryYear"], 2099);
    const dump = JSON.stringify([...fake.store.entries()]);
    assert.ok(!dump.includes(CARD_NUMBER));
    assert.ok(!dump.includes(`"${CCV}"`));
  });

  it("rejects invalid input", async () => {
    const bad: Data[] = [
      {number: "4111111111111112"}, {expiryMonth: "13"}, {expiryYear: "2020"}, {ccv: "12"},
      {postalCode: "7400000"}, {addressNumber: ""},
    ];
    for (const over of bad) {
      const {db} = makeDb();
      const calls: unknown[] = [];
      await rejects(saveMyPaymentCardCore(db, "u1", validInput(over), "1.2.3.4", fakeDeps({tokenizeCalls: calls})),
        "invalid-argument", CARD_INVALID_MESSAGE);
      assert.equal(calls.length, 0);
    }
  });

  it("asks for CPF", async () => {
    const {db} = makeDb();
    await rejects(saveMyPaymentCardCore(db, "u1", validInput(), "1.2.3.4", fakeDeps({resolveCustomer: async () => null})),
      "failed-precondition", "Informe seu CPF para pagar online.");

    const registered: unknown[][] = [];
    const deps = fakeDeps({
      resolveCustomer: async () => null,
      registerCustomer: async (uid, cpf) => {
        registered.push([uid, cpf]);
        return "cus_9";
      },
    });
    const res = await saveMyPaymentCardCore(db, "u1", validInput({cpfCnpj: "52998224725"}), "1.2.3.4", deps);
    assert.deepEqual(registered, [["u1", "52998224725"]]);
    assert.equal(res.last4, "4242");

    await rejects(saveMyPaymentCardCore(db, "u2", validInput({cpfCnpj: "123"}), "1.2.3.4", deps),
      "invalid-argument", "CPF inválido. Confira os números.");
  });

  it("limits to 5 attempts per 24h", async () => {
    const {fake, db} = makeDb();
    const clock = {t: new Date("2026-11-10T12:00:00Z")};
    const deps = fakeDeps({clock, tokenize: async () => {
      throw new AsaasApiError("Cartão recusado pela operadora.", 400);
    }});
    for (let i = 0; i < 5; i++) {
      await rejects(saveMyPaymentCardCore(db, "u1", validInput(), "1.2.3.4", deps), "invalid-argument");
    }
    await rejects(saveMyPaymentCardCore(db, "u1", validInput(), "1.2.3.4", deps), "resource-exhausted", CARD_ATTEMPTS_MESSAGE);
    assert.equal(fake.store.get("users/u1/asaas/savedCardAttempts")!["count"], 5);

    clock.t = new Date("2026-11-11T12:00:01Z");
    await rejects(saveMyPaymentCardCore(db, "u1", validInput(), "1.2.3.4", deps), "invalid-argument");
    assert.equal(fake.store.get("users/u1/asaas/savedCardAttempts")!["count"], 1);
  });

  it("maps Asaas refusal", async () => {
    const {db} = makeDb();
    await rejects(saveMyPaymentCardCore(db, "u1", validInput(), "1.2.3.4", fakeDeps({
      tokenize: async () => {
        throw new AsaasApiError("Cartão recusado pela operadora.", 400);
      },
    })), "invalid-argument", "Cartão recusado pela operadora.");
    await rejects(saveMyPaymentCardCore(db, "u1", validInput(), "1.2.3.4", fakeDeps({
      tokenize: async () => {
        throw new AsaasApiError("", 400);
      },
    })), "invalid-argument", CARD_REFUSED_TOKENIZE_MESSAGE);
    await rejects(saveMyPaymentCardCore(db, "u1", validInput(), "1.2.3.4", fakeDeps({
      tokenize: async () => {
        throw new Error("boom");
      },
    })), "internal");
  });

  it("replaces previous card", async () => {
    const {fake, db} = makeDb();
    await saveMyPaymentCardCore(db, "u1", validInput(), "1.2.3.4", fakeDeps());
    await saveMyPaymentCardCore(db, "u1", validInput(), "1.2.3.4", fakeDeps({
      tokenize: async () => ({creditCardToken: "tok_2", creditCardBrand: "MASTERCARD", creditCardNumber: "0001"}),
    }));
    const doc = fake.store.get("users/u1/asaas/savedCard")!;
    assert.equal(doc["creditCardToken"], "tok_2");
    assert.equal(doc["last4"], "0001");
  });
});

describe("readSavedCard", () => {
  it("ignores other env", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("users/u1/asaas/savedCard", {creditCardToken: "t", env: "production", last4: "1111"});
    assert.equal(await readSavedCard(db, "u1", "sandbox"), null);
    assert.equal(await getMyPaymentCardCore(db, "u1", "sandbox"), null);
    assert.equal((await readSavedCard(db, "u1", "production"))?.creditCardToken, "t");
  });
});

describe("cardValidForDueDate", () => {
  it("compares year and month", () => {
    assert.equal(cardValidForDueDate({expiryMonth: 12, expiryYear: 2026}, "2026-12-05"), true);
    assert.equal(cardValidForDueDate({expiryMonth: 12, expiryYear: 2026}, "2027-01-05"), false);
  });
});
