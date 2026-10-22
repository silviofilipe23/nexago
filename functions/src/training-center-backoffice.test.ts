import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  getCenterCore,
  listCentersCore,
  maskWallet,
  setReceivingCore,
  setStatusCore,
  setSubscriptionCore,
} from "./training-center-backoffice";

const NOW = new Date("2026-10-22T15:00:00Z");
const ACTOR = {uid: "bo1", name: "Silvio"};

function seed() {
  const fake = new FakeFirestore();
  fake.seedDoc("trainingCenters/a", {name: "Ativo", status: "active", activatedAt: Timestamp.fromMillis(1)});
  fake.seedDoc("trainingCenters/p", {name: "Pendente", status: "pending"});
  fake.seedDoc("trainingCenters/r", {name: "Pediu ativação", status: "pending", activationRequestedAt: Timestamp.fromMillis(5)});
  fake.seedDoc("trainingCenters/s", {name: "Suspenso", status: "suspended"});
  fake.seedDoc("trainingCenters/a/centerMembers/u1", {status: "active"});
  fake.seedDoc("trainingCenters/a/centerMembers/u2", {status: "revoked"});
  fake.seedDoc("trainingCenters/a/students/s1", {name: "X"});
  fake.seedDoc("trainingCenters/a/classes/k1", {status: "active"});
  fake.seedDoc("trainingCenters/a/classes/k2", {status: "draft"});
  return fake;
}
const audit = (fake: FakeFirestore, c: string) =>
  [...fake.store.entries()].filter(([p]) => p.startsWith(`trainingCenters/${c}/auditLogs/`)).map(([, d]) => d);

describe("training-center backoffice", () => {
  it("lista com pedido de ativação primeiro e contagens reais", async () => {
    const {centers} = await listCentersCore(seed() as unknown as Firestore);
    assert.deepEqual(centers.map((c) => c.id), ["r", "p", "s", "a"]);
    assert.deepEqual(centers.find((c) => c.id === "a")!.counts, {members: 1, students: 1, activeClasses: 1});
  });

  it("ativar grava activatedAt uma vez e audita; suspender exige motivo", async () => {
    const fake = seed();
    const db = fake as unknown as Firestore;
    await setStatusCore(db, {centerId: "p", status: "active"}, ACTOR, NOW);
    const p = fake.store.get("trainingCenters/p")!;
    assert.equal(p["status"], "active");
    assert.equal((p["activatedAt"] as Timestamp).toMillis(), NOW.getTime());
    assert.match(String(audit(fake, "p")[0]!["detail"]), /pendente → ativo/);
    await assert.rejects(setStatusCore(db, {centerId: "p", status: "suspended", reason: ""}, ACTOR, NOW), /motivo/);
    await setStatusCore(db, {centerId: "p", status: "suspended", reason: "Assinatura vencida"}, ACTOR, NOW);
    assert.equal(fake.store.get("trainingCenters/p")!["suspendedReason"], "Assinatura vencida");
    // reativar mantém a data da primeira ativação
    await setStatusCore(db, {centerId: "a", status: "suspended", reason: "teste"}, ACTOR, NOW);
    await setStatusCore(db, {centerId: "a", status: "active"}, ACTOR, NOW);
    assert.equal((fake.store.get("trainingCenters/a")!["activatedAt"] as Timestamp).toMillis(), 1);
  });

  it("mesma situação não grava nem audita", async () => {
    const fake = seed();
    await setStatusCore(fake as unknown as Firestore, {centerId: "a", status: "active"}, ACTOR, NOW);
    assert.equal(audit(fake, "a").length, 0);
  });

  it("recebimento: valida carteira e taxa, liga receivingConnected e mascara no detalhe", async () => {
    const fake = seed();
    const db = fake as unknown as Firestore;
    await assert.rejects(setReceivingCore(db, {centerId: "p", walletId: "x"}, ACTOR, NOW), /Wallet/);
    await assert.rejects(setReceivingCore(db, {centerId: "p", walletId: "0b3c1d2e-1234-5678", feePercent: 50}, ACTOR, NOW), /Taxa/);
    await setReceivingCore(db, {centerId: "p", walletId: "abc-12345678-xyz", asaasEnv: "sandbox", feePercent: 5}, ACTOR, NOW);
    assert.equal(fake.store.get("trainingCenters/p")!["receivingConnected"], true);
    assert.equal(fake.store.get("trainingCenterReceiving/p")!["walletId"], "abc-12345678-xyz");
    const detail = await getCenterCore(db, "p");
    assert.deepEqual(detail.receiving, {wallet: "••••78-xyz", asaasEnv: "sandbox", feePercent: 5});
    assert.equal(maskWallet(""), "");
  });

  it("assinatura: valida e grava o bloco que o portal lê", async () => {
    const fake = seed();
    const db = fake as unknown as Firestore;
    await assert.rejects(setSubscriptionCore(db, {centerId: "s", plan: "Pro", status: "x"}, ACTOR, NOW), /assinatura/);
    await setSubscriptionCore(db, {centerId: "s", plan: "Centro Essencial", status: "past_due", openInvoiceCents: 24900, dueDate: "2026-10-10", attempts: "3 · cartão recusado"}, ACTOR, NOW);
    assert.deepEqual(fake.store.get("trainingCenters/s")!["subscription"], {
      plan: "Centro Essencial", status: "past_due", openInvoiceCents: 24900, dueDate: "2026-10-10", attempts: "3 · cartão recusado",
    });
  });

  it("detalhe de centro inexistente é not-found", async () => {
    await assert.rejects(getCenterCore(seed() as unknown as Firestore, "zz"), /não encontrado/);
  });
});
