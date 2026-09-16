import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {savePayoutPixKey, loadPayoutPixKey} from "./organizer-payout-profile";

const UID = "pessoaUid";

describe("perfil de repasse do organizador", () => {
  it("grava e lê a chave da pessoa", async () => {
    const fake = new FakeFirestore();
    await savePayoutPixKey(fake as unknown as Firestore, UID, {
      pixKey: "pessoa@exemplo.com", pixKeyType: "EMAIL",
    });

    assert.equal(
      fake.store.get(`organizerPayoutProfiles/${UID}`)!["payoutPixKey"],
      "pessoa@exemplo.com",
    );
    assert.deepEqual(await loadPayoutPixKey(fake as unknown as Firestore, UID), {
      pixKey: "pessoa@exemplo.com", pixKeyType: "EMAIL",
    });
  });

  it("sem perfil, aproveita a chave já cadastrada na carteira antiga", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(`organizerWallets/${UID}`, {
      payoutPixKey: "11999998888", payoutPixKeyType: "PHONE",
    });

    assert.deepEqual(await loadPayoutPixKey(fake as unknown as Firestore, UID), {
      pixKey: "11999998888", pixKeyType: "PHONE",
    });
  });

  it("sem chave em lugar nenhum devolve vazio", async () => {
    const fake = new FakeFirestore();
    assert.deepEqual(await loadPayoutPixKey(fake as unknown as Firestore, UID), {
      pixKey: "", pixKeyType: "",
    });
  });
});
