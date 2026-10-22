import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  approveReceivingCore,
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
/** Subconta criada pelo centro e adotada sem apiKey (o caso do CT nexaGO em 22/10). */
function seedManualFollowUp() {
  const fake = seed();
  fake.seedDoc("trainingCenters/p", {name: "Pendente", status: "pending", receivingStatus: "pending"});
  fake.seedDoc("trainingCenterReceiving/p", {walletId: "wal-0000-1111-2222", asaasEnv: "production", source: "self", status: "pending"});
  fake.seedDoc("trainingCenters/p/receivingAccount/current", {status: "pending", source: "self", name: "CT Teste", manualFollowUp: true, documents: []});
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
    assert.deepEqual(detail.receiving, {wallet: "••••78-xyz", asaasEnv: "sandbox", feePercent: 5, status: "approved", source: "manual", manualFollowUp: false});
    assert.equal(maskWallet(""), "");
  });

  it("subconta adotada sem apiKey: lista e detalhe sinalizam o acompanhamento manual", async () => {
    const fake = seedManualFollowUp();
    const db = fake as unknown as Firestore;
    const {centers} = await listCentersCore(db);
    assert.equal(centers.find((c) => c.id === "p")!.receivingManualFollowUp, true);
    assert.equal(centers.find((c) => c.id === "p")!.receivingStatus, "pending");
    assert.equal(centers.find((c) => c.id === "a")!.receivingManualFollowUp, false);
    const detail = await getCenterCore(db, "p");
    assert.equal(detail.receiving!.manualFollowUp, true);
    assert.equal(detail.receiving!.source, "self");
  });

  it("aprovar no backoffice liga o recebimento, tira do acompanhamento e da varredura, sem trocar a carteira", async () => {
    const fake = seedManualFollowUp();
    const db = fake as unknown as Firestore;
    await approveReceivingCore(db, {centerId: "p", status: "approved"}, ACTOR, NOW);
    const rec = fake.store.get("trainingCenterReceiving/p")!;
    assert.equal(rec["walletId"], "wal-0000-1111-2222");
    assert.equal(rec["status"], "approved");
    assert.equal(rec["source"], "manual");
    assert.equal(rec["updatedBy"], "bo1");
    const center = fake.store.get("trainingCenters/p")!;
    assert.equal(center["receivingConnected"], true);
    assert.equal(center["receivingStatus"], "approved");
    const mirror = fake.store.get("trainingCenters/p/receivingAccount/current")!;
    assert.equal(mirror["status"], "approved");
    assert.equal(mirror["manualFollowUp"], false);
    assert.deepEqual(mirror["documents"], []);
    assert.equal(mirror["name"], "CT Teste"); // merge: o resto do espelho fica
    const log = audit(fake, "p");
    assert.equal(log.length, 1);
    assert.equal(log[0]!["action"], "center.receiving_approved");
    assert.match(String(log[0]!["detail"]), /aprovada.*••••1-2222/);
    const {centers} = await listCentersCore(db);
    assert.equal(centers.find((c) => c.id === "p")!.receivingManualFollowUp, false);
  });

  it("recusar desliga o recebimento e mantém a origem da subconta", async () => {
    const fake = seedManualFollowUp();
    fake.seedDoc("trainingCenters/p", {name: "Pendente", status: "pending", receivingStatus: "pending", receivingConnected: true});
    await approveReceivingCore(fake as unknown as Firestore, {centerId: "p", status: "rejected"}, ACTOR, NOW);
    assert.equal(fake.store.get("trainingCenterReceiving/p")!["source"], "self");
    assert.equal(fake.store.get("trainingCenterReceiving/p")!["status"], "rejected");
    assert.equal(fake.store.get("trainingCenters/p")!["receivingConnected"], false);
    assert.equal(fake.store.get("trainingCenters/p")!["receivingStatus"], "rejected");
    assert.equal(fake.store.get("trainingCenters/p/receivingAccount/current")!["status"], "rejected");
    assert.equal(fake.store.get("trainingCenters/p/receivingAccount/current")!["manualFollowUp"], false);
    assert.equal(audit(fake, "p")[0]!["action"], "center.receiving_rejected");
  });

  it("aprovar exige carteira gravada, situação válida e centro existente", async () => {
    const fake = seed();
    const db = fake as unknown as Firestore;
    await assert.rejects(approveReceivingCore(db, {centerId: "p", status: "approved"}, ACTOR, NOW), /carteira/);
    assert.equal(fake.store.get("trainingCenters/p")!["receivingConnected"], undefined);
    assert.equal(audit(fake, "p").length, 0);
    await assert.rejects(approveReceivingCore(db, {centerId: "p", status: "pending"}, ACTOR, NOW), /Situação/);
    await assert.rejects(approveReceivingCore(db, {centerId: "zz", status: "approved"}, ACTOR, NOW), /não encontrado/);
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
