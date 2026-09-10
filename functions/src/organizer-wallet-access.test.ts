import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  listAccessibleOrganizerIds,
  assertCanAccessOrganizerWallet,
  maskDelegatePayoutPixKey,
  resolveWithdrawalPixSource,
} from "./organizer-wallet-access";

const OWNER = "ownerUid";
const STAFF = "staffUid";
const OTHER = "outsiderUid";

function fakeWith(
  entries: Array<[string, Record<string, unknown>]>,
): Firestore {
  const fake = new FakeFirestore();
  for (const [path, data] of entries) fake.store.set(path, data);
  return fake as unknown as Firestore;
}

describe("listAccessibleOrganizerIds", () => {
  it("sem equipe, só a própria carteira", async () => {
    const db = fakeWith([]);
    assert.deepEqual(await listAccessibleOrganizerIds(db, STAFF), [STAFF]);
  });

  it("gestor ativo enxerga a carteira do dono do torneio", async () => {
    const db = fakeWith([
      [`users/${STAFF}/tournamentStaff/t1`, {role: "manager", status: "active"}],
      ["tournaments/t1", {managerId: OWNER}],
    ]);
    assert.deepEqual(await listAccessibleOrganizerIds(db, STAFF), [STAFF, OWNER]);
  });

  it("mesário não enxerga carteira nenhuma", async () => {
    const db = fakeWith([
      [`users/${STAFF}/tournamentStaff/t1`, {role: "scorer", status: "active"}],
      ["tournaments/t1", {managerId: OWNER}],
    ]);
    assert.deepEqual(await listAccessibleOrganizerIds(db, STAFF), [STAFF]);
  });

  it("gestor inativo perde o acesso", async () => {
    const db = fakeWith([
      [`users/${STAFF}/tournamentStaff/t1`, {role: "manager", status: "removed"}],
      ["tournaments/t1", {managerId: OWNER}],
    ]);
    assert.deepEqual(await listAccessibleOrganizerIds(db, STAFF), [STAFF]);
  });

  it("dois torneios do mesmo dono não duplicam a carteira", async () => {
    const db = fakeWith([
      [`users/${STAFF}/tournamentStaff/t1`, {role: "manager", status: "active"}],
      [`users/${STAFF}/tournamentStaff/t2`, {role: "manager", status: "active"}],
      ["tournaments/t1", {managerId: OWNER}],
      ["tournaments/t2", {managerId: OWNER}],
    ]);
    assert.deepEqual(await listAccessibleOrganizerIds(db, STAFF), [STAFF, OWNER]);
  });

  it("torneio apagado (espelho órfão) não quebra a lista", async () => {
    const db = fakeWith([
      [`users/${STAFF}/tournamentStaff/t1`, {role: "manager", status: "active"}],
    ]);
    assert.deepEqual(await listAccessibleOrganizerIds(db, STAFF), [STAFF]);
  });

  it("papel ausente conta como gestor, igual ao espelho", async () => {
    const db = fakeWith([
      [`users/${STAFF}/tournamentStaff/t1`, {status: "active"}],
      ["tournaments/t1", {managerId: OWNER}],
    ]);
    assert.deepEqual(await listAccessibleOrganizerIds(db, STAFF), [STAFF, OWNER]);
  });
});

describe("assertCanAccessOrganizerWallet", () => {
  it("a própria carteira passa sem ler nada", async () => {
    await assertCanAccessOrganizerWallet(fakeWith([]), OWNER, OWNER);
  });

  it("gestor da equipe passa", async () => {
    const db = fakeWith([
      [`users/${STAFF}/tournamentStaff/t1`, {role: "manager", status: "active"}],
      ["tournaments/t1", {managerId: OWNER}],
    ]);
    await assertCanAccessOrganizerWallet(db, STAFF, OWNER);
  });

  it("estranho é barrado", async () => {
    const db = fakeWith([["tournaments/t1", {managerId: OWNER}]]);
    await assert.rejects(
      () => assertCanAccessOrganizerWallet(db, OTHER, OWNER),
      (err: unknown) => (err as {code?: string}).code === "permission-denied",
    );
  });

  it("mesário é barrado", async () => {
    const db = fakeWith([
      [`users/${STAFF}/tournamentStaff/t1`, {role: "scorer", status: "active"}],
      ["tournaments/t1", {managerId: OWNER}],
    ]);
    await assert.rejects(
      () => assertCanAccessOrganizerWallet(db, STAFF, OWNER),
      (err: unknown) => (err as {code?: string}).code === "permission-denied",
    );
  });
});

describe("maskDelegatePayoutPixKey", () => {
  it("mostra só as pontas da chave do dono", () => {
    assert.equal(maskDelegatePayoutPixKey("12345678901"), "123••••••01");
    assert.equal(maskDelegatePayoutPixKey("dono@nexago.com.br"), "don••••••br");
  });

  it("chave curta some inteira e chave vazia continua vazia", () => {
    assert.equal(maskDelegatePayoutPixKey("abcd"), "••••");
    assert.equal(maskDelegatePayoutPixKey("   "), "");
  });
});

describe("resolveWithdrawalPixSource", () => {
  const OWNER_KEY = "11122233344";
  const OWNER_TYPE = "CPF";

  it("saque delegado ignora a chave que o gestor mandou", () => {
    const out = resolveWithdrawalPixSource({
      delegated: true,
      walletPixKey: OWNER_KEY,
      walletPixKeyType: OWNER_TYPE,
      payloadPixKey: "99988877766",
      payloadPixKeyType: "EMAIL",
    });
    assert.deepEqual(out, {pixKey: OWNER_KEY, pixKeyType: OWNER_TYPE});
  });

  it("saque delegado sem chave do dono não acontece", () => {
    assert.throws(
      () =>
        resolveWithdrawalPixSource({
          delegated: true,
          walletPixKey: "",
          walletPixKeyType: "",
          payloadPixKey: "99988877766",
        }),
      (err: unknown) => (err as {code?: string}).code === "failed-precondition",
    );
  });

  it("dono continua podendo mandar a chave no payload", () => {
    const out = resolveWithdrawalPixSource({
      delegated: false,
      walletPixKey: OWNER_KEY,
      walletPixKeyType: OWNER_TYPE,
      payloadPixKey: "outro@email.com",
      payloadPixKeyType: "email",
    });
    assert.deepEqual(out, {pixKey: "outro@email.com", pixKeyType: "EMAIL"});
  });

  it("dono sem chave no payload cai na chave da carteira", () => {
    const out = resolveWithdrawalPixSource({
      delegated: false,
      walletPixKey: OWNER_KEY,
      walletPixKeyType: OWNER_TYPE,
    });
    assert.deepEqual(out, {pixKey: OWNER_KEY, pixKeyType: OWNER_TYPE});
  });

  it("dono sem chave nenhuma é barrado como antes", () => {
    assert.throws(
      () =>
        resolveWithdrawalPixSource({
          delegated: false,
          walletPixKey: "",
          walletPixKeyType: "",
        }),
      (err: unknown) => (err as {code?: string}).code === "invalid-argument",
    );
  });
});
